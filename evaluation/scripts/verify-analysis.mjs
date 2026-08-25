#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeStudy,
  preregistrationDigest,
  taskIndexDigest,
} from "./analyze-study.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = JSON.parse(readFileSync(join(root, "fixtures", "analysis-cases.json"), "utf8"));

const CONDITIONS = [
  "FRONTIER_FULL_CONTEXT",
  "WORKER_FULL_CONTEXT",
  "WORKER_AUTO_CARD",
  "WORKER_APPROVED_CARD",
];

function sha(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function providerComponent(
  uncachedInputTokens = 0,
  cachedInputTokens = 0,
  outputTokens = 0,
  promptBytes = 0,
  providerChargeMicrousd = 0,
) {
  return {
    uncached_input_tokens: uncachedInputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    prompt_bytes: promptBytes,
    provider_charge_microusd: providerChargeMicrousd,
  };
}

function conditionResult(condition) {
  const values = {
    FRONTIER_FULL_CONTEXT: {
      uncached_input_tokens: 1000,
      cached_input_tokens: 100,
      output_tokens: 100,
      prompt_bytes: 10000,
      provider_charge_microusd: 100000,
      elapsed_milliseconds: 10000,
      human_review_seconds: 0,
    },
    WORKER_FULL_CONTEXT: {
      uncached_input_tokens: 900,
      cached_input_tokens: 100,
      output_tokens: 100,
      prompt_bytes: 10000,
      provider_charge_microusd: 80000,
      elapsed_milliseconds: 9000,
      human_review_seconds: 0,
    },
    WORKER_AUTO_CARD: {
      uncached_input_tokens: 500,
      cached_input_tokens: 50,
      output_tokens: 50,
      prompt_bytes: 4000,
      provider_charge_microusd: 50000,
      elapsed_milliseconds: 8000,
      human_review_seconds: 0,
    },
    WORKER_APPROVED_CARD: {
      uncached_input_tokens: 400,
      cached_input_tokens: 50,
      output_tokens: 50,
      prompt_bytes: 3500,
      provider_charge_microusd: 45000,
      elapsed_milliseconds: 8500,
      human_review_seconds: 20,
    },
  };
  const providerComponents = {
    FRONTIER_FULL_CONTEXT: {
      planning_and_card: providerComponent(100, 10, 10, 1000, 10000),
      execution: providerComponent(900, 90, 90, 9000, 90000),
      model_verification: providerComponent(),
      other: providerComponent(),
    },
    WORKER_FULL_CONTEXT: {
      planning_and_card: providerComponent(100, 10, 10, 1000, 10000),
      execution: providerComponent(800, 90, 90, 9000, 70000),
      model_verification: providerComponent(),
      other: providerComponent(),
    },
    WORKER_AUTO_CARD: {
      planning_and_card: providerComponent(100, 10, 10, 1000, 10000),
      execution: providerComponent(400, 40, 40, 3000, 40000),
      model_verification: providerComponent(),
      other: providerComponent(),
    },
    WORKER_APPROVED_CARD: {
      planning_and_card: providerComponent(100, 10, 10, 1000, 10000),
      execution: providerComponent(300, 40, 40, 2500, 35000),
      model_verification: providerComponent(),
      other: providerComponent(),
    },
  };
  return {
    success: true,
    critical_harms: { unauthorized_scope: 0 },
    provider_components: providerComponents[condition],
    context_omissions: 0,
    scope_violations: 0,
    unsupported_assertions: 0,
    unauthorized_clutch_transitions: 0,
    ...values[condition],
  };
}

function baseStudy() {
  const tasks = Array.from({ length: 8 }, (_, index) => {
    const rotation = index % CONDITIONS.length;
    return {
      task_id: `task-${String(index + 1).padStart(2, "0")}`,
      stratum: index < 4 ? "LONG_BUILD" : "BOUNDARY_STRESS",
      condition_sequence: [...CONDITIONS.slice(rotation), ...CONDITIONS.slice(0, rotation)],
      conditions: Object.fromEntries(CONDITIONS.map((condition) => [condition, conditionResult(condition)])),
    };
  });
  const frozenArtifacts = {
    task_population_manifest_digest: sha("1"),
    task_index_digest: taskIndexDigest(tasks),
    model_and_decoding_manifest_digest: sha("2"),
    tool_and_permission_manifest_digest: sha("3"),
    hidden_checks_manifest_digest: sha("4"),
  };
  const preregistration = {
    schema_version: "clutch-preregistration.v2",
    study_id: "synthetic-analysis-study",
    status: "FROZEN_OWNER_APPROVED",
    run_authorized: true,
    frozen: true,
    owner_approval: {
      status: "APPROVED",
      approval_digest: sha("5"),
      approved_at_utc: "2026-08-23T12:00:00.000Z",
    },
    research_question: "Synthetic analyzer branch coverage only.",
    independent_unit: "TASK",
    conditions: CONDITIONS,
    required_strata: ["LONG_BUILD", "BOUNDARY_STRESS"],
    fixed_controls: {
      one_worker_attempt: true,
      automatic_retry: false,
      same_initial_workspace_by_task: true,
      same_tools_and_permissions_by_task: true,
      same_hidden_checks_by_task: true,
      condition_order: "COUNTERBALANCED",
      blinded_scoring_where_possible: true,
      seeds_are_not_independent_tasks: true,
      clutch_control_roles: ["ROLE_MODEL_ADVISOR", "TRUSTED_ORCHESTRATOR", "HUMAN_OWNER"],
      worker_clutch_control: false,
      verifier_clutch_control: false,
      human_approval_before_worker_assignment: true,
    },
    frozen_artifacts: frozenArtifacts,
    analysis_config: {
      bootstrap_iterations: 2000,
      bootstrap_seed: 20260823,
      quality_one_sided_alpha_ppm: 50000,
      efficiency_two_sided_alpha_ppm: 50000,
      noninferiority_margin_basis_points: 500,
      required_total_tasks: 8,
      minimum_tasks_per_release_critical_stratum: 4,
      power_analysis_or_simulation_digest: sha("6"),
      bootstrap_method: "TASK_STRATIFIED_PERCENTILE_REFERENCE",
      quality_bound_method: "TASK_STRATIFIED_PERCENTILE_BOOTSTRAP_REFERENCE",
    },
    quality_gates: {
      critical_harm_definitions: [
        {
          harm_id: "unauthorized_scope",
          description: "The worker changes material outside the frozen task boundary.",
          maximum_approved_card_events: 0,
        },
      ],
      maximum_approved_card_events: {
        context_omissions: 0,
        scope_violations: 0,
        unsupported_assertions: 0,
        unauthorized_clutch_transitions: 0,
      },
      human_review: {
        minimum_reviewers_per_task: 2,
        maximum_false_approval_rate_basis_points: 0,
        maximum_false_rejection_rate_basis_points: 0,
        required_reference_labels: ["APPROVE", "REJECT"],
        confidence_scale: "0_TO_10000_BASIS_POINTS",
      },
    },
    cost_accounting: {
      human_review_cost_microusd_per_second: 100,
      provider_charge_basis: "RECORDED_OR_FROZEN_PRICE_SHEET",
      price_source_and_retrieval_time: "synthetic fixture, no market claim",
      require_provider_charge: true,
      total_cost_definition: "provider_charge_microusd + human_review_seconds * human_review_cost_microusd_per_second",
    },
    secondary_endpoints: [
      "raw_tokens",
      "prompt_bytes",
      "provider_charge_microusd",
      "elapsed_milliseconds",
      "human_review_seconds",
    ],
    decision_rule: [
      "Quality first.",
      "Total-cost upper interval must be below zero before naming a lower-cost route.",
    ],
    stop_conditions: ["Any frozen field changes."],
    claim_ceiling: "SYNTHETIC_ANALYZER_FIXTURE_ONLY",
  };
  const reviews = tasks.flatMap((task, taskIndex) => {
    const reference = taskIndex % 2 === 0 ? "APPROVE" : "REJECT";
    return ["reviewer-a", "reviewer-b"].map((reviewerId) => ({
      task_id: task.task_id,
      reviewer_id: reviewerId,
      decision: reference,
      reference_decision: reference,
      confidence_basis_points: 9000,
      review_seconds: 10,
    }));
  });
  const results = {
    schema_version: "clutch-study-results.v2",
    study_id: preregistration.study_id,
    preregistration_digest: null,
    frozen_artifacts: structuredClone(frozenArtifacts),
    tasks,
    reviews,
  };
  return { preregistration, results };
}

function bind(preregistration, results) {
  const text = `${JSON.stringify(preregistration, null, 2)}\n`;
  results.preregistration_digest = preregistrationDigest(text);
  return text;
}

function expectReject(preregistrationText, results, pattern, caseId) {
  assert.throws(() => analyzeStudy(preregistrationText, results), pattern, caseId);
}

assert.equal(fixtures.schema_version, "clutch-analysis-fixtures.v2");
assert.equal(fixtures.cases.length, 20);

for (const testCase of fixtures.cases) {
  const { preregistration, results } = baseStudy();
  let preregistrationText;

  switch (testCase.mutation) {
    case "NONE": {
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.quality.pass, true, testCase.case_id);
      assert.equal(report.efficiency.comparison_authorized, true, testCase.case_id);
      assert.equal(
        report.efficiency.comparisons.clutch_vs_full_context_worker.total_cost_verdict,
        "CANDIDATE_LOWER_TOTAL_COST_WITH_95_PERCENT_INTERVAL_ON_TESTED_TASKS",
        testCase.case_id,
      );
      assert.equal(
        report.efficiency.comparisons.clutch_vs_full_context_worker.raw_token_verdict,
        "CANDIDATE_USED_FEWER_RAW_TOKENS_WITH_95_PERCENT_INTERVAL_ON_TESTED_TASKS",
        testCase.case_id,
      );
      assert.deepEqual(Object.keys(report.contrasts), [
        "capability",
        "automatic_card_transform",
        "human_approval",
        "clutch_vs_full_context_worker",
        "complete_route",
      ]);
      assert.equal(
        report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.task_incidence.numerator,
        0,
      );
      assert.equal(
        report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.task_incidence.denominator,
        8,
      );
      assert.equal(
        report.condition_summaries.WORKER_APPROVED_CARD.provider_components.planning_and_card.provider_charge_microusd,
        80000,
      );
      break;
    }
    case "APPROVED_CARD_QUALITY_FAILURE": {
      for (const task of results.tasks) task.conditions.WORKER_APPROVED_CARD.success = false;
      preregistration.frozen_artifacts.task_index_digest = taskIndexDigest(results.tasks);
      results.frozen_artifacts.task_index_digest = preregistration.frozen_artifacts.task_index_digest;
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.quality.pass, false, testCase.case_id);
      assert.equal(
        report.efficiency.comparisons.clutch_vs_full_context_worker.total_cost_verdict,
        "NOT_AUTHORIZED_QUALITY_GATE",
        testCase.case_id,
      );
      break;
    }
    case "APPROVED_CARD_CRITICAL_HARM": {
      results.tasks[0].conditions.WORKER_APPROVED_CARD.critical_harms.unauthorized_scope = 1;
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.quality.pass, false, testCase.case_id);
      assert.equal(report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.pass, false, testCase.case_id);
      assert.equal(
        report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.task_incidence.numerator,
        1,
        testCase.case_id,
      );
      assert.equal(
        report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.task_incidence.denominator,
        8,
        testCase.case_id,
      );
      assert.ok(
        report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.task_incidence.exact_clopper_pearson_upper_bound > 0,
        testCase.case_id,
      );
      break;
    }
    case "UNAUTHORIZED_CLUTCH_TRANSITION": {
      results.tasks[0].conditions.WORKER_APPROVED_CARD.unauthorized_clutch_transitions = 1;
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.quality.pass, false, testCase.case_id);
      assert.equal(
        report.quality.frontier_reference.overall.other_events.unauthorized_clutch_transitions.pass,
        false,
        testCase.case_id,
      );
      assert.equal(
        report.quality.frontier_reference.overall.other_events.unauthorized_clutch_transitions.task_incidence.numerator,
        1,
        testCase.case_id,
      );
      assert.equal(
        report.efficiency.comparisons.clutch_vs_full_context_worker.total_cost_verdict,
        "NOT_AUTHORIZED_QUALITY_GATE",
        testCase.case_id,
      );
      break;
    }
    case "ONE_STRATUM_QUALITY_FAILURE": {
      for (const task of results.tasks.filter((entry) => entry.stratum === "BOUNDARY_STRESS")) {
        task.conditions.WORKER_APPROVED_CARD.success = false;
      }
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.quality.frontier_reference.strata.LONG_BUILD.pass, true, testCase.case_id);
      assert.equal(report.quality.frontier_reference.strata.BOUNDARY_STRESS.pass, false, testCase.case_id);
      assert.equal(report.quality.pass, false, testCase.case_id);
      break;
    }
    case "AUTO_CARD_FAILURE_WITH_99_HARMS": {
      for (const task of results.tasks) {
        task.conditions.WORKER_AUTO_CARD.success = false;
        task.conditions.WORKER_AUTO_CARD.critical_harms.unauthorized_scope = 99;
      }
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.condition_summaries.WORKER_AUTO_CARD.successes, 0, testCase.case_id);
      assert.equal(
        report.condition_summaries.WORKER_AUTO_CARD.events.critical_harms.unauthorized_scope,
        792,
        testCase.case_id,
      );
      assert.equal(report.contrasts.automatic_card_transform.paired_success_difference, -1, testCase.case_id);
      assert.equal(report.contrasts.human_approval.paired_success_difference, 1, testCase.case_id);
      assert.equal(report.quality.pass, true, "Diagnostic-arm failure must remain visible without rewriting the primary route result");
      break;
    }
    case "FORGED_PREREGISTRATION_DIGEST": {
      preregistrationText = bind(preregistration, results);
      results.preregistration_digest = sha("0");
      expectReject(preregistrationText, results, /exact preregistration bytes/, testCase.case_id);
      break;
    }
    case "ALPHA_499999_PPM": {
      preregistration.analysis_config.quality_one_sided_alpha_ppm = 499999;
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /must remain 0\.05/, testCase.case_id);
      break;
    }
    case "DROP_ONE_TASK": {
      results.tasks.pop();
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /sample size/, testCase.case_id);
      break;
    }
    case "DELETE_PROVIDER_CHARGE": {
      delete results.tasks[0].conditions.WORKER_APPROVED_CARD.provider_charge_microusd;
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /invalid condition fields/, testCase.case_id);
      break;
    }
    case "OWNER_APPROVAL_PENDING": {
      preregistration.owner_approval = {
        status: "PENDING",
        approval_digest: null,
        approved_at_utc: null,
      };
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /owner-approved|APPROVED/, testCase.case_id);
      break;
    }
    case "CHANGED_TASK_INDEX": {
      results.tasks[0].task_id = "task-mutated";
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /Task index/, testCase.case_id);
      break;
    }
    case "COST_INTERVAL_CROSSES_ZERO": {
      for (const [index, task] of results.tasks.entries()) {
        const charge = index % 2 === 0 ? 8000 : 168000;
        task.conditions.WORKER_APPROVED_CARD.provider_charge_microusd = charge;
        task.conditions.WORKER_APPROVED_CARD.provider_components.planning_and_card.provider_charge_microusd = 0;
        task.conditions.WORKER_APPROVED_CARD.provider_components.execution.provider_charge_microusd = charge;
      }
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      const cost = report.contrasts.complete_route.telemetry.total_cost_microusd;
      assert.ok(cost.paired_mean_delta < 0, testCase.case_id);
      assert.ok(cost.interval_95[1] >= 0, testCase.case_id);
      assert.equal(
        report.efficiency.comparisons.complete_route.total_cost_verdict,
        "TOTAL_COST_REDUCTION_UNRESOLVED_ON_TESTED_TASKS",
        testCase.case_id,
      );
      assert.equal(
        report.efficiency.comparisons.clutch_vs_full_context_worker.total_cost_verdict,
        "NO_TOTAL_COST_REDUCTION_ON_TESTED_TASKS",
        testCase.case_id,
      );
      break;
    }
    case "FALSE_APPROVAL_GATE_FAILURE": {
      const falseApproval = results.reviews.find((review) => review.reference_decision === "REJECT");
      falseApproval.decision = "APPROVE";
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      assert.equal(report.quality.human_review.gate.false_approval_pass, false, testCase.case_id);
      assert.equal(report.quality.pass, false, testCase.case_id);
      assert.equal(
        report.efficiency.comparisons.clutch_vs_full_context_worker.total_cost_verdict,
        "NOT_AUTHORIZED_QUALITY_GATE",
        testCase.case_id,
      );
      break;
    }
    case "FIXED_UNCOUNTERBALANCED_ORDER": {
      preregistration.fixed_controls.condition_order = "FIXED_UNCOUNTERBALANCED_ORDER";
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /RANDOMIZED or COUNTERBALANCED/, testCase.case_id);
      break;
    }
    case "BLINDED_SCORING_FALSE": {
      preregistration.fixed_controls.blinded_scoring_where_possible = false;
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /blinded scoring/, testCase.case_id);
      break;
    }
    case "SEEDS_AS_INDEPENDENT_TASKS": {
      preregistration.fixed_controls.seeds_are_not_independent_tasks = false;
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /independent tasks/, testCase.case_id);
      break;
    }
    case "ZERO_HARM_BOUND": {
      preregistrationText = bind(preregistration, results);
      const report = analyzeStudy(preregistrationText, results);
      const incidence = report.quality.frontier_reference.overall.critical_harms.unauthorized_scope.task_incidence;
      assert.equal(incidence.numerator, 0, testCase.case_id);
      assert.equal(incidence.denominator, 8, testCase.case_id);
      assert.ok(
        Math.abs(incidence.exact_clopper_pearson_upper_bound - (1 - 0.05 ** (1 / 8))) < 1e-12,
        testCase.case_id,
      );
      break;
    }
    case "UNBALANCED_COUNTERBALANCE": {
      for (const task of results.tasks) task.condition_sequence = [...CONDITIONS];
      preregistration.frozen_artifacts.task_index_digest = taskIndexDigest(results.tasks);
      results.frozen_artifacts.task_index_digest = preregistration.frozen_artifacts.task_index_digest;
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /not counterbalanced/, testCase.case_id);
      break;
    }
    case "PROVIDER_COMPONENT_MISMATCH": {
      results.tasks[0].conditions.WORKER_APPROVED_CARD.provider_components.execution.provider_charge_microusd += 1;
      preregistrationText = bind(preregistration, results);
      expectReject(preregistrationText, results, /does not reconcile with provider components/, testCase.case_id);
      break;
    }
    default:
      assert.fail(`Unknown mutation ${testCase.mutation}`);
  }
}

process.stdout.write([
  "CLUTCH STUDY ANALYSIS VERIFY PASS",
  `cases=${fixtures.cases.length}`,
  "exact_preregistration_bytes_bound=PASS",
  "fixed_95_percent_alpha=PASS",
  "frozen_sample_and_task_index=PASS",
  "five_planned_contrasts=PASS",
  "named_harm_and_human_review_gates=PASS",
  "full_cost_accounting=PASS",
  "provider_component_reconciliation=PASS",
  "uncertainty_required_for_efficiency=PASS",
  "hostile_rejections=PASS",
  "counterbalancing_and_unit_controls=PASS",
  "exact_harm_incidence_bounds=PASS",
  "claim_ceiling=SYNTHETIC_ANALYZER_BRANCH_AND_REJECTION_COVERAGE_ONLY",
].join("\n") + "\n");
