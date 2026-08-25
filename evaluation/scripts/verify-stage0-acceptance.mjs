#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evaluationRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(name) {
  return JSON.parse(readFileSync(join(evaluationRoot, name), "utf8"));
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const acceptance = readJson("owner-acceptance-stage-0.json");
const proposalBytes = readFileSync(join(evaluationRoot, "study-proposal.json"));
const proposal = JSON.parse(proposalBytes.toString("utf8"));
const preregistration = readJson("preregistration.example.json");

assert.equal(acceptance.schema_version, "clutch-owner-acceptance.v1");
assert.equal(acceptance.acceptance_id, "clutch-stage-0-preparation-acceptance-001");
assert.equal(acceptance.sequence, 1);
assert.equal(acceptance.previous_acceptance_digest, null);
assert.equal(acceptance.status, "ACCEPTED_STAGE_0_PREPARATION_ONLY");
assert.equal(acceptance.source_statement_minimized, "Approved.");
assert.equal(acceptance.proposal_ref.path, "evaluation/study-proposal.json");
assert.equal(acceptance.proposal_ref.sha256, digest(proposalBytes));
assert.equal(acceptance.proposal_ref.schema_version, proposal.schema_version);
assert.equal(acceptance.proposal_ref.status, proposal.status);

const scope = acceptance.accepted_scope;
assert.equal(scope.primary_comparison, proposal.measurement_model.recommended_primary_comparison);
assert.equal(scope.stage_0_preparation_authorized, true);
assert.equal(scope.stage_0_model_run_authorized, false);
assert.equal(scope.stage_0_independent_tasks, proposal.stage_0.independent_tasks);
assert.equal(scope.stage_0_condition_runs, proposal.stage_0.condition_runs);
assert.equal(scope.stage_0_maximum_agent_hours, proposal.stage_0.maximum_agent_hours);
assert.equal(scope.primary_worker, proposal.model_configuration.primary_worker_block.requested_model);
assert.equal(scope.replication_worker, proposal.model_configuration.replication_worker_block.requested_model);
assert.equal(scope.replication_status, "DEFERRED_SEPARATE");
assert.equal(scope.pedal_protocol, "SHADOW_ONLY");
assert.equal(scope.two_key_extension, "DESIGN_LATER_DEFAULT_OFF_NO_ACTIVATION");
assert.equal(scope.github_publication_authorized, false);
assert.deepEqual(scope.outcome_claims_authorized, []);

assert.equal(acceptance.decision_dispositions.length, 6);
assert.deepEqual(
  acceptance.decision_dispositions.map((decision) => decision.decision_id),
  ["OD-001", "OD-002", "OD-003", "OD-004", "OD-005", "OD-006"],
);
assert.equal(
  acceptance.decision_dispositions.find((decision) => decision.decision_id === "OD-003").accepted_value,
  "DEFER_UNTIL_AFTER_STAGE_0_NO_STAGE_0_OUTCOME_CLAIM",
);
assert.equal(
  acceptance.decision_dispositions.find((decision) => decision.decision_id === "OD-004").accepted_value,
  "STAGE_0_RAW_SECONDS_PLUS_25_50_100_SENSITIVITY_NO_PRIMARY_COST_VERDICT",
);
assert.equal(
  acceptance.decision_dispositions.find((decision) => decision.decision_id === "OD-006").accepted_value,
  "DESIGN_SEPARATELY_AFTER_HUMAN_APPROVED_PATH_STABLE_NO_ACTIVATION",
);

assert.ok(Array.isArray(acceptance.remaining_run_gates) && acceptance.remaining_run_gates.length === 5);
assert.equal(proposal.run_authorized, false);
assert.equal(proposal.github_publication_authorized, false);
assert.equal(proposal.control_plane.two_key_extension.status, "PROPOSED_DEFAULT_OFF_NOT_IMPLEMENTED_NOT_IN_CURRENT_STUDY");
assert.equal(preregistration.status, "DRAFT_OWNER_APPROVAL_REQUIRED");
assert.equal(preregistration.run_authorized, false);
assert.equal(preregistration.frozen, false);
assert.equal(
  acceptance.claim_ceiling,
  "OWNER_ACCEPTED_STAGE_0_PREPARATION_ONLY_NO_MODEL_RUN_NO_PUBLICATION_NO_OUTCOME_CLAIM",
);

process.stdout.write([
  "CLUTCH STAGE 0 ACCEPTANCE VERIFY PASS",
  "status=ACCEPTED_STAGE_0_PREPARATION_ONLY",
  "stage_0_preparation_authorized=true",
  "stage_0_model_run_authorized=false",
  "github_publication_authorized=false",
  "two_key_extension=DISABLED",
  "pedal_protocol=SHADOW_ONLY",
  "quality_margin=DEFERRED_UNTIL_AFTER_STAGE_0",
  "review_cost=RAW_SECONDS_PLUS_SENSITIVITY_ONLY",
  "claim_ceiling=PREPARATION_ONLY",
].join("\n") + "\n");
