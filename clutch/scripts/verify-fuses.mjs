#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";

import { reduceFuseInput } from "./fuse-gate.mjs";
import { projectFuseInput } from "./fuse-reference.mjs";
import { buildFuseCases, fixtureHash } from "./fixtures/fuse-cases.mjs";

function primaryProjection(report) {
  return {
    validation: report.validation.status,
    state: report.stream.state,
    action: report.stream.action,
    expected_phase_ref: report.stream.expected_phase_ref,
    last_receipt_hash: report.stream.last_receipt_hash,
    last_admissible_artifact_hash: report.stream.last_admissible_artifact_hash,
    candidate_artifact_hash: report.stream.candidate_artifact_hash,
    reason_code: report.stream.reason_code,
    hold_code: report.stream.hold_code,
    route_ref: report.stream.route_ref,
    fuse_uses: report.stream.fuse_uses,
    platform_transfers: report.stream.platform_transfers,
    delivery_eligible: report.stream.delivery_eligible,
    feedback_count: report.feedback.length,
    cost_microusd: report.usage.cost_microusd,
    telemetry_status: report.usage.telemetry_status,
    efficiency_eligible: report.usage.efficiency_eligible,
    delivery_units: report.usage.delivery_units,
    plan_hash: report.plan.plan_hash,
  };
}

const cases = buildFuseCases();
let validCount = 0;
let invalidCount = 0;
let parityCount = 0;

for (const testCase of cases) {
  const [primary, exitCode] = reduceFuseInput(testCase.input);
  const reference = projectFuseInput(testCase.input);
  if (testCase.expected_valid) {
    validCount += 1;
    assert.equal(exitCode, 0, `${testCase.case_id}: primary unexpectedly rejected ${primary.validation.error_code}`);
    assert.equal(primary.validation.status, "VALID", testCase.case_id);
    assert.equal(reference.validation, "VALID", `${testCase.case_id}: reference unexpectedly rejected ${reference.error_code}`);
    assert.deepEqual(primaryProjection(primary), reference, `${testCase.case_id}: independent projection mismatch`);
    assert.equal(primary.stream.state, testCase.expected.state, `${testCase.case_id}: state`);
    assert.equal(primary.stream.action, testCase.expected.action, `${testCase.case_id}: action`);
    if (testCase.expected.reason) assert.equal(primary.stream.reason_code, testCase.expected.reason, `${testCase.case_id}: reason code`);
    if (testCase.expected.hold) assert.equal(primary.stream.hold_code, testCase.expected.hold, `${testCase.case_id}: hold code`);
    assert.equal(primary.stream.delivery_eligible, testCase.expected.delivery, `${testCase.case_id}: delivery eligibility`);
    assert.equal(primary.feedback.length, testCase.expected.feedback, `${testCase.case_id}: feedback count`);
    assert.equal(primary.usage.cost_microusd, testCase.expected.cost, `${testCase.case_id}: cost accumulation`);
    assert.equal(primary.usage.telemetry_status, testCase.expected.telemetry ?? "COMPLETE", `${testCase.case_id}: telemetry status`);
    assert.equal(primary.usage.efficiency_eligible, testCase.expected.efficiency ?? testCase.expected.delivery, `${testCase.case_id}: efficiency eligibility`);
    assert.equal(primary.usage.delivery_units, testCase.expected.delivery ? 1 : 0, `${testCase.case_id}: delivery units`);
    parityCount += 1;
  } else {
    invalidCount += 1;
    assert.equal(exitCode, 2, `${testCase.case_id}: primary unexpectedly accepted`);
    assert.equal(primary.validation.status, "INVALID", testCase.case_id);
    assert.equal(primary.validation.error_code, testCase.expected_error, `${testCase.case_id}: unexpected primary error`);
    assert.equal(reference.validation, "INVALID", `${testCase.case_id}: reference accepted hostile input`);
  }
}

const repairedCase = cases.find((item) => item.case_id === "repair-delivery");
const [repaired] = reduceFuseInput(repairedCase.input);
assert.equal(repaired.feedback[0].candidate_artifact_hash, fixtureHash("artifact:p0-bad"), "Rejected candidate must remain feedback evidence");
assert.equal(repaired.stream.last_admissible_artifact_hash, fixtureHash("artifact:p2-delivered"), "Only passing artifacts may advance admissible state");
assert.equal(repaired.usage.cost_microusd, 9000, "Failed-phase cost must remain in total cost");
assert.equal(repaired.usage.delivery_units, 1, "Only the final verified phase earns delivery credit");

const evacuatedCase = cases.find((item) => item.case_id === "contract-evacuation");
const [evacuated] = reduceFuseInput(evacuatedCase.input);
assert.equal(evacuated.stream.last_admissible_artifact_hash, evacuatedCase.input.plan.initial_artifact_hash, "Evacuation must return the last known-good artifact");
assert.equal(evacuated.usage.cost_microusd, 1000, "Evacuated work remains charged");
assert.equal(evacuated.usage.delivery_units, 0, "Evacuation is not delivery");

for (const caseId of ["fuse-limit-holds-with-evidence", "platform-limit-holds-with-evidence"]) {
  const heldCase = cases.find((item) => item.case_id === caseId);
  const [heldReport] = reduceFuseInput(heldCase.input);
  assert.equal(heldReport.validation.status, "VALID", `${caseId}: exhaustion must preserve a valid evidence stream`);
  assert.equal(heldReport.feedback.length, 1, `${caseId}: exhaustion must preserve feedback`);
  assert.equal(heldReport.usage.cost_microusd, 2000, `${caseId}: exhaustion must preserve attempted cost`);
  assert.equal(heldReport.usage.delivery_units, 0, `${caseId}: exhaustion is not delivery`);
}

const unknownTelemetryCase = cases.find((item) => item.case_id === "unknown-telemetry-delivery");
const [unknownTelemetry] = reduceFuseInput(unknownTelemetryCase.input);
assert.equal(unknownTelemetry.stream.delivery_eligible, true, "Delivered cargo remains delivery when telemetry is incomplete");
assert.equal(unknownTelemetry.usage.telemetry_status, "UNKNOWN", "Unknown telemetry must remain explicit");
assert.equal(unknownTelemetry.usage.cost_microusd, "UNKNOWN", "Unknown cost must not collapse to zero");
assert.equal(unknownTelemetry.usage.efficiency_eligible, false, "Incomplete telemetry cannot support an efficiency claim");

for (const caseId of ["wrong-phase-safety-cannot-repair", "wrong-phase-authority-cannot-repair", "wrong-phase-contract-evacuates"]) {
  const strictCase = cases.find((item) => item.case_id === caseId);
  const [strictReport] = reduceFuseInput(strictCase.input);
  assert.equal(strictReport.stream.delivery_eligible, false, `${caseId}: strict failure cannot become delivery`);
  assert.ok(!["REPAIR", "TRANSFER"].includes(strictReport.stream.action), `${caseId}: strict failure cannot use a continuation route`);
}

const publicReport = JSON.stringify(repaired);
for (const forbidden of ["worker-1", "provider-attempt:1", "artifact:p0-bad", "fix-log:1"]) {
  assert.ok(!publicReport.includes(forbidden), `Fuse report leaks raw fixture label: ${forbidden}`);
}

const semanticCase = cases.find((item) => item.case_id === "semantic-identifiers-withheld");
const [semanticReport] = reduceFuseInput(semanticCase.input);
assert.ok(!JSON.stringify(semanticReport).includes("PRIVATE_CLIENT"), "Fuse report leaks caller-supplied semantic identifiers or claim text");
assert.deepEqual(Object.keys(semanticReport.plan).sort(), ["card_hash", "claim_ceiling_hash", "plan_hash", "policy_hash", "source_freeze_hash"]);
assert.ok(!Object.keys(semanticReport.stream).some((key) => key.endsWith("_id")), "Fuse stream exposes a caller-supplied ID field");
assert.ok(semanticReport.feedback.every((entry) => !Object.keys(entry).some((key) => key.endsWith("_id"))), "Fuse feedback exposes a caller-supplied ID field");

process.stdout.write([
  "FUSE VERIFY PASS",
  `cases=${cases.length}`,
  `valid_cases=${validCount}`,
  `hostile_cases=${invalidCount}`,
  `independent_projection_parity=${parityCount}/${validCount}`,
  "failed_phase_preserved_as_feedback=PASS",
  "failed_phase_cost_preserved=PASS",
  "failed_phase_delivery_credit=0",
  "exhausted_fuse_evidence_preserved=PASS",
  "unknown_telemetry_not_zero=PASS",
  "efficiency_requires_delivery_and_complete_telemetry=PASS",
  "last_known_good_artifact=PASS",
  "phase_mismatch_recovery=PASS",
  "context_omission_no_shrink=PASS",
  "hidden_retry_rejection=PASS",
  "strict_failure_dominates_phase_mismatch=PASS",
  "caller_supplied_identifier_leaks=0",
  "undeclared_route=HOLD_NEUTRAL",
  "claim_ceiling=LOCAL_DETERMINISTIC_PHASE_ROUTING_ONLY",
].join("\n") + "\n");
