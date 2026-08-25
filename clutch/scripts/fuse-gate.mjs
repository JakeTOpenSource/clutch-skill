#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_.-]+$/;
const TRANSFER_LEVELS = ["CARD", "EXPANDED", "FULL_CONTEXT"];
const CHECK_STATUSES = new Set(["PASS", "FAIL", "UNKNOWN", "ERROR"]);
const WORKER_STATUSES = new Set(["PASS", "FAIL", "STOPPED", "UNKNOWN"]);
const VERIFICATION_STATUSES = new Set(["PASS", "FAIL", "UNKNOWN", "ERROR"]);
const CLASSIFICATIONS = new Set([
  "NONE",
  "EXECUTION_DEFECT",
  "CONTRACT_DEFECT",
  "CAPABILITY_MISMATCH",
  "CONTEXT_OMISSION",
  "STALE_STATE",
  "OBSERVATION_GAP",
  "TRANSPORT_FAILURE",
  "AUTHORITY_GAP",
  "SAFETY_HOLD",
]);
const ROUTE_REASONS = new Set([...CLASSIFICATIONS].filter((value) => value !== "NONE").concat("PHASE_MISMATCH"));
const ACTIONS = new Set(["REPAIR", "TRANSFER", "EVACUATE"]);
const REPAIR_REASONS = new Set(["EXECUTION_DEFECT", "PHASE_MISMATCH", "CONTEXT_OMISSION", "STALE_STATE"]);
const TRANSFER_REASONS = new Set(["EXECUTION_DEFECT", "PHASE_MISMATCH", "CONTEXT_OMISSION", "STALE_STATE", "CAPABILITY_MISMATCH"]);
const STRICT_STOP_CLASSIFICATIONS = new Set([
  "CONTRACT_DEFECT", "OBSERVATION_GAP", "TRANSPORT_FAILURE", "AUTHORITY_GAP", "SAFETY_HOLD",
]);
const OBSERVED_FAILURE_CLASSIFICATIONS = new Set([
  "EXECUTION_DEFECT", "CONTRACT_DEFECT", "CAPABILITY_MISMATCH", "CONTEXT_OMISSION",
  "STALE_STATE", "AUTHORITY_GAP", "SAFETY_HOLD",
]);

class FuseError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new FuseError(code);
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${code}_OBJECT`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${code}_KEYS`);
}

function id(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.length > 120 || !ID.test(value)) fail(code);
}

function text(value, code) {
  if (typeof value !== "string" || value.trim() === "" || value.length > 1000) fail(code);
}

function validateUnicode(value, code) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(code);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(code);
    }
  }
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
}

function hashOr(value, sentinel, code) {
  if (value !== sentinel) hash(value, code);
}

function nonnegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
}

function telemetryValue(value, code) {
  if (value === "UNKNOWN") return;
  nonnegativeInteger(value, code);
}

function addTelemetry(total, value) {
  if (total === "UNKNOWN" || value === "UNKNOWN") return "UNKNOWN";
  const next = total + value;
  if (!Number.isSafeInteger(next)) fail("USAGE_TOTAL_OVERFLOW");
  return next;
}

function positiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) fail(code);
}

function ordinalCompare(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sortedUniqueIds(values, code) {
  if (!Array.isArray(values) || values.length === 0) fail(`${code}_EMPTY`);
  values.forEach((value) => id(value, code));
  if (new Set(values).size !== values.length) fail(`${code}_DUPLICATE`);
  if (JSON.stringify(values) !== JSON.stringify([...values].sort())) fail(`${code}_UNSORTED`);
}

function canonicalize(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    validateUnicode(value, "INVALID_UNICODE");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("NONCANONICAL_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") fail("NONCANONICAL_VALUE");
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (!ID.test(key)) fail("NONCANONICAL_KEY");
    output[key] = canonicalize(value[key]);
  }
  return output;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestObject(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function digestPlan(plan) {
  return digestObject(plan);
}

export function receiptDigest(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receipt_hash;
  return digestObject(copy);
}

function opaqueRef(kind, planHash, value) {
  if (value === null) return null;
  if (value === "NONE") return "NONE";
  return digestObject({ schema_version: "opaque-ref.v1", kind, plan_hash: planHash, value });
}

function validatePlan(plan) {
  exactKeys(plan, [
    "schema_version", "plan_id", "card_hash", "policy_hash", "source_freeze_hash",
    "approval_mode", "initial_artifact_hash", "initial_phase_id", "final_phase_id",
    "max_fuse_uses", "max_platform_transfers", "worker_profiles", "phases", "routes",
    "claim_ceiling",
  ], "PLAN");
  if (plan.schema_version !== "fuse-plan.v1") fail("PLAN_SCHEMA");
  id(plan.plan_id, "PLAN_ID");
  hash(plan.card_hash, "PLAN_CARD_HASH");
  hash(plan.policy_hash, "PLAN_POLICY_HASH");
  hash(plan.source_freeze_hash, "PLAN_SOURCE_FREEZE_HASH");
  hash(plan.initial_artifact_hash, "PLAN_INITIAL_ARTIFACT_HASH");
  if (plan.approval_mode !== "EXACT_UPFRONT") fail("PLAN_APPROVAL_MODE");
  id(plan.initial_phase_id, "PLAN_INITIAL_PHASE_ID");
  id(plan.final_phase_id, "PLAN_FINAL_PHASE_ID");
  nonnegativeInteger(plan.max_fuse_uses, "PLAN_MAX_FUSE_USES");
  nonnegativeInteger(plan.max_platform_transfers, "PLAN_MAX_PLATFORM_TRANSFERS");
  sortedUniqueIds(plan.worker_profiles, "PLAN_WORKER_PROFILES");
  text(plan.claim_ceiling, "PLAN_CLAIM_CEILING");
  if (!Array.isArray(plan.phases) || plan.phases.length === 0 || plan.phases.length > 32) fail("PLAN_PHASES");
  if (!Array.isArray(plan.routes) || plan.routes.length > 64) fail("PLAN_ROUTES");

  const phases = new Map();
  for (let index = 0; index < plan.phases.length; index += 1) {
    const phase = plan.phases[index];
    exactKeys(phase, [
      "phase_id", "ordinal", "contract_hash", "requirement_ids", "worker_profile",
      "platform_id", "transfer_level", "next_phase_id",
    ], "PHASE");
    id(phase.phase_id, "PHASE_ID");
    if (phases.has(phase.phase_id)) fail("PHASE_ID_DUPLICATE");
    if (phase.ordinal !== index) fail("PHASE_ORDINAL");
    hash(phase.contract_hash, "PHASE_CONTRACT_HASH");
    sortedUniqueIds(phase.requirement_ids, "PHASE_REQUIREMENT_IDS");
    if (!plan.worker_profiles.includes(phase.worker_profile)) fail("PHASE_WORKER_PROFILE");
    id(phase.platform_id, "PHASE_PLATFORM_ID");
    if (!TRANSFER_LEVELS.includes(phase.transfer_level)) fail("PHASE_TRANSFER_LEVEL");
    if (phase.next_phase_id !== null) id(phase.next_phase_id, "PHASE_NEXT_ID");
    phases.set(phase.phase_id, phase);
  }
  if (!phases.has(plan.initial_phase_id)) fail("PLAN_INITIAL_PHASE_UNKNOWN");
  if (!phases.has(plan.final_phase_id)) fail("PLAN_FINAL_PHASE_UNKNOWN");
  if (phases.get(plan.initial_phase_id).ordinal !== 0) fail("PLAN_INITIAL_PHASE_NOT_FIRST");
  if (phases.get(plan.final_phase_id).next_phase_id !== null) fail("PLAN_FINAL_PHASE_HAS_NEXT");
  for (const phase of plan.phases) {
    if (phase.phase_id !== plan.final_phase_id && phase.next_phase_id === null) fail("NONFINAL_PHASE_WITHOUT_NEXT");
    if (phase.next_phase_id === null) continue;
    const target = phases.get(phase.next_phase_id);
    if (!target) fail("PHASE_NEXT_UNKNOWN");
    if (target.ordinal <= phase.ordinal) fail("PHASE_NEXT_NOT_FORWARD");
  }

  const routeIds = new Set();
  const routeKeys = new Set();
  let previousRouteId = null;
  for (const route of plan.routes) {
    exactKeys(route, ["route_id", "from_phase_id", "reason_code", "action", "to_phase_id", "max_uses"], "ROUTE");
    id(route.route_id, "ROUTE_ID");
    if (routeIds.has(route.route_id)) fail("ROUTE_ID_DUPLICATE");
    if (previousRouteId !== null && ordinalCompare(route.route_id, previousRouteId) <= 0) fail("ROUTES_UNSORTED");
    previousRouteId = route.route_id;
    routeIds.add(route.route_id);
    if (!phases.has(route.from_phase_id)) fail("ROUTE_FROM_UNKNOWN");
    if (!ROUTE_REASONS.has(route.reason_code)) fail("ROUTE_REASON");
    if (!ACTIONS.has(route.action)) fail("ROUTE_ACTION");
    if (route.max_uses !== 1) fail("ROUTE_MAX_USES");
    const routeKey = `${route.from_phase_id}\u0000${route.reason_code}`;
    if (routeKeys.has(routeKey)) fail("ROUTE_AMBIGUOUS");
    routeKeys.add(routeKey);

    if (route.action === "EVACUATE") {
      if (route.to_phase_id !== null) fail("EVACUATE_TARGET");
      continue;
    }
    id(route.to_phase_id, "ROUTE_TO_ID");
    const source = phases.get(route.from_phase_id);
    const target = phases.get(route.to_phase_id);
    if (!target) fail("ROUTE_TO_UNKNOWN");
    if (target.ordinal <= source.ordinal) fail("ROUTE_NOT_FORWARD");
    if (route.action === "REPAIR" && !REPAIR_REASONS.has(route.reason_code)) fail("REPAIR_REASON_UNSAFE");
    if (route.action === "TRANSFER" && !TRANSFER_REASONS.has(route.reason_code)) fail("TRANSFER_REASON_UNSAFE");
    if (route.action === "REPAIR" &&
        target.contract_hash === source.contract_hash &&
        JSON.stringify(target.requirement_ids) === JSON.stringify(source.requirement_ids) &&
        target.worker_profile === source.worker_profile &&
        target.platform_id === source.platform_id &&
        target.transfer_level === source.transfer_level) {
      fail("REPAIR_WITHOUT_MATERIAL_CHANGE");
    }
    if (route.action === "TRANSFER" && target.worker_profile === source.worker_profile && target.platform_id === source.platform_id) {
      fail("TRANSFER_WITHOUT_CHANGE");
    }
    if (route.reason_code === "CONTEXT_OMISSION") {
      const sourceLevel = TRANSFER_LEVELS.indexOf(source.transfer_level);
      const targetLevel = TRANSFER_LEVELS.indexOf(target.transfer_level);
      if (targetLevel < sourceLevel) fail("CONTEXT_ROUTE_SHRINKS_TRANSFER");
    }
  }
  if (plan.max_fuse_uses > plan.routes.length) fail("PLAN_MAX_FUSE_USES_EXCEEDS_ROUTES");
  return { phases };
}

function derivedClassification(evaluation) {
  const statuses = evaluation.check_results.map((row) => row.status);
  if (statuses.every((status) => status === "PASS")) return "NONE";
  if (statuses.includes("ERROR")) return "TRANSPORT_FAILURE";
  if (statuses.includes("UNKNOWN")) return "OBSERVATION_GAP";
  return evaluation.classification;
}

function derivedVerificationStatus(evaluation) {
  const statuses = evaluation.check_results.map((row) => row.status);
  if (statuses.every((status) => status === "PASS")) return "PASS";
  if (statuses.includes("ERROR")) return "ERROR";
  if (statuses.includes("UNKNOWN")) return "UNKNOWN";
  return "FAIL";
}

function validateReceipt(receipt, plan, phases) {
  exactKeys(receipt, [
    "schema_version", "sequence", "previous_receipt_hash", "plan_hash", "phase_id",
    "attempt_id", "worker_id", "worker_profile", "worker_status", "platform_id", "transfer_level",
    "input_artifact_hash", "output_artifact_hash", "contract_hash", "provider_attempt_hash",
    "fuse_context_hash", "evaluation", "usage", "receipt_hash",
  ], "RECEIPT");
  if (receipt.schema_version !== "phase-receipt.v1") fail("RECEIPT_SCHEMA");
  positiveInteger(receipt.sequence, "RECEIPT_SEQUENCE");
  hashOr(receipt.previous_receipt_hash, "ROOT", "RECEIPT_PREVIOUS_HASH");
  hash(receipt.plan_hash, "RECEIPT_PLAN_HASH");
  if (receipt.plan_hash !== digestPlan(plan)) fail("RECEIPT_PLAN_MISMATCH");
  id(receipt.phase_id, "RECEIPT_PHASE_ID");
  const phase = phases.get(receipt.phase_id);
  if (!phase) fail("RECEIPT_PHASE_UNKNOWN");
  id(receipt.attempt_id, "RECEIPT_ATTEMPT_ID");
  id(receipt.worker_id, "RECEIPT_WORKER_ID");
  id(receipt.worker_profile, "RECEIPT_WORKER_PROFILE");
  if (!WORKER_STATUSES.has(receipt.worker_status)) fail("RECEIPT_WORKER_STATUS");
  id(receipt.platform_id, "RECEIPT_PLATFORM_ID");
  if (!TRANSFER_LEVELS.includes(receipt.transfer_level)) fail("RECEIPT_TRANSFER_LEVEL");
  hash(receipt.input_artifact_hash, "RECEIPT_INPUT_ARTIFACT_HASH");
  hashOr(receipt.output_artifact_hash, "UNKNOWN", "RECEIPT_OUTPUT_ARTIFACT_HASH");
  hash(receipt.contract_hash, "RECEIPT_CONTRACT_HASH");
  hash(receipt.provider_attempt_hash, "RECEIPT_PROVIDER_ATTEMPT_HASH");
  hashOr(receipt.fuse_context_hash, "NONE", "RECEIPT_FUSE_CONTEXT_HASH");
  hash(receipt.receipt_hash, "RECEIPT_HASH");
  if (receipt.receipt_hash !== receiptDigest(receipt)) fail("RECEIPT_HASH_MISMATCH");

  exactKeys(receipt.evaluation, ["classification", "verification_status", "check_results", "fix_log_hash"], "EVALUATION");
  if (!CLASSIFICATIONS.has(receipt.evaluation.classification)) fail("EVALUATION_CLASSIFICATION");
  if (!VERIFICATION_STATUSES.has(receipt.evaluation.verification_status)) fail("EVALUATION_VERIFICATION_STATUS");
  if (!Array.isArray(receipt.evaluation.check_results)) fail("EVALUATION_CHECK_RESULTS");
  const seenRequirements = new Set();
  for (const row of receipt.evaluation.check_results) {
    exactKeys(row, ["requirement_id", "status", "evidence_hash"], "CHECK_RESULT");
    id(row.requirement_id, "CHECK_REQUIREMENT_ID");
    if (!phase.requirement_ids.includes(row.requirement_id)) fail("CHECK_REQUIREMENT_UNMAPPED");
    if (seenRequirements.has(row.requirement_id)) fail("CHECK_REQUIREMENT_DUPLICATE");
    seenRequirements.add(row.requirement_id);
    if (!CHECK_STATUSES.has(row.status)) fail("CHECK_STATUS");
    hash(row.evidence_hash, "CHECK_EVIDENCE_HASH");
  }
  if (JSON.stringify([...seenRequirements].sort()) !== JSON.stringify(phase.requirement_ids)) fail("CHECK_REQUIREMENT_COVERAGE");
  hashOr(receipt.evaluation.fix_log_hash, "NONE", "EVALUATION_FIX_LOG_HASH");
  const derived = derivedClassification(receipt.evaluation);
  const verificationStatus = derivedVerificationStatus(receipt.evaluation);
  if (receipt.evaluation.verification_status !== verificationStatus) fail("VERIFICATION_STATUS_MISMATCH");
  if (verificationStatus === "FAIL" && !OBSERVED_FAILURE_CLASSIFICATIONS.has(receipt.evaluation.classification)) {
    fail("FAILED_CHECK_CLASSIFICATION_MISSING");
  }
  if (derived === "NONE") {
    if (receipt.evaluation.classification !== "NONE") fail("PASS_CLASSIFICATION_MISMATCH");
    if (receipt.worker_status !== "PASS") fail("WORKER_DID_NOT_REPORT_PASS");
    if (receipt.evaluation.fix_log_hash !== "NONE") fail("PASS_HAS_FIX_LOG");
    if (receipt.output_artifact_hash === "UNKNOWN") fail("PASS_OUTPUT_UNKNOWN");
  } else {
    if (receipt.evaluation.fix_log_hash === "NONE") fail("NONPASS_FIX_LOG_MISSING");
    if (derived === "TRANSPORT_FAILURE" && receipt.evaluation.classification !== "TRANSPORT_FAILURE") fail("ERROR_CLASSIFICATION_MISMATCH");
    if (derived === "OBSERVATION_GAP" && receipt.evaluation.classification !== "OBSERVATION_GAP") fail("UNKNOWN_CLASSIFICATION_MISMATCH");
    if (!receipt.evaluation.check_results.some((row) => row.status !== "PASS")) fail("NONPASS_WITHOUT_NONPASS_CHECK");
    if (!["TRANSPORT_FAILURE", "OBSERVATION_GAP"].includes(derived) && receipt.output_artifact_hash === "UNKNOWN") {
      fail("OBSERVED_FAILURE_OUTPUT_UNKNOWN");
    }
  }

  exactKeys(receipt.usage, ["input_tokens", "cached_input_tokens", "output_tokens", "elapsed_ms", "cost_microusd"], "USAGE");
  for (const [key, value] of Object.entries(receipt.usage)) telemetryValue(value, `USAGE_${key.toUpperCase()}`);
  if (receipt.usage.cached_input_tokens !== "UNKNOWN" &&
      receipt.usage.input_tokens !== "UNKNOWN" &&
      receipt.usage.cached_input_tokens > receipt.usage.input_tokens) {
    fail("USAGE_CACHE_EXCEEDS_INPUT");
  }
  return { phase, derived };
}

export function fuseDecisionDigest(planHash, receipt, fromPhaseId, reasonCode, route) {
  return digestObject({
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

function invalidReport(code) {
  return [{
    schema_version: "fuse-report.v1",
    validation: { status: "INVALID", error_code: code },
    plan: null,
    stream: null,
    feedback: [],
    usage: null,
    claim_ceiling: "Invalid input authorizes no transition.",
  }, 2];
}

export function reduceFuseInput(input) {
  try {
    exactKeys(input, ["schema_version", "plan", "approval_binding", "receipts"], "INPUT");
    if (input.schema_version !== "fuse-gate-input.v1") fail("INPUT_SCHEMA");
    const { phases } = validatePlan(input.plan);
    const planHash = digestPlan(input.plan);
    exactKeys(input.approval_binding, ["plan_hash", "card_hash", "approval_event_hash", "observation"], "APPROVAL_BINDING");
    hash(input.approval_binding.plan_hash, "APPROVAL_PLAN_HASH");
    hash(input.approval_binding.card_hash, "APPROVAL_CARD_HASH");
    hash(input.approval_binding.approval_event_hash, "APPROVAL_EVENT_HASH");
    if (input.approval_binding.observation !== "DIRECT_HOST_OBSERVATION_DECLARED") fail("APPROVAL_OBSERVATION");
    if (input.approval_binding.plan_hash !== planHash) fail("APPROVAL_PLAN_MISMATCH");
    if (input.approval_binding.card_hash !== input.plan.card_hash) fail("APPROVAL_CARD_MISMATCH");
    if (!Array.isArray(input.receipts) || input.receipts.length > input.plan.phases.length) fail("RECEIPTS_COUNT");

    const phaseReceipts = new Set();
    const attemptIds = new Set();
    const providerAttemptHashes = new Set();
    let previousReceiptHash = "ROOT";
    for (let index = 0; index < input.receipts.length; index += 1) {
      const receipt = input.receipts[index];
      validateReceipt(receipt, input.plan, phases);
      if (receipt.sequence !== index + 1) fail("RECEIPT_SEQUENCE_GAP");
      if (receipt.previous_receipt_hash !== previousReceiptHash) fail("RECEIPT_CHAIN_MISMATCH");
      if (phaseReceipts.has(receipt.phase_id)) fail("HIDDEN_RETRY_PHASE_REPEATED");
      if (attemptIds.has(receipt.attempt_id)) fail("ATTEMPT_ID_REUSED");
      if (providerAttemptHashes.has(receipt.provider_attempt_hash)) fail("PROVIDER_ATTEMPT_REUSED");
      phaseReceipts.add(receipt.phase_id);
      attemptIds.add(receipt.attempt_id);
      providerAttemptHashes.add(receipt.provider_attempt_hash);
      previousReceiptHash = receipt.receipt_hash;
    }

    let expectedPhaseId = input.plan.initial_phase_id;
    let lastAdmissibleArtifactHash = input.plan.initial_artifact_hash;
    let expectedFuseContextHash = "NONE";
    let terminal = false;
    let state = "READY";
    let action = "START";
    let routeId = "NONE";
    let reasonCode = "NONE";
    let holdCode = "NONE";
    let candidateArtifactHash = "NONE";
    let latestDecisionHash = "NONE";
    let fuseUses = 0;
    let platformTransfers = 0;
    let deliveryEligible = false;
    const routeUsage = new Map();
    const processedPhases = new Set();
    const feedback = [];
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
      if (terminal) fail("RECEIPT_AFTER_TERMINAL");
      const { phase, derived } = validateReceipt(receipt, input.plan, phases);
      if (receipt.worker_profile !== phase.worker_profile) fail("RECEIPT_PROFILE_MISMATCH");
      if (receipt.platform_id !== phase.platform_id) fail("RECEIPT_PLATFORM_MISMATCH");
      if (receipt.transfer_level !== phase.transfer_level) fail("RECEIPT_TRANSFER_LEVEL_MISMATCH");
      if (receipt.contract_hash !== phase.contract_hash) fail("RECEIPT_CONTRACT_MISMATCH");
      if (receipt.input_artifact_hash !== lastAdmissibleArtifactHash) fail("RECEIPT_INPUT_NOT_LAST_ADMISSIBLE");
      if (receipt.fuse_context_hash !== expectedFuseContextHash) fail("FUSE_CONTEXT_MISMATCH");
      processedPhases.add(receipt.phase_id);
      for (const key of ["input_tokens", "cached_input_tokens", "output_tokens", "elapsed_ms", "cost_microusd"]) {
        usage[key] = addTelemetry(usage[key], receipt.usage[key]);
      }
      if (Object.values(receipt.usage).includes("UNKNOWN")) usage.telemetry_status = "UNKNOWN";

      const phaseMismatch = receipt.phase_id !== expectedPhaseId;
      if (phaseMismatch && derived === "NONE") fail("PHASE_MISMATCH_WITHOUT_FIX_LOG");
      const effectiveReason = phaseMismatch && !STRICT_STOP_CLASSIFICATIONS.has(derived) ? "PHASE_MISMATCH" : derived;
      candidateArtifactHash = receipt.output_artifact_hash;
      if (effectiveReason === "NONE") {
        lastAdmissibleArtifactHash = receipt.output_artifact_hash;
        reasonCode = "NONE";
        routeId = "NONE";
        holdCode = "NONE";
        latestDecisionHash = "NONE";
        if (receipt.phase_id === input.plan.final_phase_id) {
          state = "DELIVERABLE";
          action = "VERIFY_FOR_ACCEPTANCE";
          deliveryEligible = true;
          usage.delivery_units = 1;
          terminal = true;
          expectedPhaseId = null;
          expectedFuseContextHash = "NONE";
        } else {
          if (phase.next_phase_id === null) fail("PASS_WITHOUT_NEXT_PHASE");
          if (processedPhases.has(phase.next_phase_id)) {
            holdCode = "NEXT_PHASE_ALREADY_ATTEMPTED";
            expectedPhaseId = null;
            state = "HOLD_NEUTRAL";
            action = "HOLD";
            terminal = true;
            expectedFuseContextHash = "NONE";
          } else {
            expectedPhaseId = phase.next_phase_id;
            state = "ADVANCE_READY";
            action = "ADVANCE";
            expectedFuseContextHash = "NONE";
          }
        }
        continue;
      }

      const routeFrom = phaseMismatch ? expectedPhaseId : receipt.phase_id;
      const declaredRoute = input.plan.routes.find((candidate) => candidate.from_phase_id === routeFrom && candidate.reason_code === effectiveReason);
      let route = declaredRoute;
      holdCode = "NONE";
      if (!route) {
        holdCode = "UNDECLARED_ROUTE";
      } else if (fuseUses >= input.plan.max_fuse_uses) {
        holdCode = "FUSE_LIMIT_EXHAUSTED";
        route = null;
      } else if ((routeUsage.get(route.route_id) ?? 0) >= route.max_uses) {
        holdCode = "ROUTE_LIMIT_EXHAUSTED";
        route = null;
      } else if (route.action !== "EVACUATE" && processedPhases.has(route.to_phase_id)) {
        holdCode = "ROUTE_TARGET_ALREADY_ATTEMPTED";
        route = null;
      } else if (route.action === "TRANSFER") {
        const source = phases.get(routeFrom);
        const target = phases.get(route.to_phase_id);
        const changesPlatform = target.worker_profile !== source.worker_profile || target.platform_id !== source.platform_id;
        if (changesPlatform && platformTransfers >= input.plan.max_platform_transfers) {
          holdCode = "PLATFORM_TRANSFER_LIMIT_EXHAUSTED";
          route = null;
        }
      }
      reasonCode = effectiveReason;
      routeId = route?.route_id ?? "NONE";
      latestDecisionHash = fuseDecisionDigest(planHash, receipt, routeFrom, effectiveReason, route);
      const feedbackRecord = {
        sequence: receipt.sequence,
        observed_phase_ref: opaqueRef("phase", planHash, receipt.phase_id),
        expected_phase_ref: opaqueRef("phase", planHash, routeFrom),
        receipt_hash: receipt.receipt_hash,
        candidate_artifact_hash: receipt.output_artifact_hash,
        fix_log_hash: receipt.evaluation.fix_log_hash,
        reason_code: effectiveReason,
        route_ref: opaqueRef("route", planHash, routeId),
        hold_code: holdCode,
        fuse_decision_hash: latestDecisionHash,
      };
      feedback.push(feedbackRecord);
      if (!route) {
        state = "HOLD_NEUTRAL";
        action = "HOLD";
        terminal = true;
        expectedPhaseId = null;
        expectedFuseContextHash = "NONE";
        continue;
      }
      fuseUses += 1;
      const used = (routeUsage.get(route.route_id) ?? 0) + 1;
      routeUsage.set(route.route_id, used);
      if (route.action === "EVACUATE") {
        state = "EVACUATED";
        action = "EVACUATE";
        terminal = true;
        expectedPhaseId = null;
        expectedFuseContextHash = "NONE";
        continue;
      }
      const target = phases.get(route.to_phase_id);
      const source = phases.get(routeFrom);
      if (route.action === "TRANSFER" && (target.worker_profile !== source.worker_profile || target.platform_id !== source.platform_id)) {
        platformTransfers += 1;
      }
      expectedPhaseId = route.to_phase_id;
      state = "FUSE_OPEN";
      action = route.action;
      expectedFuseContextHash = latestDecisionHash;
    }

    usage.efficiency_eligible = deliveryEligible && usage.telemetry_status === "COMPLETE";

    return [{
      schema_version: "fuse-report.v1",
      validation: { status: "VALID", error_code: null },
      plan: {
        plan_hash: planHash,
        card_hash: input.plan.card_hash,
        policy_hash: input.plan.policy_hash,
        source_freeze_hash: input.plan.source_freeze_hash,
        claim_ceiling_hash: digestObject(input.plan.claim_ceiling),
      },
      stream: {
        state,
        action,
        expected_phase_ref: opaqueRef("phase", planHash, expectedPhaseId),
        last_receipt_hash: previousReceiptHash,
        last_admissible_artifact_hash: lastAdmissibleArtifactHash,
        candidate_artifact_hash: candidateArtifactHash,
        reason_code: reasonCode,
        hold_code: holdCode,
        route_ref: opaqueRef("route", planHash, routeId),
        fuse_decision_hash: latestDecisionHash,
        fuse_uses: fuseUses,
        platform_transfers: platformTransfers,
        delivery_eligible: deliveryEligible,
      },
      feedback,
      usage,
      claim_ceiling: "Local deterministic phase routing only. Caller-supplied plan text and identifiers are withheld.",
    }, 0];
  } catch (error) {
    return invalidReport(error instanceof FuseError ? error.code : `UNEXPECTED_${error.message}`);
  }
}

function main() {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write("Usage: node fuse-gate.mjs <input.json>\n");
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(readFileSync(path, "utf8"));
  const [report, exitCode] = reduceFuseInput(input);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
