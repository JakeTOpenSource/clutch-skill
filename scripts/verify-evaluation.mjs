#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { recomputePublicEvaluation } from "./recompute-evaluation.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = join(root, "evidence", "clutch-v2-confirmatory-001");
const summaryPath = join(evidenceRoot, "research-summary.json");
const receiptPath = join(evidenceRoot, "study-receipt.json");
const outcomesPath = join(evidenceRoot, "outcome-table.json");
const preregistrationPath = join(evidenceRoot, "public-preregistration.json");
const reportPath = join(root, "docs", "evaluation-v2.md");

const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const readJsonBytes = (path) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes) };
};
const summaryFile = readJsonBytes(summaryPath);
const receiptFile = readJsonBytes(receiptPath);
const outcomesFile = readJsonBytes(outcomesPath);
const preregistrationFile = readJsonBytes(preregistrationPath);
const summary = summaryFile.value;
const receipt = receiptFile.value;
const report = readFileSync(reportPath, "utf8");
const replay = recomputePublicEvaluation(outcomesFile.value, preregistrationFile.value);
const claimCeiling = "FIXED_SYNTHETIC_LONG_CONTEXT_SESSION_SINGLE_ADVISOR_REALIZATION_NO_POPULATION_OR_PRODUCTION_CLAIM";

assert.equal(summary.schema_version, "clutch-v2-research-summary.v1");
assert.equal(receipt.schema_version, "clutch-v2-public-study-receipt.v1");
assert.equal(summary.study_id, "clutch-v2-confirmatory-001");
assert.equal(receipt.study_id, summary.study_id);
assert.equal(replay.study_id, summary.study_id);
assert.equal(summary.decision, "PASS_RELEASE_CANDIDATE_ALLOWED");
assert.equal(summary.release_pass, true);
assert.equal(receipt.status, "COMPLETE_PASS_RELEASE_CANDIDATE_ALLOWED");
assert.equal(summary.claim_ceiling, claimCeiling);
assert.equal(receipt.claim_ceiling, claimCeiling);
assert.equal(receipt.public_artifacts.research_summary_sha256, digest(summaryFile.bytes));
assert.equal(receipt.public_artifacts.outcome_table_sha256, digest(outcomesFile.bytes));
assert.equal(receipt.public_artifacts.public_preregistration_sha256, digest(preregistrationFile.bytes));
assert.equal(receipt.public_artifacts.private_analysis_sha256, summary.private_analysis_sha256);
assert.equal(receipt.public_artifacts.raw_provider_responses_published, false);
assert.equal(receipt.public_artifacts.public_outcome_statistics_replayable, true);
assert.equal(receipt.verification.public_statistical_replay, "PASS");
assert.equal(receipt.verification.raw_execution_integrity_publicly_replayable, false);

assert.equal(replay.statistical_gate_pass, true);
for (const trajectory of ["STABLE_TERRA", "TERRA_TO_LUNA"]) {
  const actualQuality = replay.quality_noninferiority[trajectory];
  const reportedQuality = summary.quality_noninferiority[trajectory];
  assert.equal(actualQuality.post_switch_point_delta, reportedQuality.post_switch_point_delta);
  assert.equal(actualQuality.post_switch_one_sided_95_lower, reportedQuality.post_switch_one_sided_95_lower);
  assert.equal(actualQuality.margin, reportedQuality.margin);
  assert.equal(actualQuality.pass, reportedQuality.pass);
  assert.deepEqual(actualQuality.by_phase, reportedQuality.by_phase);
  assert.deepEqual(replay.critical_safety_and_collapse[trajectory], summary.critical_safety_and_collapse[trajectory]);
  assert.deepEqual(replay.input_efficiency[trajectory], summary.input_efficiency[trajectory]);
  assert.deepEqual(replay.provider_cost_efficiency[trajectory], summary.provider_cost_efficiency[trajectory]);
  for (const carriage of ["FULL_HISTORY", "APPROVED_CARD"]) {
    const actualRoute = replay.route_summaries[trajectory][carriage];
    const reportedRoute = summary.route_summaries?.[trajectory]?.[carriage];
    if (reportedRoute) {
      for (const field of ["tasks", "mean_post_switch_quality", "mean_final_quality", "complete_final_tasks", "collapse_count", "boundary_violation_count", "route_input_tokens", "route_charge_nanousd"]) {
        assert.equal(actualRoute[field], reportedRoute[field], `ROUTE_SUMMARY_MISMATCH:${trajectory}:${carriage}:${field}`);
      }
    }
  }
}
assert.deepEqual(replay.switch_resilience, summary.switch_resilience);
assert.equal(replay.switch_resilience.classification, "NEUTRAL_OR_UNRESOLVED");
assert.equal(replay.route_summaries.STABLE_TERRA.APPROVED_CARD.complete_final_tasks, 9);
assert.equal(replay.route_summaries.STABLE_TERRA.FULL_HISTORY.complete_final_tasks, 15);
assert.equal(replay.route_summaries.TERRA_TO_LUNA.APPROVED_CARD.complete_final_tasks, 13);
assert.equal(replay.route_summaries.TERRA_TO_LUNA.FULL_HISTORY.complete_final_tasks, 10);

assert.equal(summary.integrity.pass, true);
assert.equal(summary.integrity.provider_requests, 241);
assert.equal(summary.integrity.advisor_calls, 1);
assert.equal(summary.integrity.worker_calls, 240);
assert.equal(summary.integrity.completed_cells, 240);
assert.equal(summary.integrity.all_provider_responses_completed, true);
assert.equal(receipt.execution.provider_requests, summary.experiment_actuals.provider_requests);
assert.equal(receipt.execution.advisor_calls, summary.experiment_actuals.advisor_calls);
assert.equal(receipt.execution.worker_calls, summary.experiment_actuals.worker_calls);
assert.equal(receipt.execution.observed_provider_spend_usd, summary.experiment_actuals.provider_charge_usd);
assert.ok(receipt.execution.observed_provider_spend_usd < receipt.execution.hard_provider_spend_cap_usd);
assert.equal(receipt.execution.automatic_retries, 0);
assert.equal(receipt.execution.incomplete_responses, 0);

assert.match(report, /fixed synthetic long-context benchmark/i);
assert.match(report, /one advisor realization/i);
assert.match(report, /Human review time was not monetized/i);
assert.match(report, /Readers can independently recompute/i);
assert.match(report, /cannot independently rescore/i);
assert.match(report, /9\/15 vs 15\/15/);
assert.match(report, /13\/15 vs 10\/15/);
assert.match(report, /not establish production reliability/i);

process.stdout.write([
  "CLUTCH V2 EVALUATION VERIFY PASS",
  `study_id=${summary.study_id}`,
  `provider_requests=${summary.integrity.provider_requests}`,
  `observed_provider_spend_usd=${summary.experiment_actuals.provider_charge_usd.toFixed(6)}`,
  `stable_input_reduction=${replay.input_efficiency.STABLE_TERRA.reduction_fraction.toFixed(4)}`,
  `switch_input_reduction=${replay.input_efficiency.TERRA_TO_LUNA.reduction_fraction.toFixed(4)}`,
  "statistical_replay=PASS",
  "execution_integrity=RECEIPT_BOUND_NOT_RAW_REPLAYABLE",
  `switch_resilience=${replay.switch_resilience.classification}`,
  `claim_ceiling=${summary.claim_ceiling}`,
].join("\n") + "\n");
