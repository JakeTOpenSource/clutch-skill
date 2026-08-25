#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evaluationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (name) => JSON.parse(readFileSync(join(evaluationRoot, name), "utf8"));
const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const authorization = readJson("owner-authorization-live-telemetry.json");
const priorReceiptBytes = readFileSync(join(evaluationRoot, "stage-0-preparation-receipt.json"));
const priorReceipt = JSON.parse(priorReceiptBytes);

assert.equal(authorization.schema_version, "clutch-owner-authorization.v1");
assert.equal(authorization.authorization_id, "clutch-live-telemetry-probe-authorization-001");
assert.equal(authorization.sequence, priorReceipt.sequence + 1);
assert.equal(authorization.previous_receipt_ref, "evaluation/stage-0-preparation-receipt.json");
assert.equal(authorization.previous_receipt_sha256, sha256(priorReceiptBytes));
assert.equal(authorization.status, "AUTHORIZED_BOUNDED_LIVE_TELEMETRY_PROBE_ONLY");
assert.equal(
  authorization.observation_boundary,
  "APPROVAL_OBSERVED_IN_CURRENT_TRUSTED_HOST_CONVERSATION_REPOSITORY_DOES_NOT_AUTHENTICATE_SPEAKER",
);
assert.deepEqual(authorization.source_statements_minimized, ["You have my blessing.", "Approved on the rest."]);

const scope = authorization.accepted_scope;
assert.equal(scope.purpose, "VERIFY_LIVE_PROVIDER_MODEL_AND_USAGE_TELEMETRY_BEFORE_ANY_STAGE_0_BUILD");
assert.equal(scope.maximum_provider_calls, 2);
assert.deepEqual(scope.call_order, ["gpt-5.6-sol", "gpt-5.6-terra"]);
assert.equal(scope.maximum_observed_input_tokens_per_call, 2000);
assert.equal(scope.maximum_output_tokens_per_call, 64);
assert.equal(scope.maximum_aggregate_calculated_text_charge_nanousd, 50000000);
assert.equal(scope.service_tier, "default");
assert.equal(scope.reasoning_effort, "none");
assert.equal(scope.tools, "DISABLED");
assert.equal(scope.response_storage, false);
assert.equal(scope.automatic_retry, false);
assert.equal(scope.model_file_mutation, false);
assert.equal(scope.raw_provider_payload_publication, false);
assert.equal(scope.minimized_receipt_permitted, true);
assert.equal(scope.stage_0_build_or_model_run_authorized, false);
assert.equal(scope.github_publication_authorized, false);
assert.deepEqual(scope.outcome_claims_authorized, []);
assert.equal(authorization.gates.length, 5);
assert.equal(
  authorization.claim_ceiling,
  "LIVE_TELEMETRY_FEASIBILITY_ONLY_NO_STAGE_0_RUN_NO_SAVINGS_QUALITY_RESILIENCE_OR_GENERAL_MODEL_CLAIM",
);

process.stdout.write([
  "CLUTCH LIVE TELEMETRY AUTHORIZATION VERIFY PASS",
  `authorization_id=${authorization.authorization_id}`,
  `provider_calls_ceiling=${scope.maximum_provider_calls}`,
  `text_charge_ceiling_nanousd=${scope.maximum_aggregate_calculated_text_charge_nanousd}`,
  "stage0_model_run_authorized=false",
  "github_publication_authorized=false",
  "claim_ceiling=LIVE_TELEMETRY_FEASIBILITY_ONLY",
].join("\n") + "\n");
