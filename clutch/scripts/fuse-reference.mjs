#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

// This is intentionally a second implementation of the Fuse projection. It does
// not import the primary reducer. Conformance tests compare both implementations
// so a shared assumption is less likely to pass unnoticed.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HASH = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;
const LEVELS = ["CARD", "EXPANDED", "FULL_CONTEXT"];
const CHECK = new Set(["PASS", "FAIL", "UNKNOWN", "ERROR"]);
const WORKER_STATUS = new Set(["PASS", "FAIL", "STOPPED", "UNKNOWN"]);
const CLASS = new Set([
  "NONE", "EXECUTION_DEFECT", "CONTRACT_DEFECT", "CAPABILITY_MISMATCH",
  "CONTEXT_OMISSION", "STALE_STATE", "OBSERVATION_GAP", "TRANSPORT_FAILURE",
  "AUTHORITY_GAP", "SAFETY_HOLD",
]);
const REASONS = new Set([...CLASS].filter((item) => item !== "NONE").concat("PHASE_MISMATCH"));
const REPAIRABLE = new Set(["EXECUTION_DEFECT", "PHASE_MISMATCH", "CONTEXT_OMISSION", "STALE_STATE"]);
const TRANSFERABLE = new Set(["EXECUTION_DEFECT", "PHASE_MISMATCH", "CONTEXT_OMISSION", "STALE_STATE", "CAPABILITY_MISMATCH"]);
const STRICT_STOP = new Set(["CONTRACT_DEFECT", "OBSERVATION_GAP", "TRANSPORT_FAILURE", "AUTHORITY_GAP", "SAFETY_HOLD"]);
const OBSERVED_FAILURE = new Set(["EXECUTION_DEFECT", "CONTRACT_DEFECT", "CAPABILITY_MISMATCH", "CONTEXT_OMISSION", "STALE_STATE", "AUTHORITY_GAP", "SAFETY_HOLD"]);

function reject(code = "REFERENCE_REJECTED") {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function objectWith(value, names, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) reject(`${code}_OBJECT`);
  const left = Object.keys(value).sort().join("\n");
  const right = [...names].sort().join("\n");
  if (left !== right) reject(`${code}_KEYS`);
}

function isId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 120 && SAFE_ID.test(value);
}

function requireId(value, code) {
  if (!isId(value)) reject(code);
}

function requireHash(value, code, alternate = null) {
  if (alternate !== null && value === alternate) return;
  if (typeof value !== "string" || !HASH.test(value)) reject(code);
}

function integer(value, code, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) reject(code);
}

function telemetry(value, code) {
  if (value === "UNKNOWN") return;
  integer(value, code);
}

function addTelemetry(total, value) {
  if (total === "UNKNOWN" || value === "UNKNOWN") return "UNKNOWN";
  const next = total + value;
  if (!Number.isSafeInteger(next)) reject("REFERENCE_USAGE_OVERFLOW");
  return next;
}

function ordinalCompare(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function canonical(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) reject("REFERENCE_INVALID_UNICODE");
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) reject("REFERENCE_INVALID_UNICODE");
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) reject("REFERENCE_NONCANONICAL_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object") reject("REFERENCE_NONCANONICAL_VALUE");
  return Object.fromEntries(Object.keys(value).sort().map((key) => {
    if (!SAFE_ID.test(key)) reject("REFERENCE_NONCANONICAL_KEY");
    return [key, canonical(value[key])];
  }));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function receiptHash(receipt) {
  const body = structuredClone(receipt);
  delete body.receipt_hash;
  return digest(body);
}

function decisionHash(planHash, receipt, fromPhaseId, reasonCode, route) {
  return digest({
    schema_version: "fuse-decision.v1",
    plan_hash: planHash,
    receipt_hash: receipt.receipt_hash,
    from_phase_id: fromPhaseId,
    reason_code: reasonCode,
    route_id: route?.route_id ?? "NONE",
    action: route?.action ?? "HOLD",
    to_phase_id: route?.to_phase_id ?? null,
  });
}

function opaqueRef(kind, planHash, value) {
  if (value === null) return null;
  if (value === "NONE") return "NONE";
  return digest({ schema_version: "opaque-ref.v1", kind, plan_hash: planHash, value });
}

function sortedSet(values, code) {
  if (!Array.isArray(values) || values.length === 0) reject(code);
  for (const value of values) requireId(value, code);
  if (new Set(values).size !== values.length) reject(code);
  if (values.join("\n") !== [...values].sort().join("\n")) reject(code);
}

function inspectPlan(plan) {
  objectWith(plan, [
    "schema_version", "plan_id", "card_hash", "policy_hash", "source_freeze_hash",
    "approval_mode", "initial_artifact_hash", "initial_phase_id", "final_phase_id",
    "max_fuse_uses", "max_platform_transfers", "worker_profiles", "phases", "routes",
    "claim_ceiling",
  ], "REFERENCE_PLAN");
  if (plan.schema_version !== "fuse-plan.v1" || plan.approval_mode !== "EXACT_UPFRONT") reject("REFERENCE_PLAN_MODE");
  requireId(plan.plan_id, "REFERENCE_PLAN_ID");
  for (const [key, value] of [["CARD", plan.card_hash], ["POLICY", plan.policy_hash], ["SOURCE", plan.source_freeze_hash], ["INITIAL_ARTIFACT", plan.initial_artifact_hash]]) {
    requireHash(value, `REFERENCE_PLAN_${key}`);
  }
  requireId(plan.initial_phase_id, "REFERENCE_INITIAL_PHASE");
  requireId(plan.final_phase_id, "REFERENCE_FINAL_PHASE");
  integer(plan.max_fuse_uses, "REFERENCE_MAX_FUSES");
  integer(plan.max_platform_transfers, "REFERENCE_MAX_TRANSFERS");
  sortedSet(plan.worker_profiles, "REFERENCE_PROFILES");
  if (typeof plan.claim_ceiling !== "string" || plan.claim_ceiling.trim() === "" || plan.claim_ceiling.length > 1000) reject("REFERENCE_CLAIM");
  if (!Array.isArray(plan.phases) || plan.phases.length === 0 || plan.phases.length > 32) reject("REFERENCE_PHASES");
  if (!Array.isArray(plan.routes) || plan.routes.length > 64) reject("REFERENCE_ROUTES");

  const phases = new Map();
  plan.phases.forEach((phase, index) => {
    objectWith(phase, ["phase_id", "ordinal", "contract_hash", "requirement_ids", "worker_profile", "platform_id", "transfer_level", "next_phase_id"], "REFERENCE_PHASE");
    requireId(phase.phase_id, "REFERENCE_PHASE_ID");
    if (phases.has(phase.phase_id) || phase.ordinal !== index) reject("REFERENCE_PHASE_ORDER");
    requireHash(phase.contract_hash, "REFERENCE_PHASE_CONTRACT");
    sortedSet(phase.requirement_ids, "REFERENCE_REQUIREMENTS");
    if (!plan.worker_profiles.includes(phase.worker_profile)) reject("REFERENCE_PHASE_PROFILE");
    requireId(phase.platform_id, "REFERENCE_PLATFORM");
    if (!LEVELS.includes(phase.transfer_level)) reject("REFERENCE_LEVEL");
    if (phase.next_phase_id !== null) requireId(phase.next_phase_id, "REFERENCE_NEXT_PHASE");
    phases.set(phase.phase_id, phase);
  });
  if (!phases.has(plan.initial_phase_id) || phases.get(plan.initial_phase_id).ordinal !== 0) reject("REFERENCE_INITIAL_UNKNOWN");
  if (!phases.has(plan.final_phase_id) || phases.get(plan.final_phase_id).next_phase_id !== null) reject("REFERENCE_FINAL_INVALID");
  for (const phase of plan.phases) {
    if (phase.phase_id !== plan.final_phase_id && phase.next_phase_id === null) reject("REFERENCE_NONFINAL_DEAD_END");
    if (phase.next_phase_id !== null) {
      const next = phases.get(phase.next_phase_id);
      if (!next || next.ordinal <= phase.ordinal) reject("REFERENCE_NEXT_NOT_FORWARD");
    }
  }

  const routes = new Map();
  const routeIds = new Set();
  let prior = null;
  for (const route of plan.routes) {
    objectWith(route, ["route_id", "from_phase_id", "reason_code", "action", "to_phase_id", "max_uses"], "REFERENCE_ROUTE");
    requireId(route.route_id, "REFERENCE_ROUTE_ID");
    if (routeIds.has(route.route_id) || (prior !== null && ordinalCompare(route.route_id, prior) <= 0)) reject("REFERENCE_ROUTE_ORDER");
    routeIds.add(route.route_id);
    prior = route.route_id;
    if (!phases.has(route.from_phase_id) || !REASONS.has(route.reason_code) || !["REPAIR", "TRANSFER", "EVACUATE"].includes(route.action) || route.max_uses !== 1) reject("REFERENCE_ROUTE_FIELDS");
    const key = `${route.from_phase_id}\u0000${route.reason_code}`;
    if (routes.has(key)) reject("REFERENCE_ROUTE_AMBIGUOUS");
    routes.set(key, route);
    if (route.action === "EVACUATE") {
      if (route.to_phase_id !== null) reject("REFERENCE_EVACUATE_TARGET");
      continue;
    }
    const source = phases.get(route.from_phase_id);
    const target = phases.get(route.to_phase_id);
    if (!target || target.ordinal <= source.ordinal) reject("REFERENCE_ROUTE_NOT_FORWARD");
    if (route.action === "REPAIR" && !REPAIRABLE.has(route.reason_code)) reject("REFERENCE_UNSAFE_REPAIR");
    if (route.action === "TRANSFER" && !TRANSFERABLE.has(route.reason_code)) reject("REFERENCE_UNSAFE_TRANSFER");
    if (route.action === "REPAIR" && target.contract_hash === source.contract_hash && target.requirement_ids.join("\n") === source.requirement_ids.join("\n") && target.worker_profile === source.worker_profile && target.platform_id === source.platform_id && target.transfer_level === source.transfer_level) {
      reject("REFERENCE_NOOP_REPAIR");
    }
    if (route.action === "TRANSFER" && target.worker_profile === source.worker_profile && target.platform_id === source.platform_id) reject("REFERENCE_NOOP_TRANSFER");
    if (route.reason_code === "CONTEXT_OMISSION" && LEVELS.indexOf(target.transfer_level) < LEVELS.indexOf(source.transfer_level)) reject("REFERENCE_CONTEXT_SHRINK");
  }
  if (plan.max_fuse_uses > plan.routes.length) reject("REFERENCE_FUSE_BOUND");
  return { phases, routes };
}

function inspectReceipt(receipt, plan, planHash, phases) {
  objectWith(receipt, [
    "schema_version", "sequence", "previous_receipt_hash", "plan_hash", "phase_id", "attempt_id",
    "worker_id", "worker_profile", "worker_status", "platform_id", "transfer_level", "input_artifact_hash",
    "output_artifact_hash", "contract_hash", "provider_attempt_hash", "fuse_context_hash",
    "evaluation", "usage", "receipt_hash",
  ], "REFERENCE_RECEIPT");
  if (receipt.schema_version !== "phase-receipt.v1") reject("REFERENCE_RECEIPT_SCHEMA");
  integer(receipt.sequence, "REFERENCE_SEQUENCE", 1);
  requireHash(receipt.previous_receipt_hash, "REFERENCE_PREVIOUS", "ROOT");
  requireHash(receipt.plan_hash, "REFERENCE_PLAN_HASH");
  if (receipt.plan_hash !== planHash) reject("REFERENCE_PLAN_REPLAY");
  requireId(receipt.phase_id, "REFERENCE_RECEIPT_PHASE");
  const phase = phases.get(receipt.phase_id);
  if (!phase) reject("REFERENCE_PHASE_UNKNOWN");
  for (const [key, value] of [["ATTEMPT", receipt.attempt_id], ["WORKER", receipt.worker_id], ["PROFILE", receipt.worker_profile], ["PLATFORM", receipt.platform_id]]) requireId(value, `REFERENCE_${key}`);
  if (!WORKER_STATUS.has(receipt.worker_status)) reject("REFERENCE_WORKER_STATUS");
  if (!LEVELS.includes(receipt.transfer_level)) reject("REFERENCE_RECEIPT_LEVEL");
  requireHash(receipt.input_artifact_hash, "REFERENCE_INPUT_ARTIFACT");
  requireHash(receipt.output_artifact_hash, "REFERENCE_OUTPUT_ARTIFACT", "UNKNOWN");
  requireHash(receipt.contract_hash, "REFERENCE_RECEIPT_CONTRACT");
  requireHash(receipt.provider_attempt_hash, "REFERENCE_PROVIDER_ATTEMPT");
  requireHash(receipt.fuse_context_hash, "REFERENCE_FUSE_CONTEXT", "NONE");
  requireHash(receipt.receipt_hash, "REFERENCE_RECEIPT_HASH");
  if (receipt.receipt_hash !== receiptHash(receipt)) reject("REFERENCE_RECEIPT_TAMPER");

  objectWith(receipt.evaluation, ["classification", "verification_status", "check_results", "fix_log_hash"], "REFERENCE_EVALUATION");
  if (!CLASS.has(receipt.evaluation.classification) || !Array.isArray(receipt.evaluation.check_results)) reject("REFERENCE_EVALUATION_FIELDS");
  if (!CHECK.has(receipt.evaluation.verification_status)) reject("REFERENCE_VERIFICATION_STATUS");
  const observed = new Set();
  for (const check of receipt.evaluation.check_results) {
    objectWith(check, ["requirement_id", "status", "evidence_hash"], "REFERENCE_CHECK");
    if (!phase.requirement_ids.includes(check.requirement_id) || observed.has(check.requirement_id) || !CHECK.has(check.status)) reject("REFERENCE_CHECK_MAPPING");
    observed.add(check.requirement_id);
    requireHash(check.evidence_hash, "REFERENCE_CHECK_EVIDENCE");
  }
  if ([...observed].sort().join("\n") !== phase.requirement_ids.join("\n")) reject("REFERENCE_CHECK_COVERAGE");
  requireHash(receipt.evaluation.fix_log_hash, "REFERENCE_FIX_LOG", "NONE");
  const statuses = receipt.evaluation.check_results.map((check) => check.status);
  const verificationStatus = statuses.every((status) => status === "PASS") ? "PASS" : statuses.includes("ERROR") ? "ERROR" : statuses.includes("UNKNOWN") ? "UNKNOWN" : "FAIL";
  if (receipt.evaluation.verification_status !== verificationStatus) reject("REFERENCE_VERIFICATION_STATUS_MISMATCH");
  if (verificationStatus === "FAIL" && !OBSERVED_FAILURE.has(receipt.evaluation.classification)) reject("REFERENCE_FAILURE_CLASS_MISSING");
  let derived = receipt.evaluation.classification;
  if (statuses.every((status) => status === "PASS")) derived = "NONE";
  else if (statuses.includes("ERROR")) derived = "TRANSPORT_FAILURE";
  else if (statuses.includes("UNKNOWN")) derived = "OBSERVATION_GAP";
  if (derived === "NONE") {
    if (receipt.evaluation.classification !== "NONE" || receipt.evaluation.fix_log_hash !== "NONE" || receipt.output_artifact_hash === "UNKNOWN" || receipt.worker_status !== "PASS") reject("REFERENCE_PASS_INCONSISTENT");
  } else {
    if (receipt.evaluation.fix_log_hash === "NONE" || statuses.every((status) => status === "PASS")) reject("REFERENCE_FAILURE_INCONSISTENT");
    if (derived === "TRANSPORT_FAILURE" && receipt.evaluation.classification !== "TRANSPORT_FAILURE") reject("REFERENCE_ERROR_CLASS");
    if (derived === "OBSERVATION_GAP" && receipt.evaluation.classification !== "OBSERVATION_GAP") reject("REFERENCE_UNKNOWN_CLASS");
    if (!["TRANSPORT_FAILURE", "OBSERVATION_GAP"].includes(derived) && receipt.output_artifact_hash === "UNKNOWN") reject("REFERENCE_OBSERVED_OUTPUT_MISSING");
  }
  objectWith(receipt.usage, ["input_tokens", "cached_input_tokens", "output_tokens", "elapsed_ms", "cost_microusd"], "REFERENCE_USAGE");
  for (const [key, value] of Object.entries(receipt.usage)) telemetry(value, `REFERENCE_USAGE_${key}`);
  if (receipt.usage.cached_input_tokens !== "UNKNOWN" &&
      receipt.usage.input_tokens !== "UNKNOWN" &&
      receipt.usage.cached_input_tokens > receipt.usage.input_tokens) {
    reject("REFERENCE_CACHE");
  }
  return { phase, derived };
}

export function projectFuseInput(input) {
  try {
    objectWith(input, ["schema_version", "plan", "approval_binding", "receipts"], "REFERENCE_INPUT");
    if (input.schema_version !== "fuse-gate-input.v1") reject("REFERENCE_INPUT_SCHEMA");
    const planHash = digest(input.plan);
    const { phases, routes } = inspectPlan(input.plan);
    objectWith(input.approval_binding, ["plan_hash", "card_hash", "approval_event_hash", "observation"], "REFERENCE_APPROVAL");
    requireHash(input.approval_binding.plan_hash, "REFERENCE_APPROVAL_PLAN");
    requireHash(input.approval_binding.card_hash, "REFERENCE_APPROVAL_CARD");
    requireHash(input.approval_binding.approval_event_hash, "REFERENCE_APPROVAL_EVENT");
    if (input.approval_binding.observation !== "DIRECT_HOST_OBSERVATION_DECLARED" || input.approval_binding.plan_hash !== planHash || input.approval_binding.card_hash !== input.plan.card_hash) reject("REFERENCE_APPROVAL_BINDING");
    if (!Array.isArray(input.receipts) || input.receipts.length > input.plan.phases.length) reject("REFERENCE_RECEIPT_COUNT");

    let prior = "ROOT";
    const phaseIds = new Set();
    const attemptIds = new Set();
    const providerAttempts = new Set();
    input.receipts.forEach((receipt, index) => {
      inspectReceipt(receipt, input.plan, planHash, phases);
      if (receipt.sequence !== index + 1 || receipt.previous_receipt_hash !== prior) reject("REFERENCE_CHAIN");
      if (phaseIds.has(receipt.phase_id) || attemptIds.has(receipt.attempt_id) || providerAttempts.has(receipt.provider_attempt_hash)) reject("REFERENCE_RETRY");
      phaseIds.add(receipt.phase_id);
      attemptIds.add(receipt.attempt_id);
      providerAttempts.add(receipt.provider_attempt_hash);
      prior = receipt.receipt_hash;
    });

    let expected = input.plan.initial_phase_id;
    let admissible = input.plan.initial_artifact_hash;
    let candidate = "NONE";
    let state = "READY";
    let action = "START";
    let reason = "NONE";
    let routeId = "NONE";
    let holdCode = "NONE";
    let fuseUses = 0;
    let transfers = 0;
    let expectedFuseContext = "NONE";
    let terminal = false;
    let feedbackCount = 0;
    const routeUses = new Set();
    const processedPhases = new Set();
    const usage = {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      elapsed_ms: 0,
      cost_microusd: 0,
      telemetry_status: "COMPLETE",
      delivery_units: 0,
      efficiency_eligible: false,
    };

    for (const receipt of input.receipts) {
      if (terminal) reject("REFERENCE_RECEIPT_AFTER_TERMINAL");
      const { phase, derived } = inspectReceipt(receipt, input.plan, planHash, phases);
      if (receipt.worker_profile !== phase.worker_profile || receipt.platform_id !== phase.platform_id || receipt.transfer_level !== phase.transfer_level || receipt.contract_hash !== phase.contract_hash) reject("REFERENCE_PHASE_BINDING");
      if (receipt.input_artifact_hash !== admissible) reject("REFERENCE_INPUT_NOT_ADMISSIBLE");
      if (receipt.fuse_context_hash !== expectedFuseContext) reject("REFERENCE_FUSE_CONTEXT_STATE");
      processedPhases.add(receipt.phase_id);
      for (const key of ["input_tokens", "cached_input_tokens", "output_tokens", "elapsed_ms", "cost_microusd"]) {
        usage[key] = addTelemetry(usage[key], receipt.usage[key]);
      }
      if (Object.values(receipt.usage).includes("UNKNOWN")) usage.telemetry_status = "UNKNOWN";
      candidate = receipt.output_artifact_hash;
      if (receipt.phase_id !== expected && derived === "NONE") reject("REFERENCE_PHASE_MISMATCH_WITHOUT_FIX_LOG");
      const effective = receipt.phase_id === expected || STRICT_STOP.has(derived) ? derived : "PHASE_MISMATCH";
      if (effective === "NONE") {
        admissible = receipt.output_artifact_hash;
        reason = "NONE";
        routeId = "NONE";
        holdCode = "NONE";
        expectedFuseContext = "NONE";
        if (receipt.phase_id === input.plan.final_phase_id) {
          state = "DELIVERABLE";
          action = "VERIFY_FOR_ACCEPTANCE";
          usage.delivery_units = 1;
          expected = null;
          terminal = true;
        } else {
          if (phase.next_phase_id === null) reject("REFERENCE_PASS_DEAD_END");
          if (processedPhases.has(phase.next_phase_id)) {
            holdCode = "NEXT_PHASE_ALREADY_ATTEMPTED";
            state = "HOLD_NEUTRAL";
            action = "HOLD";
            expected = null;
            terminal = true;
            expectedFuseContext = "NONE";
          } else {
            state = "ADVANCE_READY";
            action = "ADVANCE";
            expected = phase.next_phase_id;
          }
        }
        continue;
      }
      feedbackCount += 1;
      const from = receipt.phase_id === expected ? receipt.phase_id : expected;
      const declaredRoute = routes.get(`${from}\u0000${effective}`);
      let route = declaredRoute;
      holdCode = "NONE";
      if (!route) {
        holdCode = "UNDECLARED_ROUTE";
      } else if (fuseUses >= input.plan.max_fuse_uses) {
        holdCode = "FUSE_LIMIT_EXHAUSTED";
        route = null;
      } else if (routeUses.has(route.route_id)) {
        holdCode = "ROUTE_LIMIT_EXHAUSTED";
        route = null;
      } else if (route.action !== "EVACUATE" && processedPhases.has(route.to_phase_id)) {
        holdCode = "ROUTE_TARGET_ALREADY_ATTEMPTED";
        route = null;
      } else if (route.action === "TRANSFER") {
        const source = phases.get(from);
        const target = phases.get(route.to_phase_id);
        const changesPlatform = source.worker_profile !== target.worker_profile || source.platform_id !== target.platform_id;
        if (changesPlatform && transfers >= input.plan.max_platform_transfers) {
          holdCode = "PLATFORM_TRANSFER_LIMIT_EXHAUSTED";
          route = null;
        }
      }
      const fuseDecision = decisionHash(planHash, receipt, from, effective, route);
      reason = effective;
      routeId = route?.route_id ?? "NONE";
      if (!route) {
        state = "HOLD_NEUTRAL";
        action = "HOLD";
        expected = null;
        terminal = true;
        expectedFuseContext = "NONE";
        continue;
      }
      fuseUses += 1;
      routeUses.add(route.route_id);
      if (route.action === "EVACUATE") {
        state = "EVACUATED";
        action = "EVACUATE";
        expected = null;
        terminal = true;
        expectedFuseContext = "NONE";
        continue;
      }
      const source = phases.get(from);
      const target = phases.get(route.to_phase_id);
      if (route.action === "TRANSFER" && (source.worker_profile !== target.worker_profile || source.platform_id !== target.platform_id)) {
        transfers += 1;
      }
      state = "FUSE_OPEN";
      action = route.action;
      expected = route.to_phase_id;
      expectedFuseContext = fuseDecision;
    }

    usage.efficiency_eligible = usage.delivery_units === 1 && usage.telemetry_status === "COMPLETE";

    return {
      validation: "VALID",
      state,
      action,
      expected_phase_ref: opaqueRef("phase", planHash, expected),
      last_receipt_hash: prior,
      last_admissible_artifact_hash: admissible,
      candidate_artifact_hash: candidate,
      reason_code: reason,
      hold_code: holdCode,
      route_ref: opaqueRef("route", planHash, routeId),
      fuse_uses: fuseUses,
      platform_transfers: transfers,
      delivery_eligible: usage.delivery_units === 1,
      feedback_count: feedbackCount,
      cost_microusd: usage.cost_microusd,
      telemetry_status: usage.telemetry_status,
      efficiency_eligible: usage.efficiency_eligible,
      delivery_units: usage.delivery_units,
      plan_hash: planHash,
    };
  } catch (error) {
    return { validation: "INVALID", error_code: error.code ?? "REFERENCE_REJECTED" };
  }
}

function main() {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write("Usage: node fuse-reference.mjs <input.json>\n");
    process.exitCode = 2;
    return;
  }
  const result = projectFuseInput(JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.validation === "VALID" ? 0 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
