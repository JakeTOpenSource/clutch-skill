// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { digestObject } from "../clutch/scripts/card-gate.mjs";

const ARMS = ["FULL_HISTORY", "CLUTCH"];
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PROFILE_IDS = ["SOL_ADVISOR", "GPT55_ADVISOR", "TERRA_WORKER", "LUNA_WORKER"];

function integer(value, label, minimum = 0) {
  assert.ok(Number.isSafeInteger(value) && value >= minimum, `${label}:NOT_INTEGER_AT_LEAST_${minimum}`);
  return value;
}

function digest(value, label) {
  assert.ok(typeof value === "string" && DIGEST.test(value), `${label}:BAD_DIGEST`);
  return value;
}

function nonempty(value, label) {
  assert.ok(typeof value === "string" && value.trim().length > 0, `${label}:EMPTY_TEXT`);
  return value;
}

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label}:NOT_OBJECT`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}:FIELD_MISMATCH`);
}

function unique(set, value, label) {
  assert.ok(!set.has(value), `${label}:REPLAYED_VALUE`);
  set.add(value);
}

function unsignedReceipt(receipt) {
  return Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "receipt_digest"));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "PREREGISTRATION_DIGEST:NONFINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  assert.ok(value && typeof value === "object", "PREREGISTRATION_DIGEST:UNSUPPORTED_VALUE");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function preregistrationDigest(preregistration) {
  return `sha256:${createHash("sha256").update(canonicalJson(preregistration)).digest("hex")}`;
}

export function receiptDigest(receipt) {
  return digestObject(unsignedReceipt(receipt));
}

export function requestBindingDigest(call) {
  return digestObject({
    schema_version: "clutch-request-binding.v1",
    call_id: call.call_id,
    call_sequence: call.call_sequence,
    phase_id: call.phase_id,
    worker_step: call.worker_step,
    model_profile: call.model_profile,
    model: call.model,
    transition: call.transition,
    phase_card_digest: call.phase_card_digest,
    phase_transition_digest: call.phase_transition_digest,
    state_in_digest: call.state_in_digest,
    request_digest: call.request_digest,
  });
}

export function responseBindingDigest(call) {
  return digestObject({
    schema_version: "clutch-response-binding.v1",
    call_id: call.call_id,
    request_binding_digest: call.request_binding_digest,
    response_digest: call.response_digest,
    provider_response_id: call.provider_response_id,
    state_out_digest: call.state_out_digest,
    status: call.status,
  });
}

export function recordDigest(record) {
  return digestObject(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "record_digest")));
}

export function outcomeDigest(outcomes) {
  return digestObject({
    schema_version: outcomes.schema_version,
    study_id: outcomes.study_id,
    status: outcomes.status,
    manifest_digest: outcomes.manifest_digest,
    call_stream_tip_digest: outcomes.call_stream_tip_digest,
    record_stream_tip_digest: outcomes.record_stream_tip_digest,
    records: outcomes.records,
  });
}

export function approvalSubjectDigest(manifest) {
  return digestObject({
    schema_version: "clutch-batch-approval-subject.v1",
    study_id: manifest.study_id,
    preregistration_digest: manifest.preregistration_digest,
    waves: manifest.waves,
  });
}

function expectedArmOrder(seed, taskIndex) {
  const first = (seed + taskIndex) % 2 === 0 ? "FULL_HISTORY" : "CLUTCH";
  return [first, first === "FULL_HISTORY" ? "CLUTCH" : "FULL_HISTORY"];
}

function expectedInitialState(wave, task, arm) {
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

function transitionDirection(profiles, fromProfile, toProfile, label) {
  const from = profiles[fromProfile];
  const to = profiles[toProfile];
  assert.ok(from && to, `${label}:UNKNOWN_PROFILE`);
  return to.capability_rank > from.capability_rank
    ? "UPGRADE"
    : to.capability_rank < from.capability_rank
      ? "DOWNGRADE"
      : "STABLE";
}

function expectedTransitions(wave, preregistration) {
  const profiles = preregistration.design.study_model_profiles;
  return [
    {
      to_phase: "PHASE_1_TERRA",
      from_phase: "PHASE_0_ADVISOR",
      from_profile: wave.advisor_profile,
      from_model: profiles[wave.advisor_profile].model,
      to_profile: "TERRA_WORKER",
      to_model: profiles.TERRA_WORKER.model,
      direction: transitionDirection(profiles, wave.advisor_profile, "TERRA_WORKER", `${wave.replication_id}:PHASE_1_TERRA`),
      worker_steps: ["BUILD"],
    },
    {
      to_phase: "PHASE_2_LUNA",
      from_phase: "PHASE_1_TERRA",
      from_profile: "TERRA_WORKER",
      from_model: profiles.TERRA_WORKER.model,
      to_profile: "LUNA_WORKER",
      to_model: profiles.LUNA_WORKER.model,
      direction: transitionDirection(profiles, "TERRA_WORKER", "LUNA_WORKER", `${wave.replication_id}:PHASE_2_LUNA`),
      worker_steps: ["INTEGRATE", "VERIFY"],
    },
  ];
}

function deliverySummary(rows) {
  const deliveries = rows.filter((row) => row.verified_delivery).length;
  return {
    attempts: rows.length,
    deliveries,
    delivery_rate: deliveries / rows.length,
  };
}

function validatePreregistration(preregistration) {
  assert.equal(preregistration.schema_version, "clutch-repeatability-preregistration.v3", "BAD_PREREGISTRATION_VERSION");
  assert.equal(preregistration.design.total_waves, 43, "BAD_WAVE_COUNT");
  assert.equal(preregistration.design.primary_sol_waves, 42, "BAD_PRIMARY_WAVE_COUNT");
  assert.equal(preregistration.design.primary_waves_per_context_interval, 14, "BAD_PRIMARY_CONTEXT_INTERVAL_COUNT");
  assert.equal(preregistration.design.tasks_per_wave, 2, "BAD_TASK_COUNT");
  assert.equal(preregistration.design.task_families_per_wave, 2, "BAD_FAMILIES_PER_WAVE");
  assert.equal(preregistration.design.total_task_families, 6, "BAD_TOTAL_FAMILY_COUNT");
  assert.equal(preregistration.design.variants_per_family_across_waves, 3, "BAD_VARIANT_COUNT");

  const profiles = preregistration.design.study_model_profiles;
  exactKeys(profiles, PROFILE_IDS, "STUDY_MODEL_PROFILES");
  const ranks = [];
  for (const profileId of PROFILE_IDS) {
    const profile = profiles[profileId];
    exactKeys(profile, ["model", "capability_rank", "role"], `PROFILE_${profileId}`);
    nonempty(profile.model, `PROFILE_${profileId}:MODEL`);
    integer(profile.capability_rank, `PROFILE_${profileId}:RANK`, 1);
    assert.ok(["ADVISOR", "WORKER"].includes(profile.role), `PROFILE_${profileId}:BAD_ROLE`);
    ranks.push(profile.capability_rank);
  }
  assert.equal(new Set(ranks).size, ranks.length, "DUPLICATE_STUDY_CAPABILITY_RANK");
  assert.equal(profiles.SOL_ADVISOR.role, "ADVISOR", "SOL_ROLE_MISMATCH");
  assert.equal(profiles.GPT55_ADVISOR.role, "ADVISOR", "GPT55_ROLE_MISMATCH");
  assert.equal(profiles.TERRA_WORKER.role, "WORKER", "TERRA_ROLE_MISMATCH");
  assert.equal(profiles.LUNA_WORKER.role, "WORKER", "LUNA_ROLE_MISMATCH");

  assert.deepEqual(preregistration.design.model_phases, [
    { phase_id: "PHASE_0_ADVISOR", profile_source: "wave_schedule.advisor_profile", mode: "READ_ONLY", worker_steps: ["SCOPE"] },
    { phase_id: "PHASE_1_TERRA", from_profile_source: "wave_schedule.advisor_profile", to_profile: "TERRA_WORKER", worker_steps: ["BUILD"] },
    { phase_id: "PHASE_2_LUNA", from_profile: "TERRA_WORKER", to_profile: "LUNA_WORKER", worker_steps: ["INTEGRATE", "VERIFY"] },
  ], "MODEL_PHASE_PLAN_MISMATCH");
  assert.equal(preregistration.design.automatic_generation_retries, 0, "GENERATION_RETRIES_NOT_ZERO");
  assert.ok(Array.isArray(preregistration.design.wave_schedule), "SCHEDULE_NOT_ARRAY");
  assert.equal(preregistration.design.wave_schedule.length, 43, "SCHEDULE_LENGTH_MISMATCH");

  const ids = new Set();
  for (const [index, entry] of preregistration.design.wave_schedule.entries()) {
    assert.equal(entry.sequence_index, index + 1, `SCHEDULE_${index}:BAD_SEQUENCE`);
    nonempty(entry.replication_id, `SCHEDULE_${index}:BAD_ID`);
    unique(ids, entry.replication_id, `SCHEDULE_${index}:DUPLICATE_ID`);
    assert.ok(preregistration.design.context_intervals.some((interval) => interval.context_interval_id === entry.context_interval_id), `SCHEDULE_${index}:BAD_CONTEXT_INTERVAL`);
    assert.ok(["SOL_ADVISOR", "GPT55_ADVISOR"].includes(entry.advisor_profile), `SCHEDULE_${index}:BAD_ADVISOR_PROFILE`);
    assert.equal(entry.advisor_model, profiles[entry.advisor_profile].model, `SCHEDULE_${index}:ADVISOR_MODEL_MAP_MISMATCH`);
    assert.equal(transitionDirection(profiles, entry.advisor_profile, "TERRA_WORKER", `SCHEDULE_${index}`), "DOWNGRADE", `SCHEDULE_${index}:ADVISOR_TO_TERRA_NOT_DOWNGRADE`);
    integer(entry.pre_handoff_history_bytes, `SCHEDULE_${index}:HISTORY_BYTES`, 1);
    integer(entry.arm_order_seed, `SCHEDULE_${index}:ARM_ORDER_SEED`, 1);
    assert.ok(Array.isArray(entry.task_family_ids) && entry.task_family_ids.length === 2, `SCHEDULE_${index}:BAD_FAMILY_PAIR`);
    assert.equal(new Set(entry.task_family_ids).size, 2, `SCHEDULE_${index}:DUPLICATE_FAMILY_IN_PAIR`);
    assert.ok(entry.task_family_ids.every((familyId) => /^F0[1-6]$/.test(familyId)), `SCHEDULE_${index}:UNKNOWN_FAMILY`);
    assert.ok(Array.isArray(entry.task_variant_ids) && entry.task_variant_ids.length === 2, `SCHEDULE_${index}:BAD_VARIANT_PAIR`);
    assert.ok(entry.task_variant_ids.every((variantId) => /^V0[1-3]$/.test(variantId)), `SCHEDULE_${index}:UNKNOWN_VARIANT`);
  }

  const primary = preregistration.design.wave_schedule.filter((entry) => entry.primary_for_repeatability);
  assert.equal(primary.length, 42, "PRIMARY_SCHEDULE_COUNT");
  assert.ok(primary.every((entry) => entry.advisor_profile === "SOL_ADVISOR"), "PRIMARY_ADVISOR_NOT_SOL");
  for (const interval of preregistration.design.context_intervals) {
    const intervalWaves = primary.filter((entry) => entry.context_interval_id === interval.context_interval_id);
    assert.equal(intervalWaves.length, 14, `${interval.context_interval_id}:PRIMARY_COUNT`);
    for (let family = 1; family <= 6; family += 1) {
      const appearances = intervalWaves.filter((entry) => entry.task_family_ids.includes(`F0${family}`)).length;
      assert.ok([4, 5].includes(appearances), `${interval.context_interval_id}:F0${family}:UNBALANCED_FAMILY_COUNT`);
    }
  }
  for (let offset = 0; offset < primary.length; offset += 3) {
    const blockFamilies = primary.slice(offset, offset + 3).flatMap((entry) => entry.task_family_ids);
    assert.equal(blockFamilies.length, 6, `PRIMARY_BLOCK_${offset / 3 + 1}:BAD_SIZE`);
    assert.equal(new Set(blockFamilies).size, 6, `PRIMARY_BLOCK_${offset / 3 + 1}:FAMILY_REUSE`);
  }
  for (let family = 1; family <= 6; family += 1) {
    const familyId = `F0${family}`;
    const appearances = primary.flatMap((entry) => entry.task_family_ids.map((candidate, taskIndex) => ({ candidate, variant: entry.task_variant_ids[taskIndex] }))).filter((item) => item.candidate === familyId);
    assert.equal(appearances.length, 14, `${familyId}:PRIMARY_FAMILY_COUNT`);
    for (const variantId of ["V01", "V02", "V03"]) {
      assert.ok([4, 5].includes(appearances.filter((item) => item.variant === variantId).length), `${familyId}:${variantId}:UNBALANCED_VARIANT_COUNT`);
    }
  }
  const alternate = preregistration.design.wave_schedule.filter((entry) => !entry.primary_for_repeatability);
  assert.deepEqual(alternate.map((entry) => [entry.replication_id, entry.context_interval_id, entry.advisor_profile]), [
    ["B-ALT-GPT55", "CTX_MIDDLE", "GPT55_ADVISOR"],
  ], "ALTERNATE_SCHEDULE_MISMATCH");

  const exactLower = preregistration.primary_rule.alpha ** (1 / preregistration.design.primary_waves_per_context_interval);
  assert.ok(exactLower >= preregistration.primary_rule.target_repeat_probability, "EXACT_REPEATABILITY_BOUND_TOO_LOW");
}

function validateManifest(manifest, preregistration) {
  assert.equal(manifest.schema_version, "clutch-repeatability-execution-manifest.v3", "BAD_MANIFEST_VERSION");
  assert.equal(manifest.study_id, preregistration.study_id, "MANIFEST_STUDY_MISMATCH");
  assert.equal(manifest.preregistration_digest, preregistrationDigest(preregistration), "MANIFEST_PREREGISTRATION_MISMATCH");
  assert.equal(manifest.status, "FROZEN_AFTER_BATCH_APPROVAL", "MANIFEST_NOT_FROZEN");
  assert.ok(Array.isArray(manifest.waves), "MANIFEST_WAVES_NOT_ARRAY");
  assert.equal(manifest.waves.length, preregistration.design.total_waves, "MANIFEST_WAVE_COUNT");

  const uniqueWaveSources = new Set();
  const uniqueAdvisorRequests = new Set();
  const uniqueAdvisorResponses = new Set();
  const uniqueCardSets = new Set();
  const uniqueTaskSources = new Set();
  const uniqueHiddenTests = new Set();
  const uniquePhaseCards = new Set();
  const uniqueInitialStates = new Set();

  for (const [waveIndex, wave] of manifest.waves.entries()) {
    const locator = `waves[${waveIndex}]`;
    assert.equal(wave.schema_version, "clutch-repeatability-wave-manifest.v2", `${locator}:BAD_VERSION`);
    const scheduled = preregistration.design.wave_schedule[waveIndex];
    assert.ok(scheduled, `${locator}:UNSCHEDULED_WAVE`);
    for (const field of ["replication_id", "sequence_index", "context_interval_id", "advisor_profile", "advisor_model", "primary_for_repeatability", "pre_handoff_history_bytes", "arm_order_seed"]) {
      assert.equal(wave[field], scheduled[field], `${locator}:${field}:SCHEDULE_MISMATCH`);
    }
    assert.deepEqual(wave.task_family_ids, scheduled.task_family_ids, `${locator}:task_family_ids:SCHEDULE_MISMATCH`);
    assert.deepEqual(wave.task_variant_ids, scheduled.task_variant_ids, `${locator}:task_variant_ids:SCHEDULE_MISMATCH`);
    for (const [field, set] of [
      ["source_freeze_digest", uniqueWaveSources],
      ["advisor_request_digest", uniqueAdvisorRequests],
      ["advisor_response_digest", uniqueAdvisorResponses],
      ["card_set_digest", uniqueCardSets],
    ]) {
      digest(wave[field], `${locator}:${field}`);
      unique(set, wave[field], `${locator}:${field}`);
    }
    assert.ok(Array.isArray(wave.tasks), `${locator}:TASKS_NOT_ARRAY`);
    assert.equal(wave.tasks.length, preregistration.design.tasks_per_wave, `${locator}:TASK_COUNT`);

    for (const [taskIndex, task] of wave.tasks.entries()) {
      const taskLocator = `${locator}.tasks[${taskIndex}]`;
      assert.equal(task.schema_version, "clutch-repeatability-task-manifest.v2", `${taskLocator}:BAD_VERSION`);
      assert.equal(task.task_id, `T${String(taskIndex + 1).padStart(2, "0")}`, `${taskLocator}:BAD_TASK_ID`);
      assert.equal(task.family_id, wave.task_family_ids[taskIndex], `${taskLocator}:BAD_FAMILY_ID`);
      assert.equal(task.variant_id, wave.task_variant_ids[taskIndex], `${taskLocator}:BAD_VARIANT_ID`);
      digest(task.source_digest, `${taskLocator}:source_digest`);
      digest(task.hidden_test_digest, `${taskLocator}:hidden_test_digest`);
      unique(uniqueTaskSources, task.source_digest, `${taskLocator}:source_digest`);
      unique(uniqueHiddenTests, task.hidden_test_digest, `${taskLocator}:hidden_test_digest`);
      assert.deepEqual(Object.keys(task.phase_cards).sort(), ["PHASE_1_TERRA", "PHASE_2_LUNA"], `${taskLocator}:PHASE_CARD_KEYS`);
      for (const phaseId of ["PHASE_1_TERRA", "PHASE_2_LUNA"]) {
        digest(task.phase_cards[phaseId], `${taskLocator}:${phaseId}_CARD`);
        unique(uniquePhaseCards, task.phase_cards[phaseId], `${taskLocator}:${phaseId}_CARD`);
      }
      assert.deepEqual(Object.keys(task.arm_initial_state_digests).sort(), [...ARMS].sort(), `${taskLocator}:INITIAL_STATE_KEYS`);
      for (const arm of ARMS) {
        digest(task.arm_initial_state_digests[arm], `${taskLocator}:${arm}:INITIAL_STATE`);
        assert.equal(task.arm_initial_state_digests[arm], expectedInitialState(wave, task, arm), `${taskLocator}:${arm}:ADVISOR_STATE_BINDING_MISMATCH`);
        unique(uniqueInitialStates, task.arm_initial_state_digests[arm], `${taskLocator}:${arm}:INITIAL_STATE`);
      }
      assert.deepEqual(task.arm_order, expectedArmOrder(wave.arm_order_seed, taskIndex), `${taskLocator}:ARM_ORDER_MISMATCH`);
    }
  }

  const approval = manifest.batch_approval_receipt;
  exactKeys(approval, [
    "schema_version", "approval_id", "actor_id", "decision", "approved_phase_card_count",
    "subject_digest", "receipt_digest",
  ], "BATCH_APPROVAL");
  assert.equal(approval.schema_version, "clutch-batch-approval-receipt.v1", "BATCH_APPROVAL:BAD_VERSION");
  nonempty(approval.approval_id, "BATCH_APPROVAL:BAD_ID");
  nonempty(approval.actor_id, "BATCH_APPROVAL:BAD_ACTOR");
  assert.equal(approval.decision, "APPROVED", "BATCH_APPROVAL:NOT_APPROVED");
  assert.equal(approval.approved_phase_card_count, preregistration.design.total_waves * preregistration.design.tasks_per_wave * 2, "BATCH_APPROVAL:CARD_COUNT_MISMATCH");
  assert.equal(approval.subject_digest, approvalSubjectDigest(manifest), "BATCH_APPROVAL:SUBJECT_MISMATCH");
  assert.equal(approval.receipt_digest, receiptDigest(approval), "BATCH_APPROVAL:RECEIPT_DIGEST_MISMATCH");
}

function validatePhaseReceipt(receipt, expected, locator) {
  exactKeys(receipt, [
    "schema_version", "transition_id", "from_phase", "to_phase", "direction",
    "from_profile", "from_model", "to_profile", "to_model", "state_out_digest",
    "state_in_digest", "phase_card_digest", "approval_receipt_digest", "status",
    "receipt_digest",
  ], locator);
  assert.equal(receipt.schema_version, "model-phase-receipt.v1", `${locator}:BAD_VERSION`);
  nonempty(receipt.transition_id, `${locator}:BAD_TRANSITION_ID`);
  for (const field of ["from_phase", "to_phase", "direction", "from_profile", "from_model", "to_profile", "to_model"]) {
    assert.equal(receipt[field], expected[field], `${locator}:${field}:MISMATCH`);
  }
  digest(receipt.state_out_digest, `${locator}:state_out_digest`);
  digest(receipt.state_in_digest, `${locator}:state_in_digest`);
  assert.equal(receipt.state_out_digest, expected.state_digest, `${locator}:OUTGOING_STATE_MISMATCH`);
  assert.equal(receipt.state_in_digest, expected.state_digest, `${locator}:INCOMING_STATE_MISMATCH`);
  assert.equal(receipt.phase_card_digest, expected.phase_card_digest, `${locator}:PHASE_CARD_MISMATCH`);
  assert.equal(receipt.approval_receipt_digest, expected.approval_receipt_digest, `${locator}:APPROVAL_MISMATCH`);
  assert.ok(["COMPLETE", "INCOMPLETE", "STOPPED", "UNKNOWN"].includes(receipt.status), `${locator}:BAD_STATUS`);
  assert.equal(receipt.receipt_digest, receiptDigest(receipt), `${locator}:RECEIPT_DIGEST_MISMATCH`);
}

function validateCall(call, expected, locator, uniqueness) {
  exactKeys(call, [
    "schema_version", "call_id", "call_sequence", "previous_call_receipt_digest",
    "phase_id", "worker_step", "model_profile", "model", "transition",
    "phase_card_digest", "phase_transition_digest", "state_in_digest",
    "state_out_digest", "request_digest", "request_binding_digest",
    "response_digest", "provider_response_id", "response_binding_digest",
    "status", "receipt_digest",
  ], locator);
  assert.equal(call.schema_version, "clutch-repeatability-call-receipt.v3", `${locator}:BAD_VERSION`);
  assert.equal(call.call_id, expected.call_id, `${locator}:CALL_ID_MISMATCH`);
  assert.equal(call.call_sequence, expected.call_sequence, `${locator}:CALL_SEQUENCE_MISMATCH`);
  assert.equal(call.previous_call_receipt_digest, expected.previous_call_receipt_digest, `${locator}:CALL_CHAIN_MISMATCH`);
  assert.equal(call.phase_id, expected.phase_id, `${locator}:PHASE_MISMATCH`);
  assert.equal(call.worker_step, expected.worker_step, `${locator}:WORKER_STEP_MISMATCH`);
  assert.equal(call.model_profile, expected.model_profile, `${locator}:WORKER_PROFILE_MISMATCH`);
  assert.equal(call.model, expected.model, `${locator}:WORKER_MODEL_MISMATCH`);
  assert.equal(call.transition, expected.transition, `${locator}:TRANSITION_MISMATCH`);
  assert.equal(call.phase_card_digest, expected.phase_card_digest, `${locator}:PHASE_CARD_MISMATCH`);
  assert.equal(call.phase_transition_digest, expected.phase_transition_digest, `${locator}:PHASE_TRANSITION_MISMATCH`);
  for (const field of ["state_in_digest", "state_out_digest", "request_digest", "response_digest"]) {
    digest(call[field], `${locator}:${field}`);
  }
  nonempty(call.provider_response_id, `${locator}:BAD_PROVIDER_RESPONSE_ID`);
  assert.equal(call.request_binding_digest, requestBindingDigest(call), `${locator}:REQUEST_BINDING_MISMATCH`);
  assert.equal(call.response_binding_digest, responseBindingDigest(call), `${locator}:RESPONSE_BINDING_MISMATCH`);
  unique(uniqueness.requestDigests, call.request_digest, `${locator}:request_digest`);
  unique(uniqueness.responseDigests, call.response_digest, `${locator}:response_digest`);
  unique(uniqueness.providerResponseIds, call.provider_response_id, `${locator}:provider_response_id`);
  assert.ok(["COMPLETE", "INCOMPLETE", "TRANSPORT_FAILURE"].includes(call.status), `${locator}:BAD_STATUS`);
  assert.equal(call.receipt_digest, receiptDigest(call), `${locator}:CALL_RECEIPT_DIGEST_MISMATCH`);
  unique(uniqueness.callReceiptDigests, call.receipt_digest, `${locator}:receipt_digest`);
}

function validateAndDeriveRecords(outcomes, manifest, preregistration) {
  assert.ok(Array.isArray(outcomes.records), "RECORDS_NOT_ARRAY");
  assert.equal(outcomes.records.length, manifest.waves.length * preregistration.design.tasks_per_wave * ARMS.length, "RECORD_COUNT");

  const uniqueness = {
    requestDigests: new Set(),
    responseDigests: new Set(),
    providerResponseIds: new Set(),
    callReceiptDigests: new Set(),
    phaseReceiptDigests: new Set(),
    transitionIds: new Set(),
    testReceiptDigests: new Set(),
    recordDigests: new Set(),
  };
  const approvalDigest = manifest.batch_approval_receipt.receipt_digest;
  const rows = [];
  let sequence = 0;
  let recordSequence = 0;
  let previousCallReceiptDigest = null;
  let previousRecordDigest = null;
  for (const wave of manifest.waves) {
    const transitions = expectedTransitions(wave, preregistration);
    for (const task of wave.tasks) {
      for (const arm of task.arm_order) {
        const key = `${wave.replication_id}\u0000${task.task_id}\u0000${arm}`;
        const record = outcomes.records[recordSequence];
        const locator = `records[${recordSequence}]`;
        assert.ok(record, `${key}:MISSING_RECORD`);
        recordSequence += 1;
        exactKeys(record, [
          "schema_version", "record_sequence", "previous_record_digest", "record_digest",
          "replication_id", "task_id", "family_id", "variant_id", "arm",
          "source_digest", "worker_profiles", "worker_models", "phase_card_digests",
          "card_set_digest", "approval_receipt_digest", "phase_transition_receipts",
          "call_receipts", "test_receipt",
        ], locator);
        assert.equal(record.schema_version, "clutch-repeatability-record.v4", `${locator}:BAD_VERSION`);
        assert.equal(record.record_sequence, recordSequence, `${locator}:RECORD_SEQUENCE_MISMATCH`);
        assert.equal(record.previous_record_digest, previousRecordDigest, `${locator}:RECORD_CHAIN_MISMATCH`);
        assert.equal(record.replication_id, wave.replication_id, `${locator}:REPLICATION_ORDER_MISMATCH`);
        assert.equal(record.task_id, task.task_id, `${locator}:TASK_ORDER_MISMATCH`);
        assert.equal(record.arm, arm, `${locator}:ARM_ORDER_MISMATCH`);
        assert.equal(record.source_digest, task.source_digest, `${key}:SOURCE_DIGEST_MISMATCH`);
        assert.equal(record.family_id, task.family_id, `${key}:FAMILY_MISMATCH`);
        assert.equal(record.variant_id, task.variant_id, `${key}:VARIANT_MISMATCH`);
        assert.deepEqual(record.worker_profiles, ["TERRA_WORKER", "LUNA_WORKER"], `${key}:WORKER_PROFILES_MISMATCH`);
        assert.deepEqual(record.worker_models, [preregistration.design.study_model_profiles.TERRA_WORKER.model, preregistration.design.study_model_profiles.LUNA_WORKER.model], `${key}:WORKER_MODELS_MISMATCH`);
        if (arm === "CLUTCH") {
          assert.deepEqual(record.phase_card_digests, task.phase_cards, `${key}:PHASE_CARD_DIGEST_MISMATCH`);
          assert.equal(record.card_set_digest, wave.card_set_digest, `${key}:CARD_SET_DIGEST_MISMATCH`);
          assert.equal(record.approval_receipt_digest, approvalDigest, `${key}:APPROVAL_DIGEST_MISMATCH`);
        } else {
          assert.equal(record.phase_card_digests, null, `${key}:HISTORY_PHASE_CARDS_PRESENT`);
          assert.equal(record.card_set_digest, null, `${key}:HISTORY_CARD_SET_PRESENT`);
          assert.equal(record.approval_receipt_digest, null, `${key}:HISTORY_APPROVAL_PRESENT`);
        }

        assert.deepEqual(Object.keys(record.phase_transition_receipts).sort(), ["PHASE_1_TERRA", "PHASE_2_LUNA"], `${key}:PHASE_RECEIPT_KEYS`);
        const firstTransition = transitions[0];
        const firstReceipt = record.phase_transition_receipts.PHASE_1_TERRA;
        validatePhaseReceipt(firstReceipt, {
          ...firstTransition,
          state_digest: task.arm_initial_state_digests[arm],
          phase_card_digest: arm === "CLUTCH" ? task.phase_cards.PHASE_1_TERRA : null,
          approval_receipt_digest: arm === "CLUTCH" ? approvalDigest : null,
        }, `${key}.phase_transition_receipts.PHASE_1_TERRA`);
        unique(uniqueness.phaseReceiptDigests, firstReceipt.receipt_digest, `${key}:PHASE_1_RECEIPT`);
        unique(uniqueness.transitionIds, firstReceipt.transition_id, `${key}:PHASE_1_TRANSITION_ID`);

        assert.ok(Array.isArray(record.call_receipts) && record.call_receipts.length === 3, `${key}:CALL_RECEIPT_COUNT`);
        sequence += 1;
        const build = record.call_receipts[0];
        validateCall(build, {
          call_id: `${wave.replication_id}:${task.task_id}:${arm}:BUILD`,
          call_sequence: sequence,
          previous_call_receipt_digest: previousCallReceiptDigest,
          phase_id: "PHASE_1_TERRA",
          worker_step: "BUILD",
          model_profile: "TERRA_WORKER",
          model: preregistration.design.study_model_profiles.TERRA_WORKER.model,
          transition: firstTransition.direction,
          phase_card_digest: arm === "CLUTCH" ? task.phase_cards.PHASE_1_TERRA : null,
          phase_transition_digest: firstReceipt.receipt_digest,
        }, `${key}.call_receipts[0]`, uniqueness);
        assert.equal(build.state_in_digest, firstReceipt.state_in_digest, `${key}:BUILD_STATE_IN_MISMATCH`);
        previousCallReceiptDigest = build.receipt_digest;

        const secondTransition = transitions[1];
        const secondReceipt = record.phase_transition_receipts.PHASE_2_LUNA;
        validatePhaseReceipt(secondReceipt, {
          ...secondTransition,
          state_digest: build.state_out_digest,
          phase_card_digest: arm === "CLUTCH" ? task.phase_cards.PHASE_2_LUNA : null,
          approval_receipt_digest: arm === "CLUTCH" ? approvalDigest : null,
        }, `${key}.phase_transition_receipts.PHASE_2_LUNA`);
        unique(uniqueness.phaseReceiptDigests, secondReceipt.receipt_digest, `${key}:PHASE_2_RECEIPT`);
        unique(uniqueness.transitionIds, secondReceipt.transition_id, `${key}:PHASE_2_TRANSITION_ID`);

        sequence += 1;
        const integrate = record.call_receipts[1];
        validateCall(integrate, {
          call_id: `${wave.replication_id}:${task.task_id}:${arm}:INTEGRATE`,
          call_sequence: sequence,
          previous_call_receipt_digest: previousCallReceiptDigest,
          phase_id: "PHASE_2_LUNA",
          worker_step: "INTEGRATE",
          model_profile: "LUNA_WORKER",
          model: preregistration.design.study_model_profiles.LUNA_WORKER.model,
          transition: secondTransition.direction,
          phase_card_digest: arm === "CLUTCH" ? task.phase_cards.PHASE_2_LUNA : null,
          phase_transition_digest: secondReceipt.receipt_digest,
        }, `${key}.call_receipts[1]`, uniqueness);
        assert.equal(integrate.state_in_digest, secondReceipt.state_in_digest, `${key}:INTEGRATE_STATE_IN_MISMATCH`);
        previousCallReceiptDigest = integrate.receipt_digest;

        sequence += 1;
        const verify = record.call_receipts[2];
        validateCall(verify, {
          call_id: `${wave.replication_id}:${task.task_id}:${arm}:VERIFY`,
          call_sequence: sequence,
          previous_call_receipt_digest: previousCallReceiptDigest,
          phase_id: "PHASE_2_LUNA",
          worker_step: "VERIFY",
          model_profile: "LUNA_WORKER",
          model: preregistration.design.study_model_profiles.LUNA_WORKER.model,
          transition: "CONTINUE",
          phase_card_digest: arm === "CLUTCH" ? task.phase_cards.PHASE_2_LUNA : null,
          phase_transition_digest: secondReceipt.receipt_digest,
        }, `${key}.call_receipts[2]`, uniqueness);
        assert.equal(verify.state_in_digest, integrate.state_out_digest, `${key}:VERIFY_STATE_CONTINUITY_MISMATCH`);
        previousCallReceiptDigest = verify.receipt_digest;

        const test = record.test_receipt;
        exactKeys(test, [
          "schema_version", "receipt_digest", "source_digest", "hidden_test_digest",
          "final_state_digest", "total_assertions", "passed_assertions", "boundary_violations",
        ], `${key}:TEST_RECEIPT`);
        assert.equal(test.schema_version, "clutch-repeatability-test-receipt.v2", `${key}:BAD_TEST_VERSION`);
        assert.equal(test.receipt_digest, receiptDigest(test), `${key}:TEST_RECEIPT_DIGEST_MISMATCH`);
        unique(uniqueness.testReceiptDigests, test.receipt_digest, `${key}:TEST_RECEIPT_DIGEST`);
        assert.equal(test.source_digest, task.source_digest, `${key}:TEST_SOURCE_MISMATCH`);
        assert.equal(test.hidden_test_digest, task.hidden_test_digest, `${key}:HIDDEN_TEST_MISMATCH`);
        assert.equal(test.final_state_digest, verify.state_out_digest, `${key}:TEST_FINAL_STATE_MISMATCH`);
        integer(test.total_assertions, `${key}:total_assertions`, 1);
        integer(test.passed_assertions, `${key}:passed_assertions`);
        integer(test.boundary_violations, `${key}:boundary_violations`);
        assert.ok(test.passed_assertions <= test.total_assertions, `${key}:TOO_MANY_PASSED_ASSERTIONS`);

        assert.equal(record.record_digest, recordDigest(record), `${key}:RECORD_DIGEST_MISMATCH`);
        unique(uniqueness.recordDigests, record.record_digest, `${key}:record_digest`);
        previousRecordDigest = record.record_digest;

        const phasesComplete = [firstReceipt, secondReceipt].every((receipt) => receipt.status === "COMPLETE");
        const callsComplete = record.call_receipts.every((call) => call.status === "COMPLETE");
        const verifiedDelivery = phasesComplete && callsComplete &&
          test.passed_assertions === test.total_assertions &&
          test.boundary_violations === 0;
        rows.push({
          replication_id: wave.replication_id,
          context_interval_id: wave.context_interval_id,
          advisor_profile: wave.advisor_profile,
          advisor_model: wave.advisor_model,
          primary_for_repeatability: wave.primary_for_repeatability,
          task_id: task.task_id,
          family_id: task.family_id,
          variant_id: task.variant_id,
          arm,
          verified_delivery: verifiedDelivery,
          outcome_class: verifiedDelivery ? "DELIVERED" : phasesComplete && callsComplete ? "TEST_OR_BOUNDARY_FAILURE" : "MODEL_OR_TRANSPORT_FAILURE",
        });
      }
    }
  }
  assert.equal(sequence, preregistration.design.total_waves * preregistration.design.tasks_per_wave * ARMS.length * 3, "FINAL_CALL_SEQUENCE");
  assert.equal(outcomes.call_stream_tip_digest, previousCallReceiptDigest, "CALL_STREAM_TIP_MISMATCH");
  assert.equal(outcomes.record_stream_tip_digest, previousRecordDigest, "RECORD_STREAM_TIP_MISMATCH");
  return rows;
}

export function evaluateRepeatability(outcomes, preregistration, manifest) {
  try {
    validatePreregistration(preregistration);
    validateManifest(manifest, preregistration);
    assert.equal(outcomes.schema_version, "clutch-repeatability-outcomes.v4", "BAD_OUTCOME_VERSION");
    assert.equal(outcomes.study_id, preregistration.study_id, "OUTCOME_STUDY_MISMATCH");
    assert.equal(outcomes.manifest_digest, digestObject(manifest), "OUTCOME_MANIFEST_DIGEST_MISMATCH");
    if (outcomes.status !== "COMPLETE") {
      return {
        schema_version: "clutch-repeatability-analysis.v3",
        study_id: outcomes.study_id,
        decision: "INCOMPLETE_OR_INVALID",
        pass: false,
        reason: `OUTCOME_STATUS_${outcomes.status}`,
      };
    }

    const rows = validateAndDeriveRecords(outcomes, manifest, preregistration);
    assert.equal(outcomes.outcome_digest, outcomeDigest(outcomes), "OUTCOME_DIGEST_MISMATCH");
    const waveResults = manifest.waves.map((wave) => {
      const waveRows = rows.filter((row) => row.replication_id === wave.replication_id);
      const history = deliverySummary(waveRows.filter((row) => row.arm === "FULL_HISTORY"));
      const clutch = deliverySummary(waveRows.filter((row) => row.arm === "CLUTCH"));
      const deliveryGatePass = clutch.deliveries === preregistration.design.tasks_per_wave;
      return {
        replication_id: wave.replication_id,
        sequence_index: wave.sequence_index,
        context_interval_id: wave.context_interval_id,
        advisor_profile: wave.advisor_profile,
        advisor_model: wave.advisor_model,
        primary_for_repeatability: wave.primary_for_repeatability,
        history_deliveries: history.deliveries,
        clutch_deliveries: clutch.deliveries,
        observed_delivery_rate_difference: clutch.delivery_rate - history.delivery_rate,
        delivery_gate_pass: deliveryGatePass,
        pass: deliveryGatePass,
      };
    });

    const alpha = preregistration.primary_rule.alpha;
    const target = preregistration.primary_rule.target_repeat_probability;
    const contextIntervalResults = preregistration.design.context_intervals.map((interval) => {
      const waves = waveResults.filter((wave) => wave.primary_for_repeatability && wave.context_interval_id === interval.context_interval_id);
      const passes = waves.filter((wave) => wave.pass).length;
      const allPass = passes === waves.length;
      const lower = allPass ? alpha ** (1 / waves.length) : null;
      return {
        context_interval_id: interval.context_interval_id,
        independent_primary_waves: waves.length,
        passing_waves: passes,
        all_waves_pass: allPass,
        exact_one_sided_95_repeat_probability_lower_if_all_pass: lower,
        target_repeat_probability: target,
        pass: allPass && lower >= target,
      };
    });

    const primaryWaves = waveResults.filter((wave) => wave.primary_for_repeatability);
    const alternate = waveResults.find((wave) => !wave.primary_for_repeatability);
    let decision;
    if (!primaryWaves.every((wave) => wave.delivery_gate_pass)) decision = "REPEATED_FAIL_DELIVERY";
    else if (!contextIntervalResults.every((interval) => interval.pass)) decision = "REPEATED_FAIL_DELIVERY";
    else if (!alternate?.delivery_gate_pass) decision = "REPEATED_FAIL_ALTERNATE_ADVISOR";
    else decision = "REPEATED_PASS";

    const familyDiagnostics = {};
    for (const familyId of [...new Set(rows.map((row) => row.family_id))].sort()) {
      familyDiagnostics[familyId] = {};
      for (const arm of ARMS) {
        familyDiagnostics[familyId][arm] = deliverySummary(rows.filter((row) => row.family_id === familyId && row.arm === arm));
      }
    }

    return {
      schema_version: "clutch-repeatability-analysis.v3",
      study_id: outcomes.study_id,
      decision,
      pass: decision === "REPEATED_PASS",
      primary_rule: preregistration.primary_rule.name,
      independent_unit: "FRESH_ADVISOR_WAVE",
      wave_results: waveResults,
      context_interval_results: contextIntervalResults,
      alternate_advisor_stress: alternate,
      family_diagnostics: familyDiagnostics,
      external_telemetry_authority: "OUTSIDE_CLUTCH",
      manifest_digest: digestObject(manifest),
      claim_ceiling: preregistration.claim_ceiling,
    };
  } catch (error) {
    return {
      schema_version: "clutch-repeatability-analysis.v3",
      study_id: outcomes?.study_id ?? "UNKNOWN",
      decision: "INCOMPLETE_OR_INVALID",
      pass: false,
      reason: error instanceof Error ? error.message : "UNKNOWN_VALIDATION_ERROR",
    };
  }
}
