#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evaluationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (name) => JSON.parse(readFileSync(join(evaluationRoot, name), "utf8"));

const receipt = readJson("stage-0-preparation-receipt.json");
const acceptance = readJson("owner-acceptance-stage-0.json");

assert.equal(receipt.schema_version, "clutch-stage0-preparation-receipt.v1");
assert.equal(receipt.receipt_id, "clutch-stage0-preparation-001");
assert.equal(receipt.sequence, acceptance.sequence + 1);
assert.equal(receipt.previous_receipt_ref, "evaluation/owner-acceptance-stage-0.json");
assert.equal(receipt.status, "FROZEN_PREPARATION_MODEL_RUN_NOT_AUTHORIZED");
assert.equal(receipt.model_run_authorized, false);
assert.equal(receipt.github_publication_authorized, false);
assert.match(receipt.task_index_digest, /^sha256:[0-9a-f]{64}$/u);
assert.match(receipt.private_packet_digest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(receipt.private_source_receipts.length, 9);
for (const source of receipt.private_source_receipts) {
  assert.ok(!source.path.includes("\\") && !source.path.startsWith("/"));
  assert.ok(Number.isSafeInteger(source.bytes) && source.bytes > 0);
  assert.match(source.sha256, /^sha256:[0-9a-f]{64}$/u);
}

assert.deepEqual(receipt.tasks.map((task) => task.task_id), ["S0-T01", "S0-T02", "S0-T03", "S0-T04", "S0-T05"]);
assert.deepEqual(receipt.tasks.map((task) => task.stratum), [
  "SHORT_CONTROL_EXPECTED_TO_LOSE",
  "LONG_BOUNDED_BUILD",
  "CONTRADICTORY_CONTEXT",
  "STATE_CHANGED_AFTER_APPROVAL",
  "BOUNDARY_OR_INJECTION_STRESS",
]);
for (const task of receipt.tasks) {
  assert.match(task.transition_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(task.workspace_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(Number.isSafeInteger(task.workspace_bytes) && task.workspace_bytes > 0);
  assert.ok(Number.isSafeInteger(task.workspace_file_count) && task.workspace_file_count > 0);
}
assert.ok(receipt.tasks[0].workspace_bytes < 10000, "Short control is not short");
for (const task of receipt.tasks.slice(1)) assert.ok(task.workspace_bytes > 250000, `${task.task_id} is not a substantial-context task`);

assert.equal(receipt.design.condition_runs, 20);
assert.equal(receipt.design.maximum_agent_hours, 10);
assert.equal(receipt.design.provider_calls_ceiling, 140);
assert.equal(receipt.design.input_token_ceiling, 20000000);
assert.equal(receipt.design.output_token_ceiling, 680000);
assert.equal(receipt.design.per_request_input_token_ceiling, 260000);
assert.equal(receipt.design.api_text_charge_ceiling_usd, 80);
assert.equal(receipt.design.human_review_seconds_ceiling, 1800);
assert.equal(receipt.design.maximum_total_economic_cost_at_100_usd_per_hour, 130);
assert.equal(receipt.design.paid_builtin_tools, "DISABLED");
assert.equal(receipt.design.automatic_retry, false);
assert.equal(receipt.design.two_key_extension, "DISABLED");
assert.equal(receipt.design.pedal_protocol, "SHADOW_ONLY");

assert.equal(receipt.telemetry_feasibility.official_response_usage_and_model_fields_documented, true);
assert.equal(receipt.telemetry_feasibility.synthetic_parser_and_rejection_fixtures, "PASS_2_ACCEPTANCE_5_REJECTIONS");
assert.equal(receipt.telemetry_feasibility.live_provider_capture, "NOT_RUN");
assert.equal(receipt.telemetry_feasibility.invoice_reconciliation, "NOT_RUN");
assert.equal(receipt.telemetry_feasibility.missing_completed_call_usage_rule, "HOLD");
assert.equal(receipt.remaining_run_gates.length, 4);
assert.equal(
  receipt.claim_ceiling,
  "TASK_AND_RESOURCE_PLAN_IDENTITY_ONLY_NO_LIVE_TELEMETRY_NO_MODEL_RUN_NO_SAVINGS_QUALITY_OR_RESILIENCE_CLAIM",
);

process.stdout.write([
  "CLUTCH STAGE 0 PREPARATION VERIFY PASS",
  `tasks=${receipt.tasks.length}`,
  `condition_runs=${receipt.design.condition_runs}`,
  `task_index_digest=${receipt.task_index_digest}`,
  `private_packet_digest=${receipt.private_packet_digest}`,
  `hard_text_charge_ceiling_usd=${receipt.design.api_text_charge_ceiling_usd}`,
  `telemetry_parser=${receipt.telemetry_feasibility.synthetic_parser_and_rejection_fixtures}`,
  "live_provider_capture=NOT_RUN",
  "model_run_authorized=false",
  "claim_ceiling=PREPARATION_IDENTITY_ONLY",
].join("\n") + "\n");
