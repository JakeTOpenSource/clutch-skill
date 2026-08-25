#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outcomes = JSON.parse(readFileSync(join(root, "evidence", "clutch-v2-confirmatory-001", "outcome-table.json"), "utf8"));
const preregistration = JSON.parse(readFileSync(join(root, "evidence", "clutch-v2-repeatability-plan", "preregistration.json"), "utf8"));

const priorSwitchRows = outcomes.route_records.filter((record) => record.trajectory === "TERRA_TO_LUNA");
assert.equal(priorSwitchRows.length, 30);
const priorObservedRouteSpendUsd = priorSwitchRows.reduce((sum, record) => sum + record.route_charge_nanousd, 0) / 1e9;
const priorAdvisorSpendUsd = priorSwitchRows
  .filter((record) => record.carriage === "APPROVED_CARD")
  .reduce((sum, record) => sum + record.advisor_allocated_charge_nanousd, 0) / 1e9;
const priorWorkerSpendUsd = priorObservedRouteSpendUsd - priorAdvisorSpendUsd;
const priorTasks = priorSwitchRows.filter((record) => record.carriage === "FULL_HISTORY").length;
assert.equal(priorTasks, 15);
assert.ok(priorWorkerSpendUsd > 0);
assert.ok(priorAdvisorSpendUsd > 0);

const tasks = preregistration.design.total_waves * preregistration.design.tasks_per_wave;
const workerGenerations = tasks * preregistration.design.worker_generation_calls_per_task;
const advisorGenerations = preregistration.design.total_waves * preregistration.design.advisor_generation_calls_per_wave;
const generationCalls = workerGenerations + advisorGenerations;
const exactCountCalls = generationCalls * preregistration.design.exact_count_calls_per_generation;
const maximumEndpointAttempts = generationCalls + exactCountCalls + preregistration.design.maximum_count_only_transport_retries_total;

const conservativeWorkerCostPerTaskUsd = priorWorkerSpendUsd / priorTasks;
const observedSolAdvisorCostPerWaveUsd = priorAdvisorSpendUsd;
const gpt55AdvisorCostPerWaveEstimateUsd = 0.79;
const expectedSpendUsd =
  tasks * conservativeWorkerCostPerTaskUsd +
  preregistration.design.primary_sol_waves * observedSolAdvisorCostPerWaveUsd +
  gpt55AdvisorCostPerWaveEstimateUsd;
const contingencyMultiplier = 1.2;
const provisionalFundingEnvelopeUsd = Math.ceil(expectedSpendUsd * contingencyMultiplier * 100) / 100;
const ownerExternalCeilingUsd = 64;
const provisionalHeadroomUsd = Math.floor((ownerExternalCeilingUsd - provisionalFundingEnvelopeUsd) * 100) / 100;

process.stdout.write(`${JSON.stringify({
  schema_version: "clutch-external-study-plan.v2",
  study_id: preregistration.study_id,
  authority: "EXTERNAL_META_GOVERNANCE_ONLY",
  affects_clutch_pass_fail: false,
  construction_bound: false,
  reason_not_construction_bound: "Fresh sources, exact request bytes, output ceilings, and provider input-token counts have not been frozen.",
  optimization: {
    objective: "Preserve fourteen independent waves at all three context intervals while maximizing task-family coverage under the external ceiling.",
    design: "Two task families per wave through a frozen round-robin pair schedule, balanced across context intervals and three variants.",
    primary_family_appearances: 14,
    owner_external_ceiling_usd: ownerExternalCeilingUsd,
  },
  planned_work: {
    waves: preregistration.design.total_waves,
    primary_sol_waves: preregistration.design.primary_sol_waves,
    alternate_gpt55_waves: preregistration.design.alternate_advisor_stress_waves,
    context_intervals: preregistration.design.context_intervals.map((interval) => interval.pre_handoff_history_bytes),
    task_families: preregistration.design.total_task_families,
    tasks_per_wave: preregistration.design.tasks_per_wave,
    total_tasks: tasks,
    worker_generation_calls: workerGenerations,
    advisor_generation_calls: advisorGenerations,
    generation_calls: generationCalls,
    exact_count_calls: exactCountCalls,
    maximum_count_only_transport_retries: preregistration.design.maximum_count_only_transport_retries_total,
    maximum_endpoint_attempts: maximumEndpointAttempts,
  },
  empirical_basis: {
    prior_switch_tasks: priorTasks,
    prior_observed_route_spend_usd: priorObservedRouteSpendUsd,
    prior_advisor_spend_usd: priorAdvisorSpendUsd,
    prior_worker_spend_usd: priorWorkerSpendUsd,
    conservative_worker_cost_per_task_usd: conservativeWorkerCostPerTaskUsd,
    observed_sol_advisor_cost_per_wave_usd: observedSolAdvisorCostPerWaveUsd,
    gpt55_advisor_cost_per_wave_estimate_usd: gpt55AdvisorCostPerWaveEstimateUsd,
    caveat: "Historical per-task charges are planning evidence, not a construction-bound price for the new requests.",
  },
  funding_estimate: {
    expected_spend_usd: expectedSpendUsd,
    contingency_multiplier: contingencyMultiplier,
    provisional_funding_envelope_usd: provisionalFundingEnvelopeUsd,
    owner_external_ceiling_usd: ownerExternalCeilingUsd,
    provisional_headroom_usd: provisionalHeadroomUsd,
    provisionally_fits_ceiling: provisionalFundingEnvelopeUsd <= ownerExternalCeilingUsd,
    authorization: "NONE_UNTIL_CONSTRUCTION_BOUND_CERTIFICATE",
  },
  execution_gate: "Do not make a paid generation call unless the frozen count-and-rate certificate covers the complete balanced block at or below $64.00. Stop rather than silently reduce waves after seeing counts or outcomes.",
  next_certificate_requires: [
    "frozen source and task manifest",
    "frozen advisor and worker request bytes",
    "frozen model snapshots and output ceilings",
    "one exact input-token count per generation request",
    "declared rate table and long-context multipliers",
    "bounded count-only retry reserve"
  ]
}, null, 2)}\n`);
