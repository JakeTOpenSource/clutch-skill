#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { digestObject } from "../clutch/scripts/card-gate.mjs";
import {
  approvalSubjectDigest,
  evaluateRepeatability,
  outcomeDigest,
  preregistrationDigest,
  recordDigest,
  receiptDigest,
  requestBindingDigest,
  responseBindingDigest,
} from "./repeatability-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const preregistration = JSON.parse(readFileSync(join(root, "evidence", "clutch-v2-repeatability-plan", "preregistration.json"), "utf8"));
const sourceRegister = JSON.parse(readFileSync(join(root, "evidence", "clutch-v2-repeatability-plan", "source-register.json"), "utf8"));

function fakeDigest(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function armOrder(seed, taskIndex) {
  const first = (seed + taskIndex) % 2 === 0 ? "FULL_HISTORY" : "CLUTCH";
  return [first, first === "FULL_HISTORY" ? "CLUTCH" : "FULL_HISTORY"];
}

function initialState(wave, task, arm) {
  if (arm === "CLUTCH") {
    return digestObject({
      schema_version: "clutch-advisor-release-state.v1",
      arm,
      replication_id: wave.replication_id,
      task_id: task.task_id,
      advisor_response_digest: wave.advisor_response_digest,
      card_set_digest: wave.card_set_digest,
      first_phase_card_digest: task.phase_cards.PHASE_1_TERRA,
    });
  }
  return digestObject({
    schema_version: "clutch-history-release-state.v1",
    arm,
    replication_id: wave.replication_id,
    task_id: task.task_id,
    source_freeze_digest: wave.source_freeze_digest,
    task_source_digest: task.source_digest,
  });
}

function transitionDirection(fromProfile, toProfile, prereg = preregistration) {
  const from = prereg.design.study_model_profiles[fromProfile].capability_rank;
  const to = prereg.design.study_model_profiles[toProfile].capability_rank;
  return to > from ? "UPGRADE" : to < from ? "DOWNGRADE" : "STABLE";
}

function sealReceipt(receipt) {
  receipt.receipt_digest = receiptDigest(receipt);
  return receipt;
}

function approveManifest(manifest) {
  const receipt = {
    schema_version: "clutch-batch-approval-receipt.v1",
    approval_id: "approval-clutch-v2-repeatability-001",
    actor_id: "owner",
    decision: "APPROVED",
    approved_phase_card_count: preregistration.design.total_waves * preregistration.design.tasks_per_wave * 2,
    subject_digest: approvalSubjectDigest(manifest),
    receipt_digest: "",
  };
  manifest.batch_approval_receipt = sealReceipt(receipt);
  return manifest;
}

function buildManifest() {
  const manifest = {
    schema_version: "clutch-repeatability-execution-manifest.v3",
    study_id: preregistration.study_id,
    preregistration_digest: preregistrationDigest(preregistration),
    status: "FROZEN_AFTER_BATCH_APPROVAL",
    waves: preregistration.design.wave_schedule.map((scheduled) => {
      const wave = {
        schema_version: "clutch-repeatability-wave-manifest.v2",
        replication_id: scheduled.replication_id,
        sequence_index: scheduled.sequence_index,
        context_interval_id: scheduled.context_interval_id,
        advisor_profile: scheduled.advisor_profile,
        advisor_model: scheduled.advisor_model,
        primary_for_repeatability: scheduled.primary_for_repeatability,
        pre_handoff_history_bytes: scheduled.pre_handoff_history_bytes,
        arm_order_seed: scheduled.arm_order_seed,
        task_family_ids: scheduled.task_family_ids,
        task_variant_ids: scheduled.task_variant_ids,
        source_freeze_digest: fakeDigest(`${scheduled.replication_id}:source-freeze`),
        advisor_request_digest: fakeDigest(`${scheduled.replication_id}:advisor-request`),
        advisor_response_digest: fakeDigest(`${scheduled.replication_id}:advisor-response`),
        card_set_digest: fakeDigest(`${scheduled.replication_id}:card-set`),
        tasks: [],
      };
      wave.tasks = Array.from({ length: preregistration.design.tasks_per_wave }, (_, taskIndex) => {
        const task = {
          schema_version: "clutch-repeatability-task-manifest.v2",
          task_id: `T${String(taskIndex + 1).padStart(2, "0")}`,
          family_id: scheduled.task_family_ids[taskIndex],
          variant_id: scheduled.task_variant_ids[taskIndex],
          source_digest: fakeDigest(`${scheduled.replication_id}:T${taskIndex + 1}:source`),
          hidden_test_digest: fakeDigest(`${scheduled.replication_id}:T${taskIndex + 1}:hidden`),
          phase_cards: {
            PHASE_1_TERRA: fakeDigest(`${scheduled.replication_id}:T${taskIndex + 1}:terra-card`),
            PHASE_2_LUNA: fakeDigest(`${scheduled.replication_id}:T${taskIndex + 1}:luna-card`),
          },
          arm_initial_state_digests: {},
          arm_order: armOrder(scheduled.arm_order_seed, taskIndex),
        };
        task.arm_initial_state_digests = {
          FULL_HISTORY: initialState(wave, task, "FULL_HISTORY"),
          CLUTCH: initialState(wave, task, "CLUTCH"),
        };
        return task;
      });
      return wave;
    }),
    batch_approval_receipt: null,
  };
  return approveManifest(manifest);
}

function phaseReceipt({ wave, task, arm, phaseId, fromPhase, fromProfile, toProfile, stateDigest, phaseCardDigest, approvalDigest }) {
  const profiles = preregistration.design.study_model_profiles;
  return sealReceipt({
    schema_version: "model-phase-receipt.v1",
    transition_id: `${wave.replication_id}:${task.task_id}:${arm}:${phaseId}`,
    from_phase: fromPhase,
    to_phase: phaseId,
    direction: transitionDirection(fromProfile, toProfile),
    from_profile: fromProfile,
    from_model: profiles[fromProfile].model,
    to_profile: toProfile,
    to_model: profiles[toProfile].model,
    state_out_digest: stateDigest,
    state_in_digest: stateDigest,
    phase_card_digest: phaseCardDigest,
    approval_receipt_digest: approvalDigest,
    status: "COMPLETE",
    receipt_digest: "",
  });
}

function callReceipt({ wave, task, arm, sequence, previousCallReceiptDigest, phaseId, workerStep, profile, transition, phaseCardDigest, phaseTransitionDigest, stateIn, stateOut, status = "COMPLETE" }) {
  const call = {
    schema_version: "clutch-repeatability-call-receipt.v3",
    call_id: `${wave.replication_id}:${task.task_id}:${arm}:${workerStep}`,
    call_sequence: sequence,
    previous_call_receipt_digest: previousCallReceiptDigest,
    phase_id: phaseId,
    worker_step: workerStep,
    model_profile: profile,
    model: preregistration.design.study_model_profiles[profile].model,
    transition,
    phase_card_digest: phaseCardDigest,
    phase_transition_digest: phaseTransitionDigest,
    state_in_digest: stateIn,
    state_out_digest: stateOut,
    request_digest: fakeDigest(`${wave.replication_id}:${task.task_id}:${arm}:${workerStep}:request`),
    request_binding_digest: "",
    response_digest: fakeDigest(`${wave.replication_id}:${task.task_id}:${arm}:${workerStep}:response`),
    provider_response_id: `resp_${wave.replication_id}_${task.task_id}_${arm}_${workerStep}`,
    response_binding_digest: "",
    status,
    receipt_digest: "",
  };
  call.request_binding_digest = requestBindingDigest(call);
  call.response_binding_digest = responseBindingDigest(call);
  return sealReceipt(call);
}

function buildOutcomes(manifest, options = {}) {
  const deliveryFailures = options.deliveryFailures ?? new Set();
  const callFailures = options.callFailures ?? new Set();
  const records = [];
  const approvalDigest = manifest.batch_approval_receipt.receipt_digest;
  let callSequence = 0;
  let previousCallReceiptDigest = null;
  let recordSequence = 0;
  let previousRecordDigest = null;
  for (const wave of manifest.waves) {
    for (const task of wave.tasks) {
      for (const arm of task.arm_order) {
        const failed = deliveryFailures.has(`${wave.replication_id}:${task.task_id}:${arm}`);
        const phaseCard1 = arm === "CLUTCH" ? task.phase_cards.PHASE_1_TERRA : null;
        const phaseCard2 = arm === "CLUTCH" ? task.phase_cards.PHASE_2_LUNA : null;
        const recordApproval = arm === "CLUTCH" ? approvalDigest : null;
        const firstState = task.arm_initial_state_digests[arm];
        const firstPhase = phaseReceipt({
          wave,
          task,
          arm,
          phaseId: "PHASE_1_TERRA",
          fromPhase: "PHASE_0_ADVISOR",
          fromProfile: wave.advisor_profile,
          toProfile: "TERRA_WORKER",
          stateDigest: firstState,
          phaseCardDigest: phaseCard1,
          approvalDigest: recordApproval,
        });
        callSequence += 1;
        const buildState = fakeDigest(`${wave.replication_id}:${task.task_id}:${arm}:BUILD:state-out`);
        const build = callReceipt({
          wave,
          task,
          arm,
          sequence: callSequence,
          previousCallReceiptDigest,
          phaseId: "PHASE_1_TERRA",
          workerStep: "BUILD",
          profile: "TERRA_WORKER",
          transition: firstPhase.direction,
          phaseCardDigest: phaseCard1,
          phaseTransitionDigest: firstPhase.receipt_digest,
          stateIn: firstState,
          stateOut: buildState,
          status: callFailures.has(`${wave.replication_id}:${task.task_id}:${arm}:BUILD`) ? "TRANSPORT_FAILURE" : "COMPLETE",
        });
        previousCallReceiptDigest = build.receipt_digest;
        const secondPhase = phaseReceipt({
          wave,
          task,
          arm,
          phaseId: "PHASE_2_LUNA",
          fromPhase: "PHASE_1_TERRA",
          fromProfile: "TERRA_WORKER",
          toProfile: "LUNA_WORKER",
          stateDigest: buildState,
          phaseCardDigest: phaseCard2,
          approvalDigest: recordApproval,
        });
        callSequence += 1;
        const integrateState = fakeDigest(`${wave.replication_id}:${task.task_id}:${arm}:INTEGRATE:state-out`);
        const integrate = callReceipt({
          wave,
          task,
          arm,
          sequence: callSequence,
          previousCallReceiptDigest,
          phaseId: "PHASE_2_LUNA",
          workerStep: "INTEGRATE",
          profile: "LUNA_WORKER",
          transition: secondPhase.direction,
          phaseCardDigest: phaseCard2,
          phaseTransitionDigest: secondPhase.receipt_digest,
          stateIn: buildState,
          stateOut: integrateState,
          status: callFailures.has(`${wave.replication_id}:${task.task_id}:${arm}:INTEGRATE`) ? "TRANSPORT_FAILURE" : "COMPLETE",
        });
        previousCallReceiptDigest = integrate.receipt_digest;
        callSequence += 1;
        const verifyState = fakeDigest(`${wave.replication_id}:${task.task_id}:${arm}:VERIFY:state-out`);
        const verify = callReceipt({
          wave,
          task,
          arm,
          sequence: callSequence,
          previousCallReceiptDigest,
          phaseId: "PHASE_2_LUNA",
          workerStep: "VERIFY",
          profile: "LUNA_WORKER",
          transition: "CONTINUE",
          phaseCardDigest: phaseCard2,
          phaseTransitionDigest: secondPhase.receipt_digest,
          stateIn: integrateState,
          stateOut: verifyState,
          status: callFailures.has(`${wave.replication_id}:${task.task_id}:${arm}:VERIFY`) ? "TRANSPORT_FAILURE" : "COMPLETE",
        });
        previousCallReceiptDigest = verify.receipt_digest;
        const testReceipt = sealReceipt({
          schema_version: "clutch-repeatability-test-receipt.v2",
          receipt_digest: "",
          source_digest: task.source_digest,
          hidden_test_digest: task.hidden_test_digest,
          final_state_digest: verifyState,
          total_assertions: 3,
          passed_assertions: failed ? 2 : 3,
          boundary_violations: 0,
        });
        recordSequence += 1;
        const record = {
          schema_version: "clutch-repeatability-record.v4",
          record_sequence: recordSequence,
          previous_record_digest: previousRecordDigest,
          record_digest: "",
          replication_id: wave.replication_id,
          task_id: task.task_id,
          family_id: task.family_id,
          variant_id: task.variant_id,
          arm,
          source_digest: task.source_digest,
          worker_profiles: ["TERRA_WORKER", "LUNA_WORKER"],
          worker_models: [preregistration.design.study_model_profiles.TERRA_WORKER.model, preregistration.design.study_model_profiles.LUNA_WORKER.model],
          phase_card_digests: arm === "CLUTCH" ? task.phase_cards : null,
          card_set_digest: arm === "CLUTCH" ? wave.card_set_digest : null,
          approval_receipt_digest: recordApproval,
          phase_transition_receipts: {
            PHASE_1_TERRA: firstPhase,
            PHASE_2_LUNA: secondPhase,
          },
          call_receipts: [build, integrate, verify],
          test_receipt: testReceipt,
        };
        record.record_digest = recordDigest(record);
        records.push(record);
        previousRecordDigest = record.record_digest;
      }
    }
  }
  const result = {
    schema_version: "clutch-repeatability-outcomes.v4",
    study_id: preregistration.study_id,
    status: options.status ?? "COMPLETE",
    manifest_digest: digestObject(manifest),
    call_stream_tip_digest: previousCallReceiptDigest,
    record_stream_tip_digest: previousRecordDigest,
    records,
    outcome_digest: "",
  };
  result.outcome_digest = outcomeDigest(result);
  return result;
}

assert.equal(sourceRegister.schema_version, "clutch-repeatability-source-register.v1");
for (const source of sourceRegister.sources.filter((entry) => entry.access === "PUBLIC_REPOSITORY")) {
  const bytes = readFileSync(join(root, ...source.locator.split("/")));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256, `${source.source_id}:SOURCE_DIGEST_MISMATCH`);
}
for (const source of sourceRegister.sources.filter((entry) => entry.access === "PUBLIC_WEB")) {
  assert.match(source.locator, /^https:\/\/developers\.openai\.com\//, `${source.source_id}:NON_OFFICIAL_REMOTE_SOURCE`);
}

const manifest = buildManifest();
const pass = evaluateRepeatability(buildOutcomes(manifest), preregistration, manifest);
assert.equal(pass.decision, "REPEATED_PASS", pass.reason);
assert.equal(pass.pass, true);
assert.equal(pass.wave_results.length, 43);
assert.ok(pass.context_interval_results.every((interval) => interval.independent_primary_waves === 14 && interval.pass));
assert.ok(pass.context_interval_results.every((interval) => interval.exact_one_sided_95_repeat_probability_lower_if_all_pass >= 0.8));
assert.equal(pass.alternate_advisor_stress.advisor_profile, "GPT55_ADVISOR");

const deliveryFailure = evaluateRepeatability(buildOutcomes(manifest, {
  deliveryFailures: new Set(["A01:T01:CLUTCH"]),
}), preregistration, manifest);
assert.equal(deliveryFailure.decision, "REPEATED_FAIL_DELIVERY");

const matchedFailure = evaluateRepeatability(buildOutcomes(manifest, {
  deliveryFailures: new Set(["A01:T01:FULL_HISTORY", "A01:T01:CLUTCH"]),
}), preregistration, manifest);
assert.equal(matchedFailure.decision, "REPEATED_FAIL_DELIVERY");

const alternateFailure = evaluateRepeatability(buildOutcomes(manifest, {
  deliveryFailures: new Set(["B-ALT-GPT55:T01:CLUTCH"]),
}), preregistration, manifest);
assert.equal(alternateFailure.decision, "REPEATED_FAIL_ALTERNATE_ADVISOR");

const incomplete = buildOutcomes(manifest, { status: "RESOURCE_STOP" });
incomplete.records = [];
assert.equal(evaluateRepeatability(incomplete, preregistration, manifest).decision, "INCOMPLETE_OR_INVALID");

const sourceTamper = buildOutcomes(manifest);
sourceTamper.records[0].source_digest = fakeDigest("wrong-source");
assert.match(evaluateRepeatability(sourceTamper, preregistration, manifest).reason, /SOURCE_DIGEST_MISMATCH/);

const continuityTamper = buildOutcomes(manifest);
const continuityRecord = continuityTamper.records[0];
continuityRecord.phase_transition_receipts.PHASE_2_LUNA.state_out_digest = fakeDigest("wrong-state");
continuityRecord.phase_transition_receipts.PHASE_2_LUNA.state_in_digest = continuityRecord.phase_transition_receipts.PHASE_2_LUNA.state_out_digest;
continuityRecord.phase_transition_receipts.PHASE_2_LUNA.receipt_digest = receiptDigest(continuityRecord.phase_transition_receipts.PHASE_2_LUNA);
continuityRecord.call_receipts[1].phase_transition_digest = continuityRecord.phase_transition_receipts.PHASE_2_LUNA.receipt_digest;
continuityRecord.call_receipts[2].phase_transition_digest = continuityRecord.phase_transition_receipts.PHASE_2_LUNA.receipt_digest;
assert.match(evaluateRepeatability(continuityTamper, preregistration, manifest).reason, /OUTGOING_STATE_MISMATCH/);

const phaseCardTamper = buildOutcomes(manifest);
phaseCardTamper.records.find((record) => record.arm === "CLUTCH").call_receipts[1].phase_card_digest = fakeDigest("wrong-phase-card");
assert.match(evaluateRepeatability(phaseCardTamper, preregistration, manifest).reason, /PHASE_CARD_MISMATCH/);

const externalTelemetry = buildOutcomes(manifest);
externalTelemetry.external_governance_telemetry = {
  total_cost_usd: 999999,
  alleged_savings_percent: -1000,
  cache_reads: "contradictory",
  human_review_ms: -1,
};
externalTelemetry.wave_reviews = "MALFORMED_EXTERNAL_DATA";
assert.equal(evaluateRepeatability(externalTelemetry, preregistration, manifest).decision, "REPEATED_PASS");

const orderTamper = buildOutcomes(manifest);
orderTamper.records[0].call_receipts[0].call_sequence += 1;
assert.match(evaluateRepeatability(orderTamper, preregistration, manifest).reason, /CALL_SEQUENCE_MISMATCH/);

const recordOrderTamper = buildOutcomes(manifest);
recordOrderTamper.records.reverse();
assert.match(evaluateRepeatability(recordOrderTamper, preregistration, manifest).reason, /RECORD_SEQUENCE_MISMATCH/);

const identitySwap = buildOutcomes(manifest);
const identitySwapLeft = identitySwap.records[0].call_receipts[0];
const identitySwapRight = identitySwap.records[0].call_receipts[1];
for (const field of ["request_digest", "response_digest", "provider_response_id"]) {
  [identitySwapLeft[field], identitySwapRight[field]] = [identitySwapRight[field], identitySwapLeft[field]];
}
assert.match(evaluateRepeatability(identitySwap, preregistration, manifest).reason, /REQUEST_BINDING_MISMATCH/);

const requestSubstitution = buildOutcomes(manifest);
requestSubstitution.records.find((record) => record.arm === "CLUTCH").call_receipts[0].request_digest = fakeDigest("arbitrary-unbound-request");
assert.match(evaluateRepeatability(requestSubstitution, preregistration, manifest).reason, /REQUEST_BINDING_MISMATCH/);

const legitimateCallFailure = buildOutcomes(manifest, {
  callFailures: new Set(["A01:T01:CLUTCH:BUILD"]),
});
assert.equal(evaluateRepeatability(legitimateCallFailure, preregistration, manifest).decision, "REPEATED_FAIL_DELIVERY");
const statusPromotionTamper = structuredClone(legitimateCallFailure);
statusPromotionTamper.records.find((record) => record.replication_id === "A01" && record.task_id === "T01" && record.arm === "CLUTCH").call_receipts[0].status = "COMPLETE";
assert.match(evaluateRepeatability(statusPromotionTamper, preregistration, manifest).reason, /RESPONSE_BINDING_MISMATCH/);

const streamTipTamper = buildOutcomes(manifest);
streamTipTamper.call_stream_tip_digest = fakeDigest("wrong-call-stream-tip");
assert.match(evaluateRepeatability(streamTipTamper, preregistration, manifest).reason, /CALL_STREAM_TIP_MISMATCH/);

const receiptless = buildOutcomes(manifest);
delete receiptless.records[0].call_receipts;
receiptless.records[0].verified_delivery = true;
assert.match(evaluateRepeatability(receiptless, preregistration, manifest).reason, /FIELD_MISMATCH/);

const reorderedManifest = structuredClone(manifest);
[reorderedManifest.waves[0], reorderedManifest.waves[1]] = [reorderedManifest.waves[1], reorderedManifest.waves[0]];
approveManifest(reorderedManifest);
const reorderedOutcomes = buildOutcomes(reorderedManifest);
assert.match(evaluateRepeatability(reorderedOutcomes, preregistration, reorderedManifest).reason, /SCHEDULE_MISMATCH/);

const replayedManifest = structuredClone(manifest);
replayedManifest.waves[1].source_freeze_digest = replayedManifest.waves[0].source_freeze_digest;
for (const task of replayedManifest.waves[1].tasks) {
  task.arm_initial_state_digests.FULL_HISTORY = initialState(replayedManifest.waves[1], task, "FULL_HISTORY");
}
approveManifest(replayedManifest);
const replayedOutcomes = buildOutcomes(replayedManifest);
assert.match(evaluateRepeatability(replayedOutcomes, preregistration, replayedManifest).reason, /REPLAYED_VALUE/);

const responseReplay = buildOutcomes(manifest);
responseReplay.records[1].call_receipts[0].provider_response_id = responseReplay.records[0].call_receipts[0].provider_response_id;
assert.match(evaluateRepeatability(responseReplay, preregistration, manifest).reason, /RESPONSE_BINDING_MISMATCH/);

const approvalTamperManifest = structuredClone(manifest);
approvalTamperManifest.batch_approval_receipt.subject_digest = fakeDigest("wrong-subject");
approvalTamperManifest.batch_approval_receipt.receipt_digest = receiptDigest(approvalTamperManifest.batch_approval_receipt);
const approvalTamperOutcomes = buildOutcomes(approvalTamperManifest);
assert.match(evaluateRepeatability(approvalTamperOutcomes, preregistration, approvalTamperManifest).reason, /SUBJECT_MISMATCH/);

const preregistrationTamper = structuredClone(preregistration);
preregistrationTamper.design.study_model_profiles.TERRA_WORKER.model = "unapproved-terra-substitute";
assert.match(evaluateRepeatability(buildOutcomes(manifest), preregistrationTamper, manifest).reason, /MANIFEST_PREREGISTRATION_MISMATCH/);

const advisorStateTamperManifest = structuredClone(manifest);
advisorStateTamperManifest.waves[0].tasks[0].arm_initial_state_digests.CLUTCH = fakeDigest("unbound-advisor-state");
approveManifest(advisorStateTamperManifest);
const advisorStateTamperOutcomes = buildOutcomes(advisorStateTamperManifest);
assert.match(evaluateRepeatability(advisorStateTamperOutcomes, preregistration, advisorStateTamperManifest).reason, /ADVISOR_STATE_BINDING_MISMATCH/);

const missingRankPrereg = structuredClone(preregistration);
delete missingRankPrereg.design.study_model_profiles.GPT55_ADVISOR;
assert.match(evaluateRepeatability(buildOutcomes(manifest), missingRankPrereg, manifest).reason, /STUDY_MODEL_PROFILES:FIELD_MISMATCH/);

const directionTamper = buildOutcomes(manifest);
const directionRecord = directionTamper.records.find((record) => record.replication_id === "B-ALT-GPT55" && record.arm === "CLUTCH");
directionRecord.phase_transition_receipts.PHASE_1_TERRA.direction = "UPGRADE";
directionRecord.phase_transition_receipts.PHASE_1_TERRA.receipt_digest = receiptDigest(directionRecord.phase_transition_receipts.PHASE_1_TERRA);
directionRecord.call_receipts[0].phase_transition_digest = directionRecord.phase_transition_receipts.PHASE_1_TERRA.receipt_digest;
assert.match(evaluateRepeatability(directionTamper, preregistration, manifest).reason, /direction:MISMATCH/);

const testReceiptTamper = buildOutcomes(manifest);
testReceiptTamper.records[0].test_receipt.passed_assertions = 0;
assert.match(evaluateRepeatability(testReceiptTamper, preregistration, manifest).reason, /TEST_RECEIPT_DIGEST_MISMATCH/);

process.stdout.write([
  "CLUTCH REPEATABILITY VERIFY PASS",
  "primary_rule=ALL_CLUTCH_TASKS_VERIFIED_DELIVERED_ACROSS_EVERY_MODEL_PHASE",
  "independent_unit=FRESH_ADVISOR_WAVE",
  "primary_sol_waves=42",
  "primary_waves_per_context_interval=14",
  "alternate_gpt55_waves=1",
  "tasks_per_wave=2",
  "total_tasks=86",
  "pass_fixture=REPEATED_PASS",
  "delivery_loss_fixture=REPEATED_FAIL_DELIVERY",
  "matched_delivery_loss_fixture=REPEATED_FAIL_DELIVERY",
  "alternate_loss_fixture=REPEATED_FAIL_ALTERNATE_ADVISOR",
  "receiptless_aggregate_fixture=INCOMPLETE_OR_INVALID",
  "source_tamper_fixture=INCOMPLETE_OR_INVALID",
  "state_continuity_tamper_fixture=INCOMPLETE_OR_INVALID",
  "phase_card_tamper_fixture=INCOMPLETE_OR_INVALID",
  "external_economics_fixture=IGNORED_BY_CLUTCH_DECISION",
  "call_order_tamper_fixture=INCOMPLETE_OR_INVALID",
  "record_order_tamper_fixture=INCOMPLETE_OR_INVALID",
  "call_identity_swap_fixture=INCOMPLETE_OR_INVALID",
  "request_substitution_fixture=INCOMPLETE_OR_INVALID",
  "status_promotion_fixture=INCOMPLETE_OR_INVALID",
  "stream_tip_tamper_fixture=INCOMPLETE_OR_INVALID",
  "manifest_schedule_tamper_fixture=INCOMPLETE_OR_INVALID",
  "wave_replay_fixture=INCOMPLETE_OR_INVALID",
  "provider_response_replay_fixture=INCOMPLETE_OR_INVALID",
  "batch_approval_tamper_fixture=INCOMPLETE_OR_INVALID",
  "preregistration_tamper_fixture=INCOMPLETE_OR_INVALID",
  "advisor_state_tamper_fixture=INCOMPLETE_OR_INVALID",
  "missing_rank_fixture=INCOMPLETE_OR_INVALID",
  "transition_direction_tamper_fixture=INCOMPLETE_OR_INVALID",
  "test_receipt_tamper_fixture=INCOMPLETE_OR_INVALID",
  "source_register=PASS",
  "construction_bound_budget=NOT_YET_FROZEN",
].join("\n") + "\n");
