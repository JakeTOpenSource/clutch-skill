#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONDITIONS = [
  "FRONTIER_FULL_CONTEXT",
  "WORKER_FULL_CONTEXT",
  "WORKER_AUTO_CARD",
  "WORKER_APPROVED_CARD",
];

const CONTRASTS = {
  capability: ["FRONTIER_FULL_CONTEXT", "WORKER_FULL_CONTEXT"],
  automatic_card_transform: ["WORKER_FULL_CONTEXT", "WORKER_AUTO_CARD"],
  human_approval: ["WORKER_AUTO_CARD", "WORKER_APPROVED_CARD"],
  clutch_vs_full_context_worker: ["WORKER_FULL_CONTEXT", "WORKER_APPROVED_CARD"],
  complete_route: ["FRONTIER_FULL_CONTEXT", "WORKER_APPROVED_CARD"],
};

const EVENT_FIELDS = [
  "context_omissions",
  "scope_violations",
  "unsupported_assertions",
  "unauthorized_clutch_transitions",
];
const PROVIDER_COMPONENTS = ["planning_and_card", "execution", "model_verification", "other"];
const PROVIDER_COMPONENT_FIELDS = [
  "uncached_input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "prompt_bytes",
  "provider_charge_microusd",
];
const RECORDED_TELEMETRY = [
  "uncached_input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "prompt_bytes",
  "provider_charge_microusd",
  "elapsed_milliseconds",
  "human_review_seconds",
];
const DERIVED_TELEMETRY = ["raw_tokens", "human_review_cost_microusd", "total_cost_microusd"];
const ALL_TELEMETRY = [...RECORDED_TELEMETRY, ...DERIVED_TELEMETRY];
const FIXED_ALPHA_PPM = 50000;

function exactKeys(object, expected) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return false;
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function finiteInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function taskIndexDigest(tasks) {
  const index = tasks
    .map(({ task_id, stratum, condition_sequence }) => ({ task_id, stratum, condition_sequence }))
    .sort((left, right) => left.task_id === right.task_id ? 0 : left.task_id < right.task_id ? -1 : 1);
  return digestBytes(Buffer.from(canonicalJson(index), "utf8"));
}

export function preregistrationDigest(preregistrationText) {
  return digestBytes(Buffer.from(preregistrationText, "utf8"));
}

function validateDigest(value, label) {
  assert.match(value, /^sha256:[a-f0-9]{64}$/, `${label} must be a SHA-256 digest`);
}

function validatePreregistration(preregistration) {
  assert.ok(exactKeys(preregistration, [
    "schema_version", "study_id", "status", "run_authorized", "frozen", "owner_approval",
    "research_question", "independent_unit", "conditions", "required_strata", "fixed_controls",
    "frozen_artifacts", "analysis_config", "quality_gates", "cost_accounting",
    "secondary_endpoints", "decision_rule", "stop_conditions", "claim_ceiling",
  ]), "Invalid preregistration fields");
  assert.equal(preregistration.schema_version, "clutch-preregistration.v2");
  assert.ok(nonemptyString(preregistration.study_id), "Preregistration study_id is required");
  assert.equal(preregistration.status, "FROZEN_OWNER_APPROVED", "Preregistration is not owner-approved");
  assert.equal(preregistration.run_authorized, true, "Preregistration does not authorize a run");
  assert.equal(preregistration.frozen, true, "Preregistration is not frozen");
  assert.deepEqual(preregistration.conditions, CONDITIONS, "Preregistered conditions changed");
  assert.equal(preregistration.independent_unit, "TASK");
  assert.ok(nonemptyString(preregistration.research_question));
  assert.ok(Array.isArray(preregistration.required_strata) && preregistration.required_strata.length > 0);
  assert.equal(new Set(preregistration.required_strata).size, preregistration.required_strata.length);

  assert.ok(exactKeys(preregistration.owner_approval, ["status", "approval_digest", "approved_at_utc"]));
  assert.equal(preregistration.owner_approval.status, "APPROVED");
  validateDigest(preregistration.owner_approval.approval_digest, "owner_approval.approval_digest");
  assert.ok(Number.isFinite(Date.parse(preregistration.owner_approval.approved_at_utc)), "Invalid approval time");

  assert.ok(exactKeys(preregistration.fixed_controls, [
    "one_worker_attempt", "automatic_retry", "same_initial_workspace_by_task",
    "same_tools_and_permissions_by_task", "same_hidden_checks_by_task", "condition_order",
    "blinded_scoring_where_possible", "seeds_are_not_independent_tasks",
    "clutch_control_roles", "worker_clutch_control", "verifier_clutch_control",
    "human_approval_before_worker_assignment",
  ]));
  assert.equal(preregistration.fixed_controls.one_worker_attempt, true);
  assert.equal(preregistration.fixed_controls.automatic_retry, false);
  assert.equal(preregistration.fixed_controls.same_initial_workspace_by_task, true);
  assert.equal(preregistration.fixed_controls.same_tools_and_permissions_by_task, true);
  assert.equal(preregistration.fixed_controls.same_hidden_checks_by_task, true);
  assert.ok(
    ["RANDOMIZED", "COUNTERBALANCED"].includes(preregistration.fixed_controls.condition_order),
    "Frozen condition order must be RANDOMIZED or COUNTERBALANCED",
  );
  assert.equal(
    preregistration.fixed_controls.blinded_scoring_where_possible,
    true,
    "Frozen study must retain blinded scoring where possible",
  );
  assert.equal(
    preregistration.fixed_controls.seeds_are_not_independent_tasks,
    true,
    "Repeated seeds cannot be treated as independent tasks",
  );
  assert.deepEqual(preregistration.fixed_controls.clutch_control_roles, [
    "ROLE_MODEL_ADVISOR",
    "TRUSTED_ORCHESTRATOR",
    "HUMAN_OWNER",
  ]);
  assert.equal(preregistration.fixed_controls.worker_clutch_control, false);
  assert.equal(preregistration.fixed_controls.verifier_clutch_control, false);
  assert.equal(preregistration.fixed_controls.human_approval_before_worker_assignment, true);

  assert.ok(exactKeys(preregistration.frozen_artifacts, [
    "task_population_manifest_digest", "task_index_digest", "model_and_decoding_manifest_digest",
    "tool_and_permission_manifest_digest", "hidden_checks_manifest_digest",
  ]));
  for (const [field, value] of Object.entries(preregistration.frozen_artifacts)) validateDigest(value, `frozen_artifacts.${field}`);

  const config = preregistration.analysis_config;
  assert.ok(exactKeys(config, [
    "bootstrap_iterations", "bootstrap_seed", "quality_one_sided_alpha_ppm",
    "efficiency_two_sided_alpha_ppm", "noninferiority_margin_basis_points",
    "required_total_tasks", "minimum_tasks_per_release_critical_stratum",
    "power_analysis_or_simulation_digest", "bootstrap_method", "quality_bound_method",
  ]));
  assert.ok(finiteInteger(config.bootstrap_iterations, 1000) && config.bootstrap_iterations <= 100000);
  assert.ok(finiteInteger(config.bootstrap_seed, 1));
  assert.equal(config.quality_one_sided_alpha_ppm, FIXED_ALPHA_PPM, "Quality alpha must remain 0.05");
  assert.equal(config.efficiency_two_sided_alpha_ppm, FIXED_ALPHA_PPM, "Efficiency alpha must remain 0.05");
  assert.ok(finiteInteger(config.noninferiority_margin_basis_points) && config.noninferiority_margin_basis_points <= 10000);
  assert.ok(finiteInteger(config.required_total_tasks, 2), "At least two independent tasks are required");
  assert.ok(finiteInteger(config.minimum_tasks_per_release_critical_stratum, 1));
  validateDigest(config.power_analysis_or_simulation_digest, "analysis_config.power_analysis_or_simulation_digest");
  assert.equal(config.bootstrap_method, "TASK_STRATIFIED_PERCENTILE_REFERENCE");
  assert.equal(config.quality_bound_method, "TASK_STRATIFIED_PERCENTILE_BOOTSTRAP_REFERENCE");

  const quality = preregistration.quality_gates;
  assert.ok(exactKeys(quality, [
    "critical_harm_definitions", "maximum_approved_card_events", "human_review",
  ]));
  assert.ok(Array.isArray(quality.critical_harm_definitions) && quality.critical_harm_definitions.length > 0);
  const harmIds = new Set();
  for (const harm of quality.critical_harm_definitions) {
    assert.ok(exactKeys(harm, ["harm_id", "description", "maximum_approved_card_events"]));
    assert.ok(nonemptyString(harm.harm_id) && !harmIds.has(harm.harm_id));
    assert.ok(nonemptyString(harm.description));
    assert.ok(finiteInteger(harm.maximum_approved_card_events));
    harmIds.add(harm.harm_id);
  }
  assert.ok(exactKeys(quality.maximum_approved_card_events, EVENT_FIELDS));
  for (const field of EVENT_FIELDS) assert.ok(finiteInteger(quality.maximum_approved_card_events[field]));
  assert.ok(exactKeys(quality.human_review, [
    "minimum_reviewers_per_task", "maximum_false_approval_rate_basis_points",
    "maximum_false_rejection_rate_basis_points", "required_reference_labels", "confidence_scale",
  ]));
  assert.ok(finiteInteger(quality.human_review.minimum_reviewers_per_task, 1));
  assert.ok(finiteInteger(quality.human_review.maximum_false_approval_rate_basis_points)
    && quality.human_review.maximum_false_approval_rate_basis_points <= 10000);
  assert.ok(finiteInteger(quality.human_review.maximum_false_rejection_rate_basis_points)
    && quality.human_review.maximum_false_rejection_rate_basis_points <= 10000);
  assert.deepEqual(quality.human_review.required_reference_labels, ["APPROVE", "REJECT"]);
  assert.equal(quality.human_review.confidence_scale, "0_TO_10000_BASIS_POINTS");

  assert.ok(exactKeys(preregistration.cost_accounting, [
    "human_review_cost_microusd_per_second", "provider_charge_basis",
    "price_source_and_retrieval_time", "require_provider_charge", "total_cost_definition",
  ]));
  assert.ok(finiteInteger(preregistration.cost_accounting.human_review_cost_microusd_per_second));
  assert.equal(preregistration.cost_accounting.provider_charge_basis, "RECORDED_OR_FROZEN_PRICE_SHEET");
  assert.ok(nonemptyString(preregistration.cost_accounting.price_source_and_retrieval_time));
  assert.equal(preregistration.cost_accounting.require_provider_charge, true);
  assert.equal(
    preregistration.cost_accounting.total_cost_definition,
    "provider_charge_microusd + human_review_seconds * human_review_cost_microusd_per_second",
  );
  assert.ok(Array.isArray(preregistration.secondary_endpoints));
  assert.ok(Array.isArray(preregistration.decision_rule));
  assert.ok(Array.isArray(preregistration.stop_conditions));
  assert.ok(nonemptyString(preregistration.claim_ceiling));
  return harmIds;
}

function validateResults(input, preregistration, harmIds) {
  assert.ok(exactKeys(input, [
    "schema_version", "study_id", "preregistration_digest", "frozen_artifacts", "tasks", "reviews",
  ]), "Invalid study result fields");
  assert.equal(input.schema_version, "clutch-study-results.v2");
  assert.equal(input.study_id, preregistration.study_id, "Study ID does not match preregistration");
  validateDigest(input.preregistration_digest, "preregistration_digest");
  assert.deepEqual(input.frozen_artifacts, preregistration.frozen_artifacts, "Frozen artifact digests changed");
  assert.ok(Array.isArray(input.tasks));
  assert.equal(
    input.tasks.length,
    preregistration.analysis_config.required_total_tasks,
    "Task count does not match the preregistered sample size",
  );

  const taskIds = new Set();
  for (const task of input.tasks) {
    assert.ok(exactKeys(task, ["task_id", "stratum", "condition_sequence", "conditions"]), "Invalid task fields");
    assert.ok(nonemptyString(task.task_id) && !taskIds.has(task.task_id), "Task IDs must be unique and non-empty");
    taskIds.add(task.task_id);
    assert.ok(preregistration.required_strata.includes(task.stratum), `${task.task_id}: unregistered stratum`);
    assert.ok(Array.isArray(task.condition_sequence), `${task.task_id}: condition sequence must be an array`);
    assert.deepEqual(
      [...task.condition_sequence].sort(),
      [...CONDITIONS].sort(),
      `${task.task_id}: condition sequence must contain every condition exactly once`,
    );
    assert.deepEqual(Object.keys(task.conditions).sort(), [...CONDITIONS].sort());
    for (const condition of CONDITIONS) {
      const result = task.conditions[condition];
      assert.ok(exactKeys(result, [
        "success", "critical_harms", "provider_components", ...EVENT_FIELDS, ...RECORDED_TELEMETRY,
      ]), `${task.task_id}/${condition}: invalid condition fields`);
      assert.equal(typeof result.success, "boolean");
      assert.deepEqual(Object.keys(result.critical_harms).sort(), [...harmIds].sort(), `${task.task_id}/${condition}: critical harms changed`);
      for (const count of Object.values(result.critical_harms)) assert.ok(finiteInteger(count));
      for (const field of [...EVENT_FIELDS, ...RECORDED_TELEMETRY]) {
        assert.ok(finiteInteger(result[field]), `${task.task_id}/${condition}: invalid or missing ${field}`);
      }
      assert.deepEqual(
        Object.keys(result.provider_components).sort(),
        [...PROVIDER_COMPONENTS].sort(),
        `${task.task_id}/${condition}: provider components changed`,
      );
      for (const component of PROVIDER_COMPONENTS) {
        assert.ok(
          exactKeys(result.provider_components[component], PROVIDER_COMPONENT_FIELDS),
          `${task.task_id}/${condition}/${component}: invalid provider component fields`,
        );
        for (const field of PROVIDER_COMPONENT_FIELDS) {
          assert.ok(
            finiteInteger(result.provider_components[component][field]),
            `${task.task_id}/${condition}/${component}: invalid ${field}`,
          );
        }
      }
      for (const field of PROVIDER_COMPONENT_FIELDS) {
        const componentTotal = PROVIDER_COMPONENTS.reduce(
          (total, component) => total + result.provider_components[component][field],
          0,
        );
        assert.equal(
          result[field],
          componentTotal,
          `${task.task_id}/${condition}: ${field} does not reconcile with provider components`,
        );
      }
      if (condition !== "WORKER_APPROVED_CARD") {
        assert.equal(result.human_review_seconds, 0, `${task.task_id}/${condition}: human review belongs only to the approved-card arm`);
      }
    }
  }
  assert.equal(taskIndexDigest(input.tasks), preregistration.frozen_artifacts.task_index_digest, "Task index does not match the frozen preregistration");
  for (const stratum of preregistration.required_strata) {
    const count = input.tasks.filter((task) => task.stratum === stratum).length;
    assert.ok(
      count >= preregistration.analysis_config.minimum_tasks_per_release_critical_stratum,
      `Undersized release-critical stratum ${stratum}`,
    );
  }
  if (preregistration.fixed_controls.condition_order === "COUNTERBALANCED") {
    for (const stratum of preregistration.required_strata) {
      const tasks = input.tasks.filter((task) => task.stratum === stratum);
      for (let position = 0; position < CONDITIONS.length; position += 1) {
        const counts = CONDITIONS.map((condition) =>
          tasks.filter((task) => task.condition_sequence[position] === condition).length,
        );
        assert.ok(
          Math.max(...counts) - Math.min(...counts) <= 1,
          `Condition order is not counterbalanced in ${stratum} at position ${position}`,
        );
      }
    }
  }

  assert.ok(Array.isArray(input.reviews));
  const reviewKeys = new Set();
  const referenceLabels = new Set();
  for (const review of input.reviews) {
    assert.ok(exactKeys(review, [
      "task_id", "reviewer_id", "decision", "reference_decision", "confidence_basis_points", "review_seconds",
    ]), "Invalid review fields");
    assert.ok(taskIds.has(review.task_id), `Review cites unknown task ${review.task_id}`);
    assert.ok(nonemptyString(review.reviewer_id));
    const reviewKey = `${review.task_id}\u0000${review.reviewer_id}`;
    assert.ok(!reviewKeys.has(reviewKey), "Duplicate reviewer/task record");
    reviewKeys.add(reviewKey);
    assert.ok(["APPROVE", "REJECT"].includes(review.decision));
    assert.ok(["APPROVE", "REJECT"].includes(review.reference_decision));
    referenceLabels.add(review.reference_decision);
    assert.ok(finiteInteger(review.confidence_basis_points) && review.confidence_basis_points <= 10000);
    assert.ok(finiteInteger(review.review_seconds));
  }
  for (const label of preregistration.quality_gates.human_review.required_reference_labels) {
    assert.ok(referenceLabels.has(label), `Missing required human-review reference label ${label}`);
  }
  for (const task of input.tasks) {
    const records = input.reviews.filter((review) => review.task_id === task.task_id);
    assert.ok(
      records.length >= preregistration.quality_gates.human_review.minimum_reviewers_per_task,
      `${task.task_id}: too few reviewers`,
    );
    const reviewSeconds = records.reduce((total, record) => total + record.review_seconds, 0);
    assert.equal(
      task.conditions.WORKER_APPROVED_CARD.human_review_seconds,
      reviewSeconds,
      `${task.task_id}: review time does not reconcile`,
    );
  }
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function labeledSeed(seed, label) {
  const suffix = Number.parseInt(createHash("sha256").update(label).digest("hex").slice(0, 8), 16);
  return (seed ^ suffix) >>> 0;
}

function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stratifiedSamples(tasks, iterations, seed, metric) {
  const strata = new Map();
  for (const task of tasks) {
    if (!strata.has(task.stratum)) strata.set(task.stratum, []);
    strata.get(task.stratum).push(task);
  }
  const random = mulberry32(seed);
  const values = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    let count = 0;
    for (const group of strata.values()) {
      for (let draw = 0; draw < group.length; draw += 1) {
        const selected = group[Math.floor(random() * group.length)];
        total += metric(selected);
        count += 1;
      }
    }
    values.push(total / count);
  }
  return values.sort((left, right) => left - right);
}

function mean(tasks, metric) {
  return tasks.reduce((total, task) => total + metric(task), 0) / tasks.length;
}

function metricValue(task, condition, field, humanRate) {
  const result = task.conditions[condition];
  if (field === "raw_tokens") return result.uncached_input_tokens + result.cached_input_tokens + result.output_tokens;
  if (field === "human_review_cost_microusd") return result.human_review_seconds * humanRate;
  if (field === "total_cost_microusd") {
    return result.provider_charge_microusd + result.human_review_seconds * humanRate;
  }
  return result[field];
}

function interval(tasks, iterations, seed, metric, lowerProbability, upperProbability) {
  const samples = stratifiedSamples(tasks, iterations, seed, metric);
  return [quantile(samples, lowerProbability), quantile(samples, upperProbability)];
}

function eventTotals(tasks, condition, harmIds) {
  const criticalHarms = Object.fromEntries([...harmIds].map((harmId) => [harmId, 0]));
  const events = Object.fromEntries(EVENT_FIELDS.map((field) => [field, 0]));
  for (const task of tasks) {
    const result = task.conditions[condition];
    for (const harmId of harmIds) criticalHarms[harmId] += result.critical_harms[harmId];
    for (const field of EVENT_FIELDS) events[field] += result[field];
  }
  return { critical_harms: criticalHarms, ...events };
}

function providerComponentTotals(tasks, condition) {
  return Object.fromEntries(PROVIDER_COMPONENTS.map((component) => [
    component,
    Object.fromEntries(PROVIDER_COMPONENT_FIELDS.map((field) => [
      field,
      tasks.reduce(
        (total, task) => total + task.conditions[condition].provider_components[component][field],
        0,
      ),
    ])),
  ]));
}

function makeContrast(name, tasks, preregistration, harmIds) {
  const [reference, candidate] = CONTRASTS[name];
  const config = preregistration.analysis_config;
  const humanRate = preregistration.cost_accounting.human_review_cost_microusd_per_second;
  const alpha = config.efficiency_two_sided_alpha_ppm / 1_000_000;
  const successMetric = (task) => Number(task.conditions[candidate].success) - Number(task.conditions[reference].success);
  const telemetry = {};
  for (const field of ALL_TELEMETRY) {
    const metric = (task) => metricValue(task, candidate, field, humanRate) - metricValue(task, reference, field, humanRate);
    telemetry[field] = {
      paired_mean_delta: mean(tasks, metric),
      interval_95: interval(
        tasks,
        config.bootstrap_iterations,
        labeledSeed(config.bootstrap_seed, `${name}:${field}`),
        metric,
        alpha / 2,
        1 - alpha / 2,
      ),
    };
  }
  return {
    reference,
    candidate,
    paired_success_difference: mean(tasks, successMetric),
    success_interval_95: interval(
      tasks,
      config.bootstrap_iterations,
      labeledSeed(config.bootstrap_seed, `${name}:success`),
      successMetric,
      alpha / 2,
      1 - alpha / 2,
    ),
    reference_events: eventTotals(tasks, reference, harmIds),
    candidate_events: eventTotals(tasks, candidate, harmIds),
    telemetry,
  };
}

function reviewerAnalysis(reviews) {
  const falseApprovals = reviews.filter((review) => review.decision === "APPROVE" && review.reference_decision === "REJECT").length;
  const approvalNegatives = reviews.filter((review) => review.reference_decision === "REJECT").length;
  const falseRejections = reviews.filter((review) => review.decision === "REJECT" && review.reference_decision === "APPROVE").length;
  const approvalPositives = reviews.filter((review) => review.reference_decision === "APPROVE").length;
  let pairCount = 0;
  let pairAgreement = 0;
  const byTask = new Map();
  for (const review of reviews) {
    if (!byTask.has(review.task_id)) byTask.set(review.task_id, []);
    byTask.get(review.task_id).push(review);
  }
  for (const records of byTask.values()) {
    for (let left = 0; left < records.length; left += 1) {
      for (let right = left + 1; right < records.length; right += 1) {
        pairCount += 1;
        if (records[left].decision === records[right].decision) pairAgreement += 1;
      }
    }
  }
  const brierScore = reviews.reduce((total, review) => {
    const confidence = review.confidence_basis_points / 10000;
    const correct = Number(review.decision === review.reference_decision);
    return total + (confidence - correct) ** 2;
  }, 0) / reviews.length;
  const perReviewer = {};
  for (const reviewerId of [...new Set(reviews.map((review) => review.reviewer_id))].sort()) {
    const records = reviews.filter((review) => review.reviewer_id === reviewerId);
    perReviewer[reviewerId] = {
      decisions: records.length,
      false_approvals: records.filter((review) => review.decision === "APPROVE" && review.reference_decision === "REJECT").length,
      false_rejections: records.filter((review) => review.decision === "REJECT" && review.reference_decision === "APPROVE").length,
      mean_confidence_basis_points: records.reduce((total, review) => total + review.confidence_basis_points, 0) / records.length,
      total_review_seconds: records.reduce((total, review) => total + review.review_seconds, 0),
    };
  }
  return {
    review_records: reviews.length,
    false_approvals: falseApprovals,
    false_approval_denominator: approvalNegatives,
    false_approval_rate_basis_points: falseApprovals / approvalNegatives * 10000,
    false_rejections: falseRejections,
    false_rejection_denominator: approvalPositives,
    false_rejection_rate_basis_points: falseRejections / approvalPositives * 10000,
    pairwise_agreement_basis_points: pairCount > 0 ? pairAgreement / pairCount * 10000 : null,
    confidence_brier_score: brierScore,
    per_reviewer: perReviewer,
  };
}

function logAddExp(left, right) {
  if (left === -Infinity) return right;
  if (right === -Infinity) return left;
  const high = Math.max(left, right);
  return high + Math.log(Math.exp(left - high) + Math.exp(right - high));
}

function binomialCdf(observed, trials, probability) {
  if (probability <= 0) return 1;
  if (probability >= 1) return observed >= trials ? 1 : 0;
  let logTerm = trials * Math.log1p(-probability);
  let logSum = logTerm;
  for (let count = 1; count <= observed; count += 1) {
    logTerm += Math.log(trials - count + 1)
      - Math.log(count)
      + Math.log(probability)
      - Math.log1p(-probability);
    logSum = logAddExp(logSum, logTerm);
  }
  return Math.exp(logSum);
}

function exactOneSidedBinomialUpper(observed, trials, alpha) {
  assert.ok(finiteInteger(observed) && finiteInteger(trials, 1) && observed <= trials);
  if (observed === trials) return 1;
  if (observed === 0) return 1 - alpha ** (1 / trials);
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (binomialCdf(observed, trials, midpoint) > alpha) low = midpoint;
    else high = midpoint;
  }
  return high;
}

function taskIncidence(tasks, predicate, alpha) {
  const numerator = tasks.filter(predicate).length;
  return {
    numerator,
    denominator: tasks.length,
    one_sided_confidence_level: 1 - alpha,
    exact_clopper_pearson_upper_bound: exactOneSidedBinomialUpper(numerator, tasks.length, alpha),
  };
}

function approvedCardGateForTasks(tasks, preregistration, harmIds, label, referenceCondition) {
  const config = preregistration.analysis_config;
  const margin = config.noninferiority_margin_basis_points / 10000;
  const alpha = config.quality_one_sided_alpha_ppm / 1_000_000;
  const qualityMetric = (task) => Number(task.conditions.WORKER_APPROVED_CARD.success)
    - Number(task.conditions[referenceCondition].success);
  const samples = stratifiedSamples(
    tasks,
    config.bootstrap_iterations,
    labeledSeed(config.bootstrap_seed, `quality:${referenceCondition}:${label}`),
    qualityMetric,
  );
  const lower = quantile(samples, alpha);
  const totals = eventTotals(tasks, "WORKER_APPROVED_CARD", harmIds);
  const harmChecks = {};
  let eventsPass = true;
  for (const definition of preregistration.quality_gates.critical_harm_definitions) {
    const observed = totals.critical_harms[definition.harm_id];
    const pass = observed <= definition.maximum_approved_card_events;
    harmChecks[definition.harm_id] = {
      observed_events: observed,
      maximum_events: definition.maximum_approved_card_events,
      task_incidence: taskIncidence(
        tasks,
        (task) => task.conditions.WORKER_APPROVED_CARD.critical_harms[definition.harm_id] > 0,
        alpha,
      ),
      pass,
    };
    if (!pass) eventsPass = false;
  }
  const eventChecks = {};
  for (const field of EVENT_FIELDS) {
    const observed = totals[field];
    const maximum = preregistration.quality_gates.maximum_approved_card_events[field];
    const pass = observed <= maximum;
    eventChecks[field] = {
      observed_events: observed,
      maximum_events: maximum,
      task_incidence: taskIncidence(
        tasks,
        (task) => task.conditions.WORKER_APPROVED_CARD[field] > 0,
        alpha,
      ),
      pass,
    };
    if (!pass) eventsPass = false;
  }
  return {
    reference_condition: referenceCondition,
    tasks: tasks.length,
    paired_success_difference: mean(tasks, qualityMetric),
    one_sided_lower_bound: lower,
    noninferiority_margin: margin,
    noninferiority_pass: lower >= -margin,
    critical_harms: harmChecks,
    other_events: eventChecks,
    event_thresholds_pass: eventsPass,
    pass: lower >= -margin && eventsPass,
  };
}

function qualityReferenceReport(input, preregistration, harmIds, referenceCondition) {
  const overall = approvedCardGateForTasks(
    input.tasks,
    preregistration,
    harmIds,
    "overall",
    referenceCondition,
  );
  const strata = {};
  let strataPass = true;
  for (const stratum of preregistration.required_strata) {
    strata[stratum] = approvedCardGateForTasks(
      input.tasks.filter((task) => task.stratum === stratum),
      preregistration,
      harmIds,
      stratum,
      referenceCondition,
    );
    if (!strata[stratum].pass) strataPass = false;
  }
  return {
    overall,
    strata,
    pass: overall.pass && strataPass,
  };
}

function efficiencyVerdicts(contrast, qualityPass) {
  const routeCost = contrast.telemetry.total_cost_microusd;
  const routeTokens = contrast.telemetry.raw_tokens;
  let totalCostVerdict = "NOT_AUTHORIZED_QUALITY_GATE";
  let rawTokenVerdict = "NOT_AUTHORIZED_QUALITY_GATE";
  if (qualityPass) {
    totalCostVerdict = routeCost.interval_95[1] < 0
      ? "CANDIDATE_LOWER_TOTAL_COST_WITH_95_PERCENT_INTERVAL_ON_TESTED_TASKS"
      : routeCost.paired_mean_delta < 0
        ? "TOTAL_COST_REDUCTION_UNRESOLVED_ON_TESTED_TASKS"
        : "NO_TOTAL_COST_REDUCTION_ON_TESTED_TASKS";
    rawTokenVerdict = routeTokens.interval_95[1] < 0
      ? "CANDIDATE_USED_FEWER_RAW_TOKENS_WITH_95_PERCENT_INTERVAL_ON_TESTED_TASKS"
      : routeTokens.paired_mean_delta < 0
        ? "RAW_TOKEN_REDUCTION_UNRESOLVED_ON_TESTED_TASKS"
        : "NO_RAW_TOKEN_REDUCTION_ON_TESTED_TASKS";
  }
  return {
    reference: contrast.reference,
    candidate: contrast.candidate,
    total_cost_verdict: totalCostVerdict,
    raw_token_verdict: rawTokenVerdict,
  };
}

export function analyzeStudy(preregistrationText, input) {
  assert.equal(typeof preregistrationText, "string", "Preregistration bytes are required");
  const preregistration = JSON.parse(preregistrationText);
  const harmIds = validatePreregistration(preregistration);
  assert.equal(
    input.preregistration_digest,
    preregistrationDigest(preregistrationText),
    "Result does not bind the exact preregistration bytes",
  );
  validateResults(input, preregistration, harmIds);

  const frontierReference = qualityReferenceReport(
    input,
    preregistration,
    harmIds,
    "FRONTIER_FULL_CONTEXT",
  );
  const fullContextWorkerReference = qualityReferenceReport(
    input,
    preregistration,
    harmIds,
    "WORKER_FULL_CONTEXT",
  );

  const humanReview = reviewerAnalysis(input.reviews);
  const humanGate = {
    false_approval_pass: humanReview.false_approval_rate_basis_points
      <= preregistration.quality_gates.human_review.maximum_false_approval_rate_basis_points,
    false_rejection_pass: humanReview.false_rejection_rate_basis_points
      <= preregistration.quality_gates.human_review.maximum_false_rejection_rate_basis_points,
  };
  humanGate.pass = humanGate.false_approval_pass && humanGate.false_rejection_pass;
  const qualityPass = frontierReference.pass && fullContextWorkerReference.pass && humanGate.pass;

  const contrasts = {};
  for (const name of Object.keys(CONTRASTS)) {
    contrasts[name] = makeContrast(name, input.tasks, preregistration, harmIds);
  }

  return {
    schema_version: "clutch-study-analysis.v2",
    study_id: input.study_id,
    preregistration_digest: input.preregistration_digest,
    tasks: input.tasks.length,
    condition_summaries: Object.fromEntries(CONDITIONS.map((condition) => [condition, {
      successes: input.tasks.filter((task) => task.conditions[condition].success).length,
      tasks: input.tasks.length,
      events: eventTotals(input.tasks, condition, harmIds),
      provider_components: providerComponentTotals(input.tasks, condition),
    }])),
    contrasts,
    quality: {
      frontier_reference: frontierReference,
      full_context_worker_reference: fullContextWorkerReference,
      human_review: { ...humanReview, gate: humanGate },
      pass: qualityPass,
    },
    efficiency: {
      comparison_authorized: qualityPass,
      comparisons: {
        clutch_vs_full_context_worker: efficiencyVerdicts(
          contrasts.clutch_vs_full_context_worker,
          qualityPass,
        ),
        complete_route: efficiencyVerdicts(contrasts.complete_route, qualityPass),
      },
      uncertainty_rule: "UPPER_ENDPOINT_OF_PREREGISTERED_95_PERCENT_INTERVAL_MUST_BE_BELOW_ZERO",
    },
    claim_ceiling: "REFERENCE_ANALYSIS_OF_HASH_BOUND_CALLER_SUPPLIED_RESULTS_ONLY_NO_AUTHENTICATION_OR_CAUSAL_CERTIFICATION",
  };
}

function main() {
  const preregistrationMarker = process.argv.indexOf("--preregistration");
  const inputMarker = process.argv.indexOf("--input");
  assert.ok(
    preregistrationMarker >= 0 && process.argv[preregistrationMarker + 1]
      && inputMarker >= 0 && process.argv[inputMarker + 1],
    "Usage: analyze-study.mjs --preregistration <frozen.json> --input <results.json>",
  );
  const preregistrationText = readFileSync(process.argv[preregistrationMarker + 1], "utf8");
  const input = JSON.parse(readFileSync(process.argv[inputMarker + 1], "utf8"));
  process.stdout.write(`${JSON.stringify(analyzeStudy(preregistrationText, input), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
