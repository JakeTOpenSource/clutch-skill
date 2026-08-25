#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const evaluationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(evaluationRoot);

function readJson(...segments) {
  return JSON.parse(readFileSync(join(evaluationRoot, ...segments), "utf8"));
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

const claims = readJson("claims.json");
const preregistration = readJson("preregistration.example.json");
const pilot = readJson("evidence", "pilot-v21.json");
const projectionFailure = readJson("evidence", "projection-v5-failure.json");
const projectionPass = readJson("evidence", "projection-v6.json");

assert.equal(claims.schema_version, "clutch-claim-ledger.v1");
assert.equal(claims.release, "0.4.0-rc.1");
assert.equal(claims.status, "PREPARE_ONLY");
assert.ok(Array.isArray(claims.claims) && claims.claims.length > 0);

const evidenceIds = new Set([
  "protocol-conformance-suite",
  "portability-fixture-suite",
  pilot.evidence_id,
  projectionFailure.evidence_id,
  projectionPass.evidence_id,
]);
const claimIds = new Set();
for (const claim of claims.claims) {
  assert.match(claim.claim_id, /^CLM-[0-9]{3}$/);
  assert.ok(!claimIds.has(claim.claim_id), `Duplicate claim ID ${claim.claim_id}`);
  claimIds.add(claim.claim_id);
  assert.ok(["SUPPORTED_LOCAL", "PRELIMINARY", "UNPROVEN", "UNCLAIMED", "UNTESTED"].includes(claim.status));
  assert.ok(Array.isArray(claim.evidence_refs));
  for (const evidence of claim.evidence_refs) assert.ok(evidenceIds.has(evidence), `${claim.claim_id} cites unknown evidence ${evidence}`);
  assert.ok(Array.isArray(claim.prohibited_expansions) && claim.prohibited_expansions.length > 0);
  if (["UNPROVEN", "UNCLAIMED", "UNTESTED"].includes(claim.status)) {
    assert.equal(claim.public_statement, null, `${claim.claim_id} cannot have public wording`);
    assert.equal(claim.evidence_refs.length, 0, `${claim.claim_id} cannot cite supporting evidence`);
  } else {
    assert.equal(typeof claim.public_statement, "string");
    assert.ok(claim.public_statement.length > 0);
    assert.ok(claim.evidence_refs.length > 0);
  }
}

assert.equal(preregistration.schema_version, "clutch-preregistration.v2");
assert.equal(preregistration.status, "DRAFT_OWNER_APPROVAL_REQUIRED");
assert.equal(preregistration.run_authorized, false);
assert.equal(preregistration.frozen, false);
assert.deepEqual(preregistration.owner_approval, {
  status: "PENDING",
  approval_digest: null,
  approved_at_utc: null,
});
assert.deepEqual(preregistration.conditions, [
  "FRONTIER_FULL_CONTEXT",
  "WORKER_FULL_CONTEXT",
  "WORKER_AUTO_CARD",
  "WORKER_APPROVED_CARD",
]);
assert.equal(preregistration.fixed_controls.one_worker_attempt, true);
assert.equal(preregistration.fixed_controls.automatic_retry, false);
assert.deepEqual(preregistration.fixed_controls.clutch_control_roles, [
  "ROLE_MODEL_ADVISOR",
  "TRUSTED_ORCHESTRATOR",
  "HUMAN_OWNER",
]);
assert.equal(preregistration.fixed_controls.worker_clutch_control, false);
assert.equal(preregistration.fixed_controls.verifier_clutch_control, false);
assert.equal(preregistration.fixed_controls.human_approval_before_worker_assignment, true);
for (const [field, value] of Object.entries(preregistration.frozen_artifacts)) {
  assert.equal(value, null, `Draft frozen artifact ${field} must remain visibly unresolved`);
}
for (const field of [
  "bootstrap_iterations",
  "bootstrap_seed",
  "noninferiority_margin_basis_points",
  "required_total_tasks",
  "minimum_tasks_per_release_critical_stratum",
  "power_analysis_or_simulation_digest",
]) {
  assert.equal(preregistration.analysis_config[field], null, `Draft analysis decision ${field} must remain unresolved`);
}
assert.equal(preregistration.analysis_config.quality_one_sided_alpha_ppm, 50000);
assert.equal(preregistration.analysis_config.efficiency_two_sided_alpha_ppm, 50000);
assert.equal(preregistration.quality_gates.critical_harm_definitions, null);
for (const [field, value] of Object.entries(preregistration.quality_gates.maximum_approved_card_events)) {
  assert.equal(value, null, `Draft event threshold ${field} must remain unresolved`);
}
for (const field of [
  "minimum_reviewers_per_task",
  "maximum_false_approval_rate_basis_points",
  "maximum_false_rejection_rate_basis_points",
]) {
  assert.equal(preregistration.quality_gates.human_review[field], null, `Draft review decision ${field} must remain unresolved`);
}
assert.equal(preregistration.cost_accounting.human_review_cost_microusd_per_second, null);
assert.equal(preregistration.cost_accounting.price_source_and_retrieval_time, null);

assert.equal(pilot.schema_version, "clutch-minimized-evidence.v1");
assert.equal(pilot.evidence_id, "E-PILOT-V21");
assert.equal(pilot.design.preregistered, true);
assert.equal(pilot.design.paired_rounds, 6);
assert.equal(pilot.design.automatic_retry, false);
assert.equal(pilot.quality.direct.accepted, 5);
assert.equal(pilot.quality.direct.attempted, 6);
assert.equal(pilot.quality.direct.quality_bar_pass, false);
assert.equal(pilot.quality.clutch.accepted, 6);
assert.equal(pilot.quality.clutch.attempted, 6);
assert.equal(pilot.quality.clutch.quality_bar_pass, true);
assert.equal(pilot.comparison_gate.comparison_authorized, false);
assert.equal(pilot.comparison_gate.verdict, "NOT_AUTHORIZED_QUALITY_BAR");

const rawReduction = 1 - pilot.measurements.clutch.raw_input_plus_output_tokens / pilot.measurements.direct.raw_input_plus_output_tokens;
const uncachedReduction = 1 - pilot.measurements.clutch.uncached_input_plus_output_tokens / pilot.measurements.direct.uncached_input_plus_output_tokens;
const promptReduction = 1 - pilot.measurements.clutch.prompt_bytes / pilot.measurements.direct.prompt_bytes;
const latencyChange = pilot.measurements.clutch.elapsed_milliseconds / pilot.measurements.direct.elapsed_milliseconds - 1;
close(rawReduction, 0.5645327768996007);
close(uncachedReduction, 0.46348747225878884);
close(promptReduction, 0.7691361662413342);
close(latencyChange, 0.1508368147098178);
for (let index = 1; index < pilot.measurements.clutch_prompt_over_direct_by_round.length; index += 1) {
  assert.ok(
    pilot.measurements.clutch_prompt_over_direct_by_round[index] > pilot.measurements.clutch_prompt_over_direct_by_round[index - 1],
    "Pilot prompt ratio must retain its observed monotonic growth",
  );
}

assert.equal(projectionFailure.evidence_id, "E-PROJECTION-V5-FAIL");
assert.equal(projectionFailure.status, "FAIL");
assert.equal(projectionFailure.disposition, "PRESERVED_AS_FAILED_NEGATIVE_RESULT_DO_NOT_ADOPT");
assert.equal(projectionPass.evidence_id, "E-PROJECTION-V6");
assert.equal(projectionPass.status, "PASS");
assert.equal(projectionPass.candidate_subsets_evaluated, 512);
assert.equal(projectionPass.selected_fields.length, 3);
assert.ok(projectionPass.selected_manifest_bytes > projectionFailure.observed_manifest_bytes, "Corrected manifest must preserve the measured cost of the repair");
assert.ok(projectionPass.selected_manifest_bytes < projectionPass.all_fields_manifest_bytes);
assert.equal(projectionPass.worker_context_bytes_before, projectionPass.worker_context_bytes_after);
assert.deepEqual(projectionPass.v5_shortcut_failures, [
  "TASK_ID_CHANGE",
  "ALLOWED_ACTION_CHANGE",
  "FORBIDDEN_ACTION_CHANGE",
]);

const publicFiles = [
  "README.md",
  "Clutch-Skill.md",
  join("clutch", "SKILL.md"),
  join("docs", "architecture.md"),
];
const prohibitedMarketing = [
  /preserv(?:e|es|ed) (?:all )?(?:long-context )?coherence/i,
  /guarantee(?:s|d)? (?:token |cost )?savings/i,
  /reduces cost by construction/i,
  /works on every harness/i,
];
for (const relativePath of publicFiles) {
  const text = readFileSync(join(repositoryRoot, relativePath), "utf8");
  for (const pattern of prohibitedMarketing) {
    assert.ok(!pattern.test(text), `${relativePath} exceeds the claim ledger with ${pattern}`);
  }
}

const analysisVerification = spawnSync(process.execPath, [join(evaluationRoot, "scripts", "verify-analysis.mjs")], {
  cwd: repositoryRoot,
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(analysisVerification.status, 0, analysisVerification.stderr || analysisVerification.stdout);
assert.match(analysisVerification.stdout, /^CLUTCH STUDY ANALYSIS VERIFY PASS$/m);

const proposalVerification = spawnSync(process.execPath, [join(evaluationRoot, "scripts", "verify-study-proposal.mjs")], {
  cwd: repositoryRoot,
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(proposalVerification.status, 0, proposalVerification.stderr || proposalVerification.stdout);
assert.match(proposalVerification.stdout, /^CLUTCH STUDY PROPOSAL VERIFY PASS$/m);

const acceptanceVerification = spawnSync(process.execPath, [join(evaluationRoot, "scripts", "verify-stage0-acceptance.mjs")], {
  cwd: repositoryRoot,
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(acceptanceVerification.status, 0, acceptanceVerification.stderr || acceptanceVerification.stdout);
assert.match(acceptanceVerification.stdout, /^CLUTCH STAGE 0 ACCEPTANCE VERIFY PASS$/m);

const preparationVerification = spawnSync(process.execPath, [join(evaluationRoot, "scripts", "verify-stage0-preparation.mjs")], {
  cwd: repositoryRoot,
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(preparationVerification.status, 0, preparationVerification.stderr || preparationVerification.stdout);
assert.match(preparationVerification.stdout, /^CLUTCH STAGE 0 PREPARATION VERIFY PASS$/m);

process.stdout.write([
  "CLUTCH EVALUATION VERIFY PASS",
  `claims=${claims.claims.length}`,
  "preregistration=DRAFT_OWNER_APPROVAL_REQUIRED",
  "model_run_authorized=false",
  "study_proposal=PROPOSED_OWNER_REVIEW_NOT_AUTHORIZED",
  "stage_0_acceptance=PREPARATION_ONLY_NO_MODEL_RUN",
  "stage_0_packet=FROZEN_PRIVATE_TASKS_AND_HARD_STOPS_NO_MODEL_RUN",
  "minimized_evidence_records=3",
  "negative_results_preserved=1",
  "analysis_fixture_cases=20",
  `pilot_raw_token_delta_percent=${(rawReduction * 100).toFixed(2)}`,
  `pilot_uncached_token_delta_percent=${(uncachedReduction * 100).toFixed(2)}`,
  `pilot_prompt_byte_delta_percent=${(promptReduction * 100).toFixed(2)}`,
  `pilot_elapsed_delta_percent=+${(latencyChange * 100).toFixed(2)}`,
  "pilot_efficiency_winner=NOT_AUTHORIZED_QUALITY_BAR",
  "claim_ceiling=EVALUATION_STRUCTURE_AND_MINIMIZED_LOCAL_OBSERVATIONS_ONLY",
].join("\n") + "\n");
