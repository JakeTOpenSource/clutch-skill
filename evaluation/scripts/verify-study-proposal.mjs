#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evaluationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(evaluationRoot);

function readJson(...segments) {
  return JSON.parse(readFileSync(join(repositoryRoot, ...segments), "utf8"));
}

const proposal = readJson("evaluation", "study-proposal.json");
const preregistration = readJson("evaluation", "preregistration.example.json");
const modelMap = readJson("model-map.example.json");

assert.equal(proposal.schema_version, "clutch-study-proposal.v1");
assert.equal(proposal.status, "PROPOSED_OWNER_REVIEW");
assert.equal(proposal.run_authorized, false);
assert.equal(proposal.github_publication_authorized, false);
assert.equal(proposal.owner_acceptance, null);
assert.equal(
  proposal.claim_ceiling,
  "OWNER_REVIEW_PROPOSAL_AND_POWER_SENSITIVITY_ONLY_NO_RUN_NO_PUBLICATION_NO_OUTCOME_CLAIM",
);

assert.equal(proposal.measurement_model.independent_unit, "THIRTY_MINUTE_BUILD_SESSION");
assert.equal(proposal.measurement_model.condition_runs_per_task, 4);
assert.equal(proposal.measurement_model.transitions_are_independent_samples, false);
assert.equal(
  proposal.measurement_model.state_transitions_per_session
    * proposal.measurement_model.minutes_per_transition,
  30,
);
assert.equal(proposal.measurement_model.all_conditions_start_with_same_frontier_preflight, true);
assert.equal(
  proposal.measurement_model.recommended_primary_comparison,
  "WORKER_APPROVED_CARD_MINUS_WORKER_FULL_CONTEXT",
);
assert.equal(
  proposal.measurement_model.automatic_card_interpretation,
  "AUTOMATIC_CARD_TRANSFORMATION_NOT_PURE_COMPRESSION",
);
assert.equal(
  proposal.measurement_model.required_route_cost_scope,
  "ALL_PROVIDER_CALLS_PLUS_HUMAN_REVIEW",
);

assert.equal(proposal.stage_0.status, "PROPOSED_NOT_AUTHORIZED");
assert.equal(proposal.stage_0.independent_tasks, proposal.stage_0.required_strata.length);
assert.equal(
  proposal.stage_0.condition_runs,
  proposal.stage_0.independent_tasks * proposal.measurement_model.condition_runs_per_task,
);
assert.equal(
  proposal.stage_0.maximum_agent_hours,
  proposal.stage_0.condition_runs * proposal.stage_0.maximum_condition_run_minutes / 60,
);
assert.deepEqual(proposal.stage_0.outcome_claims_authorized, []);
assert.equal(proposal.stage_1.status, "BLOCKED_PENDING_STAGE_0_AND_OWNER_FREEZE");
assert.equal(proposal.stage_1.sample_size, null);
assert.equal(proposal.stage_1.recommended_power, 0.8);
assert.equal(proposal.stage_1.fixed_one_sided_alpha, 0.05);

assert.equal(
  proposal.model_configuration.frontier_and_advisor.requested_model,
  modelMap.profiles.advisor.model,
);
assert.equal(
  proposal.model_configuration.frontier_and_advisor.reasoning_effort,
  modelMap.profiles.advisor.reasoning_effort,
);
assert.equal(
  proposal.model_configuration.primary_worker_block.requested_model,
  modelMap.profiles.balanced.model,
);
assert.equal(
  proposal.model_configuration.primary_worker_block.reasoning_effort,
  modelMap.profiles.balanced.reasoning_effort,
);
assert.equal(
  proposal.model_configuration.replication_worker_block.requested_model,
  modelMap.profiles.economy.model,
);
assert.equal(
  proposal.model_configuration.replication_worker_block.reasoning_effort,
  modelMap.profiles.economy.reasoning_effort,
);
assert.equal(proposal.model_configuration.replication_worker_block.analysis, "SEPARATE_REPLICATION_DO_NOT_POOL");

assert.deepEqual(proposal.control_plane.implemented_current_path.allowed_clutch_control_roles, [
  "ROLE_MODEL_ADVISOR",
  "TRUSTED_ORCHESTRATOR",
  "HUMAN_OWNER",
]);
assert.equal(proposal.control_plane.implemented_current_path.worker_clutch_control, false);
assert.equal(proposal.control_plane.implemented_current_path.verifier_clutch_control, false);
assert.equal(proposal.control_plane.implemented_current_path.human_approval_before_worker_assignment, true);
assert.equal(proposal.control_plane.implemented_current_path.actor_ids_must_be_policy_allowlisted, true);
assert.equal(
  proposal.control_plane.two_key_extension.status,
  "PROPOSED_DEFAULT_OFF_NOT_IMPLEMENTED_NOT_IN_CURRENT_STUDY",
);
assert.equal(proposal.control_plane.two_key_extension.provisional_result_only, true);
assert.equal(
  proposal.control_plane.two_key_extension.deadlock_rule,
  "RETURN_TO_NEUTRAL_AND_REQUIRE_HUMAN_TIE_BREAK",
);
assert.equal(proposal.pedal_protocol.status, "PROPOSED_SHADOW_MEASUREMENT_NOT_ADAPTIVE_ROUTING");
assert.deepEqual(proposal.pedal_protocol.candidate_transfer_levels, ["CARD", "EXPANDED", "FULL_CONTEXT"]);
assert.equal(
  proposal.pedal_protocol.stage_0_rule,
  "RECORD_WHAT_THE_SELECTOR_WOULD_CHOOSE_BUT_DO_NOT_CHANGE_THE_ASSIGNED_EXPERIMENTAL_CONDITION",
);
assert.equal(
  proposal.pedal_protocol.feedback_cycle,
  "INTAKE_CURRENT_STATE_THEN_COMPRESS_TO_SMALLEST_FIT_THEN_ONE_ATTEMPT_THEN_RECEIPT_THEN_NEW_CARD_WITH_OBSERVED_ERROR",
);

const power = proposal.power_sensitivity;
assert.equal(power.status, "PLANNING_APPROXIMATION_ONLY");
assert.equal(power.expected_true_paired_difference, 0);
assert.equal(power.rows.length, 15);
const expectedRows = [];
for (const marginBasisPoints of [500, 1000, 1500]) {
  for (const discordanceBasisPoints of [500, 1000, 2000, 3000, 5000]) {
    const margin = marginBasisPoints / 10000;
    const discordance = discordanceBasisPoints / 10000;
    const tasks80 = Math.ceil(
      ((power.z_one_sided_95 + power.z_power_80) ** 2 * discordance) / margin ** 2,
    );
    const tasks90 = Math.ceil(
      ((power.z_one_sided_95 + power.z_power_90) ** 2 * discordance) / margin ** 2,
    );
    expectedRows.push({
      margin_basis_points: marginBasisPoints,
      paired_discordance_basis_points: discordanceBasisPoints,
      tasks_80_power: tasks80,
      counterbalanced_tasks_80_power: Math.ceil(tasks80 / 4) * 4,
      tasks_90_power: tasks90,
      counterbalanced_tasks_90_power: Math.ceil(tasks90 / 4) * 4,
    });
  }
}
assert.deepEqual(power.rows, expectedRows, "Power-sensitivity rows do not reproduce the declared formula");

assert.equal(proposal.human_review_accounting.primary_time_value, null);
assert.deepEqual(proposal.human_review_accounting.review_time_value_options_usd_per_hour, [25, 50, 100]);
assert.ok(Array.isArray(proposal.owner_decisions_required) && proposal.owner_decisions_required.length === 6);
for (const decision of proposal.owner_decisions_required) {
  assert.match(decision.decision_id, /^OD-00[1-6]$/);
  assert.equal(decision.accepted_value, null, `${decision.decision_id} was silently accepted`);
}

assert.equal(preregistration.status, "DRAFT_OWNER_APPROVAL_REQUIRED");
assert.equal(preregistration.run_authorized, false);
assert.equal(preregistration.frozen, false);
assert.equal(preregistration.owner_approval.status, "PENDING");
assert.equal(preregistration.owner_approval.approval_digest, null);
assert.equal(preregistration.owner_approval.approved_at_utc, null);

process.stdout.write([
  "CLUTCH STUDY PROPOSAL VERIFY PASS",
  "status=PROPOSED_OWNER_REVIEW",
  "run_authorized=false",
  "github_publication_authorized=false",
  `stage_0_tasks=${proposal.stage_0.independent_tasks}`,
  `stage_0_condition_runs=${proposal.stage_0.condition_runs}`,
  `stage_0_maximum_agent_hours=${proposal.stage_0.maximum_agent_hours}`,
  `power_sensitivity_rows=${power.rows.length}`,
  "independent_unit=THIRTY_MINUTE_BUILD_SESSION",
  "transitions_as_samples=false",
  "clutch_control_roles=3",
  "two_key_extension=PROPOSED_DEFAULT_OFF",
  "pedal_protocol=PROPOSED_SHADOW_ONLY",
  "claim_ceiling=OWNER_REVIEW_PROPOSAL_ONLY",
].join("\n") + "\n");
