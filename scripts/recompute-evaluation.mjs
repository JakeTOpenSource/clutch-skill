#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TRAJECTORIES = Object.freeze(["STABLE_TERRA", "TERRA_TO_LUNA"]);
const CARRIAGES = Object.freeze(["FULL_HISTORY", "APPROVED_CARD"]);
const PHASES = Object.freeze(["P1", "P2", "P3", "P4", "P5"]);

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

function mean(values) {
  assert.ok(values.length > 0, "MEAN_REQUIRES_VALUES");
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function routeKey(taskId, trajectory, carriage) {
  return `${taskId}:${trajectory}:${carriage}`;
}

function validateInputs(outcomes, preregistration) {
  assert.equal(outcomes.schema_version, "clutch-v2-public-outcome-table.v1");
  assert.equal(preregistration.schema_version, "clutch-v2-public-preregistration.v1");
  assert.equal(outcomes.study_id, preregistration.study_id);
  assert.equal(preregistration.status, "PUBLIC_EXTRACT_BOUND_TO_FROZEN_OWNER_APPROVED_PACKET");
  assert.deepEqual(preregistration.design.phases, PHASES);
  assert.deepEqual(preregistration.design.trajectories, TRAJECTORIES);
  assert.deepEqual(preregistration.design.carriages, CARRIAGES);
  assert.equal(outcomes.route_records.length, preregistration.population.task_count * TRAJECTORIES.length * CARRIAGES.length);

  const keys = new Set();
  const taskStrata = new Map();
  for (const row of outcomes.route_records) {
    assert.ok(typeof row.task_id === "string" && row.task_id.length > 0);
    assert.ok(preregistration.population.strata.includes(row.stratum));
    assert.ok(TRAJECTORIES.includes(row.trajectory));
    assert.ok(CARRIAGES.includes(row.carriage));
    const key = routeKey(row.task_id, row.trajectory, row.carriage);
    assert.ok(!keys.has(key), `DUPLICATE_ROUTE:${key}`);
    keys.add(key);
    if (taskStrata.has(row.task_id)) assert.equal(taskStrata.get(row.task_id), row.stratum);
    else taskStrata.set(row.task_id, row.stratum);
    assert.equal(row.phase_quality.length, PHASES.length);
    for (const value of row.phase_quality) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    assert.equal(typeof row.final_complete, "boolean");
    for (const field of ["collapse_count", "boundary_violation_count", "worker_input_tokens", "worker_charge_nanousd", "advisor_allocated_input_tokens", "advisor_allocated_charge_nanousd", "route_input_tokens", "route_charge_nanousd"]) {
      assert.ok(Number.isFinite(row[field]) && row[field] >= 0, `INVALID_NUMBER:${key}:${field}`);
    }
    assert.equal(row.route_input_tokens, row.worker_input_tokens + row.advisor_allocated_input_tokens);
    assert.equal(row.route_charge_nanousd, row.worker_charge_nanousd + row.advisor_allocated_charge_nanousd);
    if (row.carriage === "FULL_HISTORY") {
      assert.equal(row.advisor_allocated_input_tokens, 0);
      assert.equal(row.advisor_allocated_charge_nanousd, 0);
    }
  }

  assert.equal(taskStrata.size, preregistration.population.task_count);
  for (const stratum of preregistration.population.strata) {
    assert.equal([...taskStrata.values()].filter((value) => value === stratum).length, preregistration.population.variants_per_stratum);
  }
  for (const taskId of taskStrata.keys()) for (const trajectory of TRAJECTORIES) for (const carriage of CARRIAGES) {
    assert.ok(keys.has(routeKey(taskId, trajectory, carriage)), `MISSING_ROUTE:${taskId}:${trajectory}:${carriage}`);
  }
  return [...taskStrata.keys()];
}

function summarize(records, trajectory, carriage) {
  const rows = records.filter((row) => row.trajectory === trajectory && row.carriage === carriage);
  return {
    tasks: rows.length,
    mean_post_switch_quality: mean(rows.map((row) => mean(row.phase_quality.slice(2)))),
    mean_final_quality: mean(rows.map((row) => row.phase_quality.at(-1))),
    complete_final_tasks: rows.filter((row) => row.final_complete).length,
    collapse_count: sum(rows.map((row) => row.collapse_count)),
    boundary_violation_count: sum(rows.map((row) => row.boundary_violation_count)),
    route_input_tokens: sum(rows.map((row) => row.route_input_tokens)),
    route_charge_nanousd: sum(rows.map((row) => row.route_charge_nanousd)),
  };
}

function buildContrasts(records, taskIds) {
  const index = new Map(records.map((row) => [routeKey(row.task_id, row.trajectory, row.carriage), row]));
  return taskIds.map((taskId) => {
    const stableHistory = index.get(routeKey(taskId, "STABLE_TERRA", "FULL_HISTORY"));
    const stableCard = index.get(routeKey(taskId, "STABLE_TERRA", "APPROVED_CARD"));
    const switchHistory = index.get(routeKey(taskId, "TERRA_TO_LUNA", "FULL_HISTORY"));
    const switchCard = index.get(routeKey(taskId, "TERRA_TO_LUNA", "APPROVED_CARD"));
    const post = (row) => mean(row.phase_quality.slice(2));
    const row = {
      task_id: taskId,
      stratum: stableHistory.stratum,
      stable_post_switch_quality_delta: post(stableCard) - post(stableHistory),
      switch_post_switch_quality_delta: post(switchCard) - post(switchHistory),
      stable_cost_delta_nanousd: stableCard.route_charge_nanousd - stableHistory.route_charge_nanousd,
      switch_cost_delta_nanousd: switchCard.route_charge_nanousd - switchHistory.route_charge_nanousd,
      card_protection: (post(stableHistory) - post(switchHistory)) - (post(stableCard) - post(switchCard)),
    };
    for (let index = 2; index < PHASES.length; index += 1) {
      row[`stable_${PHASES[index]}_quality_delta`] = stableCard.phase_quality[index] - stableHistory.phase_quality[index];
      row[`switch_${PHASES[index]}_quality_delta`] = switchCard.phase_quality[index] - switchHistory.phase_quality[index];
    }
    return row;
  });
}

function bootstrap(contrasts, preregistration) {
  const groups = new Map();
  for (const row of contrasts) {
    if (!groups.has(row.stratum)) groups.set(row.stratum, []);
    groups.get(row.stratum).push(row);
  }
  const metrics = [
    "stable_post_switch_quality_delta",
    "switch_post_switch_quality_delta",
    "stable_cost_delta_nanousd",
    "switch_cost_delta_nanousd",
    "card_protection",
    ...PHASES.slice(2).flatMap((phase) => [`stable_${phase}_quality_delta`, `switch_${phase}_quality_delta`]),
  ];
  const samples = Object.fromEntries(metrics.map((metric) => [metric, []]));
  const random = mulberry32(preregistration.analysis.bootstrap_seed);
  for (let iteration = 0; iteration < preregistration.analysis.bootstrap_iterations; iteration += 1) {
    const selected = [];
    for (const group of groups.values()) {
      for (let draw = 0; draw < group.length; draw += 1) selected.push(group[Math.floor(random() * group.length)]);
    }
    for (const metric of metrics) samples[metric].push(mean(selected.map((row) => row[metric])));
  }
  return samples;
}

export function recomputePublicEvaluation(outcomes, preregistration) {
  const taskIds = validateInputs(outcomes, preregistration);
  const records = outcomes.route_records;
  const contrasts = buildContrasts(records, taskIds);
  const samples = bootstrap(contrasts, preregistration);
  const summaries = Object.fromEntries(TRAJECTORIES.map((trajectory) => [trajectory, Object.fromEntries(CARRIAGES.map((carriage) => [carriage, summarize(records, trajectory, carriage)]))]));
  const quality = {};
  const cost = {};
  const input = {};
  const critical = {};
  for (const [trajectory, prefix] of [["STABLE_TERRA", "stable"], ["TERRA_TO_LUNA", "switch"]]) {
    const postMetric = `${prefix}_post_switch_quality_delta`;
    const byPhase = {};
    for (const phase of PHASES.slice(2)) {
      const metric = `${prefix}_${phase}_quality_delta`;
      const lower = quantile(samples[metric], preregistration.analysis.quality_lower_quantile);
      byPhase[phase] = {
        point_delta: mean(contrasts.map((row) => row[metric])),
        one_sided_95_lower: lower,
        margin: -preregistration.analysis.quality_noninferiority_margin,
        pass: lower >= -preregistration.analysis.quality_noninferiority_margin,
      };
    }
    const qualityLower = quantile(samples[postMetric], preregistration.analysis.quality_lower_quantile);
    quality[trajectory] = {
      post_switch_point_delta: mean(contrasts.map((row) => row[postMetric])),
      post_switch_one_sided_95_lower: qualityLower,
      margin: -preregistration.analysis.quality_noninferiority_margin,
      by_phase: byPhase,
      pass: qualityLower >= -preregistration.analysis.quality_noninferiority_margin && Object.values(byPhase).every((phase) => phase.pass),
    };
    const costMetric = `${prefix}_cost_delta_nanousd`;
    const costInterval = preregistration.analysis.cost_interval_quantiles.map((probability) => quantile(samples[costMetric], probability));
    cost[trajectory] = {
      paired_mean_delta_nanousd: mean(contrasts.map((row) => row[costMetric])),
      interval_95_nanousd: costInterval,
      pass: costInterval[1] < 0,
    };
    const historyInput = summaries[trajectory].FULL_HISTORY.route_input_tokens;
    const cardInput = summaries[trajectory].APPROVED_CARD.route_input_tokens;
    const reduction = 1 - cardInput / historyInput;
    input[trajectory] = {
      full_history_tokens: historyInput,
      approved_card_tokens_including_advisor: cardInput,
      reduction_fraction: reduction,
      pass: reduction >= preregistration.analysis.minimum_input_reduction_fraction,
    };
    const history = summaries[trajectory].FULL_HISTORY;
    const card = summaries[trajectory].APPROVED_CARD;
    critical[trajectory] = {
      approved_card_boundary_violations: card.boundary_violation_count,
      full_history_boundary_violations: history.boundary_violation_count,
      approved_card_collapses: card.collapse_count,
      full_history_collapses: history.collapse_count,
      pass: card.boundary_violation_count === 0 && card.collapse_count <= history.collapse_count,
    };
  }
  const protectionPoint = mean(contrasts.map((row) => row.card_protection));
  const protectionLower = quantile(samples.card_protection, preregistration.analysis.quality_lower_quantile);
  const threshold = preregistration.analysis.switch_resilience_supportive_threshold;
  const switchResilience = {
    point_estimate: protectionPoint,
    one_sided_95_lower: protectionLower,
    supportive_threshold: threshold,
    classification: protectionPoint >= threshold && protectionLower > 0 ? "SUPPORTIVE_ON_FIXED_BENCHMARK" : protectionPoint < 0 ? "NEGATIVE_ON_FIXED_BENCHMARK" : "NEUTRAL_OR_UNRESOLVED",
  };
  const statisticalGatePass = TRAJECTORIES.every((trajectory) => quality[trajectory].pass && cost[trajectory].pass && input[trajectory].pass && critical[trajectory].pass);
  return {
    schema_version: "clutch-v2-public-statistical-replay.v1",
    study_id: outcomes.study_id,
    statistical_gate_pass: statisticalGatePass,
    quality_noninferiority: quality,
    critical_safety_and_collapse: critical,
    input_efficiency: input,
    provider_cost_efficiency: cost,
    switch_resilience: switchResilience,
    route_summaries: summaries,
    claim_ceiling: "MINIMIZED_OUTCOME_TABLE_REPLAY_DOES_NOT_RESCORE_RAW_RESPONSES_OR_REESTABLISH_EXECUTION_INTEGRITY",
  };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const evidenceRoot = join(root, "evidence", "clutch-v2-confirmatory-001");
  const outcomes = JSON.parse(readFileSync(join(evidenceRoot, "outcome-table.json"), "utf8"));
  const preregistration = JSON.parse(readFileSync(join(evidenceRoot, "public-preregistration.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(recomputePublicEvaluation(outcomes, preregistration), null, 2)}\n`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
