// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { digestPlan, fuseDecisionDigest, receiptDigest } from "../fuse-gate.mjs";

export function fixtureHash(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function phase(phaseId, ordinal, profile, platform, level, next) {
  return {
    phase_id: phaseId,
    ordinal,
    contract_hash: fixtureHash(`contract:${phaseId}`),
    requirement_ids: ["REQ-A", "REQ-B"],
    worker_profile: profile,
    platform_id: platform,
    transfer_level: level,
    next_phase_id: next,
  };
}

export function basePlan() {
  return {
    schema_version: "fuse-plan.v1",
    plan_id: "fixture-plan",
    card_hash: fixtureHash("card"),
    policy_hash: fixtureHash("policy"),
    source_freeze_hash: fixtureHash("source-freeze"),
    approval_mode: "EXACT_UPFRONT",
    initial_artifact_hash: fixtureHash("initial-artifact"),
    initial_phase_id: "P0",
    final_phase_id: "P2",
    max_fuse_uses: 2,
    max_platform_transfers: 2,
    worker_profiles: ["worker-basic", "worker-deep", "worker-repair"],
    phases: [
      phase("P0", 0, "worker-basic", "local-a", "CARD", "P1"),
      phase("P1", 1, "worker-repair", "local-a", "EXPANDED", "P2"),
      phase("P2", 2, "worker-deep", "local-b", "FULL_CONTEXT", null),
    ],
    routes: [
      { route_id: "R01", from_phase_id: "P0", reason_code: "CONTEXT_OMISSION", action: "TRANSFER", to_phase_id: "P1", max_uses: 1 },
      { route_id: "R02", from_phase_id: "P0", reason_code: "CONTRACT_DEFECT", action: "EVACUATE", to_phase_id: null, max_uses: 1 },
      { route_id: "R03", from_phase_id: "P0", reason_code: "EXECUTION_DEFECT", action: "REPAIR", to_phase_id: "P1", max_uses: 1 },
      { route_id: "R04", from_phase_id: "P0", reason_code: "OBSERVATION_GAP", action: "EVACUATE", to_phase_id: null, max_uses: 1 },
      { route_id: "R05", from_phase_id: "P0", reason_code: "PHASE_MISMATCH", action: "REPAIR", to_phase_id: "P2", max_uses: 1 },
      { route_id: "R06", from_phase_id: "P1", reason_code: "CAPABILITY_MISMATCH", action: "TRANSFER", to_phase_id: "P2", max_uses: 1 },
      { route_id: "R07", from_phase_id: "P1", reason_code: "EXECUTION_DEFECT", action: "REPAIR", to_phase_id: "P2", max_uses: 1 },
      { route_id: "R08", from_phase_id: "P1", reason_code: "OBSERVATION_GAP", action: "EVACUATE", to_phase_id: null, max_uses: 1 },
      { route_id: "R09", from_phase_id: "P2", reason_code: "SAFETY_HOLD", action: "EVACUATE", to_phase_id: null, max_uses: 1 },
    ],
    claim_ceiling: "Local deterministic phase routing only. No model quality, security isolation, or savings claim.",
  };
}

function check(requirementId, status, label) {
  return { requirement_id: requirementId, status, evidence_hash: fixtureHash(`evidence:${label}:${requirementId}`) };
}

export function makeReceipt({ plan, sequence, previous = "ROOT", phaseId, input, output, classification = "NONE", statuses = ["PASS", "PASS"], fuse = "NONE", attempt = null, cost = 1000, workerStatus = null }) {
  const current = plan.phases.find((item) => item.phase_id === phaseId);
  const verificationStatus = statuses.every((status) => status === "PASS") ? "PASS" : statuses.includes("ERROR") ? "ERROR" : statuses.includes("UNKNOWN") ? "UNKNOWN" : "FAIL";
  const receipt = {
    schema_version: "phase-receipt.v1",
    sequence,
    previous_receipt_hash: previous,
    plan_hash: digestPlan(plan),
    phase_id: phaseId,
    attempt_id: attempt ?? `attempt-${sequence}`,
    worker_id: `worker-${sequence}`,
    worker_profile: current.worker_profile,
    worker_status: workerStatus ?? (classification === "NONE" ? "PASS" : ["OBSERVATION_GAP", "TRANSPORT_FAILURE"].includes(classification) ? "UNKNOWN" : "FAIL"),
    platform_id: current.platform_id,
    transfer_level: current.transfer_level,
    input_artifact_hash: input,
    output_artifact_hash: output,
    contract_hash: current.contract_hash,
    provider_attempt_hash: fixtureHash(`provider-attempt:${sequence}`),
    fuse_context_hash: fuse,
    evaluation: {
      classification,
      verification_status: verificationStatus,
      check_results: [
        check("REQ-A", statuses[0], `${sequence}:a`),
        check("REQ-B", statuses[1], `${sequence}:b`),
      ],
      fix_log_hash: classification === "NONE" ? "NONE" : fixtureHash(`fix-log:${sequence}`),
    },
    usage: {
      input_tokens: 100 + sequence,
      cached_input_tokens: 10,
      output_tokens: 20,
      elapsed_ms: 500,
      cost_microusd: cost,
    },
    receipt_hash: "",
  };
  receipt.receipt_hash = receiptDigest(receipt);
  return receipt;
}

function inputFor(plan, receipts = []) {
  return {
    schema_version: "fuse-gate-input.v1",
    plan,
    approval_binding: {
      plan_hash: digestPlan(plan),
      card_hash: plan.card_hash,
      approval_event_hash: fixtureHash("approval-event"),
      observation: "DIRECT_HOST_OBSERVATION_DECLARED",
    },
    receipts,
  };
}

function passChain(plan = basePlan()) {
  const a0 = fixtureHash("artifact:p0-pass");
  const a1 = fixtureHash("artifact:p1-pass");
  const a2 = fixtureHash("artifact:p2-pass");
  const r0 = makeReceipt({ plan, sequence: 1, phaseId: "P0", input: plan.initial_artifact_hash, output: a0 });
  const r1 = makeReceipt({ plan, sequence: 2, previous: r0.receipt_hash, phaseId: "P1", input: a0, output: a1 });
  const r2 = makeReceipt({ plan, sequence: 3, previous: r1.receipt_hash, phaseId: "P2", input: a1, output: a2 });
  return inputFor(plan, [r0, r1, r2]);
}

function repairChain() {
  const plan = basePlan();
  const bad = fixtureHash("artifact:p0-bad");
  const fixed = fixtureHash("artifact:p1-fixed");
  const delivered = fixtureHash("artifact:p2-delivered");
  const r0 = makeReceipt({ plan, sequence: 1, phaseId: "P0", input: plan.initial_artifact_hash, output: bad, classification: "EXECUTION_DEFECT", statuses: ["PASS", "FAIL"], cost: 2000 });
  const route = plan.routes.find((item) => item.route_id === "R03");
  const fuse = fuseDecisionDigest(digestPlan(plan), r0, "P0", "EXECUTION_DEFECT", route);
  const r1 = makeReceipt({ plan, sequence: 2, previous: r0.receipt_hash, phaseId: "P1", input: plan.initial_artifact_hash, output: fixed, fuse, cost: 3000 });
  const r2 = makeReceipt({ plan, sequence: 3, previous: r1.receipt_hash, phaseId: "P2", input: fixed, output: delivered, cost: 4000 });
  return inputFor(plan, [r0, r1, r2]);
}

function transferChain() {
  const plan = basePlan();
  const a0 = fixtureHash("artifact:transfer-p0");
  const bad = fixtureHash("artifact:transfer-p1-bad");
  const delivered = fixtureHash("artifact:transfer-final");
  const r0 = makeReceipt({ plan, sequence: 1, phaseId: "P0", input: plan.initial_artifact_hash, output: a0 });
  const r1 = makeReceipt({ plan, sequence: 2, previous: r0.receipt_hash, phaseId: "P1", input: a0, output: bad, classification: "CAPABILITY_MISMATCH", statuses: ["FAIL", "PASS"] });
  const route = plan.routes.find((item) => item.route_id === "R06");
  const fuse = fuseDecisionDigest(digestPlan(plan), r1, "P1", "CAPABILITY_MISMATCH", route);
  const r2 = makeReceipt({ plan, sequence: 3, previous: r1.receipt_hash, phaseId: "P2", input: a0, output: delivered, fuse });
  return inputFor(plan, [r0, r1, r2]);
}

function contextExpansionChain() {
  const plan = basePlan();
  const incomplete = fixtureHash("artifact:omitted-context");
  const expanded = fixtureHash("artifact:expanded-context-result");
  const delivered = fixtureHash("artifact:expanded-final");
  const r0 = makeReceipt({ plan, sequence: 1, phaseId: "P0", input: plan.initial_artifact_hash, output: incomplete, classification: "CONTEXT_OMISSION", statuses: ["PASS", "FAIL"] });
  const route = plan.routes.find((item) => item.route_id === "R01");
  const fuse = fuseDecisionDigest(digestPlan(plan), r0, "P0", "CONTEXT_OMISSION", route);
  const r1 = makeReceipt({ plan, sequence: 2, previous: r0.receipt_hash, phaseId: "P1", input: plan.initial_artifact_hash, output: expanded, fuse });
  const r2 = makeReceipt({ plan, sequence: 3, previous: r1.receipt_hash, phaseId: "P2", input: expanded, output: delivered });
  return inputFor(plan, [r0, r1, r2]);
}

function evacuation(classification = "CONTRACT_DEFECT", status = "FAIL") {
  const plan = basePlan();
  const output = classification === "OBSERVATION_GAP" ? "UNKNOWN" : fixtureHash(`artifact:${classification}`);
  const receipt = makeReceipt({ plan, sequence: 1, phaseId: "P0", input: plan.initial_artifact_hash, output, classification, statuses: ["PASS", status] });
  return inputFor(plan, [receipt]);
}

function neutralHold() {
  const plan = basePlan();
  const receipt = makeReceipt({ plan, sequence: 1, phaseId: "P0", input: plan.initial_artifact_hash, output: fixtureHash("authority-candidate"), classification: "AUTHORITY_GAP", statuses: ["FAIL", "PASS"] });
  return inputFor(plan, [receipt]);
}

function phaseMismatchRecovery() {
  const plan = basePlan();
  const misplaced = fixtureHash("artifact:misplaced-phase");
  const delivered = fixtureHash("artifact:phase-realigned");
  const r0 = makeReceipt({ plan, sequence: 1, phaseId: "P1", input: plan.initial_artifact_hash, output: misplaced, classification: "EXECUTION_DEFECT", statuses: ["PASS", "FAIL"] });
  const route = plan.routes.find((item) => item.route_id === "R05");
  const fuse = fuseDecisionDigest(digestPlan(plan), r0, "P0", "PHASE_MISMATCH", route);
  const r1 = makeReceipt({ plan, sequence: 2, previous: r0.receipt_hash, phaseId: "P2", input: plan.initial_artifact_hash, output: delivered, fuse });
  return inputFor(plan, [r0, r1]);
}

function wrongPhaseStrictStop(classification) {
  const plan = basePlan();
  const receipt = makeReceipt({
    plan,
    sequence: 1,
    phaseId: "P1",
    input: plan.initial_artifact_hash,
    output: fixtureHash(`artifact:wrong-phase-${classification}`),
    classification,
    statuses: ["FAIL", "PASS"],
  });
  return inputFor(plan, [receipt]);
}

function refreshPlanBindings(input) {
  input.approval_binding.plan_hash = digestPlan(input.plan);
  input.approval_binding.card_hash = input.plan.card_hash;
  let prior = "ROOT";
  input.receipts.forEach((receipt, index) => {
    receipt.sequence = index + 1;
    receipt.previous_receipt_hash = prior;
    receipt.plan_hash = digestPlan(input.plan);
    const phaseDef = input.plan.phases.find((phaseItem) => phaseItem.phase_id === receipt.phase_id);
    if (phaseDef) {
      receipt.contract_hash = phaseDef.contract_hash;
      receipt.worker_profile = phaseDef.worker_profile;
      receipt.platform_id = phaseDef.platform_id;
      receipt.transfer_level = phaseDef.transfer_level;
    }
    receipt.receipt_hash = receiptDigest(receipt);
    prior = receipt.receipt_hash;
  });
  return input;
}

function semanticIdentifierChain() {
  const input = repairChain();
  const phaseIds = new Map([
    ["P0", "PRIVATE_CLIENT_INTAKE"],
    ["P1", "PRIVATE_CLIENT_REPAIR"],
    ["P2", "PRIVATE_CLIENT_DELIVERY"],
  ]);
  input.plan.plan_id = "PRIVATE_CLIENT_PLAN";
  input.plan.claim_ceiling = "PRIVATE_CLIENT_CLAIM_TEXT";
  input.plan.initial_phase_id = phaseIds.get(input.plan.initial_phase_id);
  input.plan.final_phase_id = phaseIds.get(input.plan.final_phase_id);
  for (const phaseItem of input.plan.phases) {
    phaseItem.phase_id = phaseIds.get(phaseItem.phase_id);
    if (phaseItem.next_phase_id !== null) phaseItem.next_phase_id = phaseIds.get(phaseItem.next_phase_id);
  }
  for (const route of input.plan.routes) {
    route.from_phase_id = phaseIds.get(route.from_phase_id);
    if (route.to_phase_id !== null) route.to_phase_id = phaseIds.get(route.to_phase_id);
    if (route.route_id === "R03") route.route_id = "PRIVATE_CLIENT_ROUTE";
  }
  input.plan.routes.sort((left, right) => left.route_id === right.route_id ? 0 : left.route_id < right.route_id ? -1 : 1);
  for (const receipt of input.receipts) receipt.phase_id = phaseIds.get(receipt.phase_id);
  refreshPlanBindings(input);
  const first = input.receipts[0];
  const route = input.plan.routes.find((item) => item.route_id === "PRIVATE_CLIENT_ROUTE");
  input.receipts[1].fuse_context_hash = fuseDecisionDigest(digestPlan(input.plan), first, phaseIds.get("P0"), "EXECUTION_DEFECT", route);
  return refreshPlanBindings(input);
}

function consumedNextPhaseStream() {
  const plan = basePlan();
  const route = plan.routes.find((item) => item.route_id === "R05");
  route.to_phase_id = "P1";
  const misplaced = makeReceipt({
    plan,
    sequence: 1,
    phaseId: "P2",
    input: plan.initial_artifact_hash,
    output: fixtureHash("artifact:consumed-final-first"),
    classification: "EXECUTION_DEFECT",
    statuses: ["FAIL", "PASS"],
  });
  const fuse = fuseDecisionDigest(digestPlan(plan), misplaced, "P0", "PHASE_MISMATCH", route);
  const repair = makeReceipt({
    plan,
    sequence: 2,
    previous: misplaced.receipt_hash,
    phaseId: "P1",
    input: plan.initial_artifact_hash,
    output: fixtureHash("artifact:repair-after-consumed-final"),
    fuse,
  });
  return inputFor(plan, [misplaced, repair]);
}

function fuseLimitHold() {
  const input = repairChain();
  input.plan.max_fuse_uses = 0;
  input.receipts = input.receipts.slice(0, 1);
  return refreshPlanBindings(input);
}

function platformLimitHold() {
  const input = transferChain();
  input.plan.max_platform_transfers = 0;
  input.receipts = input.receipts.slice(0, 2);
  return refreshPlanBindings(input);
}

function consumedRouteTargetHold() {
  const input = phaseMismatchRecovery();
  input.plan.routes.find((item) => item.route_id === "R05").to_phase_id = "P1";
  input.receipts = input.receipts.slice(0, 1);
  return refreshPlanBindings(input);
}

function unknownTelemetryDelivery() {
  const input = passChain();
  input.receipts[0].usage.input_tokens = "UNKNOWN";
  input.receipts[0].usage.cost_microusd = "UNKNOWN";
  return refreshPlanBindings(input);
}

function mixedOrdinalRoutes() {
  const plan = basePlan();
  const routeIds = ["A-1", "A.1", "A_1", "B0", "Z9", "a-1", "a.1", "a_1", "z9"];
  plan.routes.forEach((route, index) => {
    route.route_id = routeIds[index];
  });
  return inputFor(plan);
}

function clone(value) {
  return structuredClone(value);
}

function invalid(caseId, errorCode, source, mutate, refresh = true) {
  const input = clone(source);
  mutate(input);
  if (refresh) refreshPlanBindings(input);
  return { case_id: caseId, expected_valid: false, expected_error: errorCode, input };
}

export function buildFuseCases() {
  const straight = passChain();
  const repaired = repairChain();
  const transferred = transferChain();
  const expanded = contextExpansionChain();
  const evacuated = evacuation();
  const unknownEvacuated = evacuation("OBSERVATION_GAP", "UNKNOWN");
  const held = neutralHold();
  const realigned = phaseMismatchRecovery();
  const semanticIds = semanticIdentifierChain();
  const consumedNext = consumedNextPhaseStream();
  const exhaustedFuse = fuseLimitHold();
  const exhaustedPlatform = platformLimitHold();
  const consumedRoute = consumedRouteTargetHold();
  const unknownTelemetry = unknownTelemetryDelivery();
  const ordinalRoutes = mixedOrdinalRoutes();
  const wrongPhaseSafety = wrongPhaseStrictStop("SAFETY_HOLD");
  const wrongPhaseAuthority = wrongPhaseStrictStop("AUTHORITY_GAP");
  const wrongPhaseContract = wrongPhaseStrictStop("CONTRACT_DEFECT");

  const cases = [
    { case_id: "ready-empty", expected_valid: true, expected: { state: "READY", action: "START", delivery: false, feedback: 0, cost: 0 }, input: inputFor(basePlan()) },
    { case_id: "straight-delivery", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 0, cost: 3000 }, input: straight },
    { case_id: "repair-delivery", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 1, cost: 9000 }, input: repaired },
    { case_id: "transfer-delivery", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 1, cost: 3000 }, input: transferred },
    { case_id: "context-expansion-delivery", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 1, cost: 3000 }, input: expanded },
    { case_id: "contract-evacuation", expected_valid: true, expected: { state: "EVACUATED", action: "EVACUATE", delivery: false, feedback: 1, cost: 1000 }, input: evacuated },
    { case_id: "observation-gap-evacuation", expected_valid: true, expected: { state: "EVACUATED", action: "EVACUATE", delivery: false, feedback: 1, cost: 1000 }, input: unknownEvacuated },
    { case_id: "unrouted-authority-hold", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", delivery: false, feedback: 1, cost: 1000 }, input: held },
    { case_id: "phase-mismatch-realigned", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 1, cost: 2000 }, input: realigned },
    { case_id: "semantic-identifiers-withheld", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 1, cost: 9000 }, input: semanticIds },
    { case_id: "fuse-limit-holds-with-evidence", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", hold: "FUSE_LIMIT_EXHAUSTED", delivery: false, feedback: 1, cost: 2000 }, input: exhaustedFuse },
    { case_id: "platform-limit-holds-with-evidence", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", hold: "PLATFORM_TRANSFER_LIMIT_EXHAUSTED", delivery: false, feedback: 1, cost: 2000 }, input: exhaustedPlatform },
    { case_id: "consumed-route-target-holds-with-evidence", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", hold: "ROUTE_TARGET_ALREADY_ATTEMPTED", delivery: false, feedback: 1, cost: 1000 }, input: consumedRoute },
    { case_id: "consumed-normal-next-holds-with-evidence", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", hold: "NEXT_PHASE_ALREADY_ATTEMPTED", delivery: false, feedback: 1, cost: 2000 }, input: consumedNext },
    { case_id: "unknown-telemetry-delivery", expected_valid: true, expected: { state: "DELIVERABLE", action: "VERIFY_FOR_ACCEPTANCE", delivery: true, feedback: 0, cost: "UNKNOWN", telemetry: "UNKNOWN", efficiency: false }, input: unknownTelemetry },
    { case_id: "mixed-ordinal-route-order", expected_valid: true, expected: { state: "READY", action: "START", delivery: false, feedback: 0, cost: 0 }, input: ordinalRoutes },
    { case_id: "wrong-phase-safety-cannot-repair", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", reason: "SAFETY_HOLD", hold: "UNDECLARED_ROUTE", delivery: false, feedback: 1, cost: 1000 }, input: wrongPhaseSafety },
    { case_id: "wrong-phase-authority-cannot-repair", expected_valid: true, expected: { state: "HOLD_NEUTRAL", action: "HOLD", reason: "AUTHORITY_GAP", hold: "UNDECLARED_ROUTE", delivery: false, feedback: 1, cost: 1000 }, input: wrongPhaseAuthority },
    { case_id: "wrong-phase-contract-evacuates", expected_valid: true, expected: { state: "EVACUATED", action: "EVACUATE", reason: "CONTRACT_DEFECT", delivery: false, feedback: 1, cost: 1000 }, input: wrongPhaseContract },
  ];

  cases.push(
    invalid("context-route-shrinks", "CONTEXT_ROUTE_SHRINKS_TRANSFER", straight, (input) => {
      input.plan.phases[0].transfer_level = "FULL_CONTEXT";
      input.plan.phases[1].transfer_level = "CARD";
    }),
    invalid("unmapped-evaluator-requirement", "CHECK_REQUIREMENT_UNMAPPED", straight, (input) => {
      input.receipts[0].evaluation.check_results[0].requirement_id = "REQ-Z";
    }),
    invalid("missing-evaluator-requirement", "CHECK_REQUIREMENT_COVERAGE", straight, (input) => {
      input.receipts[0].evaluation.check_results.pop();
    }),
    invalid("hidden-phase-retry", "HIDDEN_RETRY_PHASE_REPEATED", repaired, (input) => {
      const repeated = clone(input.receipts[0]);
      repeated.attempt_id = "attempt-extra";
      input.receipts = [input.receipts[0], repeated];
    }),
    invalid("attempt-id-reuse", "ATTEMPT_ID_REUSED", straight, (input) => {
      input.receipts[1].attempt_id = input.receipts[0].attempt_id;
    }),
    invalid("provider-attempt-reuse", "PROVIDER_ATTEMPT_REUSED", straight, (input) => {
      input.receipts[1].provider_attempt_hash = input.receipts[0].provider_attempt_hash;
    }),
    invalid("tampered-receipt", "RECEIPT_HASH_MISMATCH", straight, (input) => {
      input.receipts[0].usage.output_tokens += 1;
    }, false),
    invalid("broken-chain", "RECEIPT_CHAIN_MISMATCH", straight, (input) => {
      input.receipts[1].previous_receipt_hash = fixtureHash("wrong-prior");
      input.receipts[1].receipt_hash = receiptDigest(input.receipts[1]);
      input.receipts[2].previous_receipt_hash = input.receipts[1].receipt_hash;
      input.receipts[2].receipt_hash = receiptDigest(input.receipts[2]);
    }, false),
    invalid("wrong-worker-profile", "RECEIPT_PROFILE_MISMATCH", straight, (input) => {
      input.receipts[0].worker_profile = "worker-deep";
      input.receipts[0].receipt_hash = receiptDigest(input.receipts[0]);
      input.receipts[1].previous_receipt_hash = input.receipts[0].receipt_hash;
      input.receipts[1].receipt_hash = receiptDigest(input.receipts[1]);
      input.receipts[2].previous_receipt_hash = input.receipts[1].receipt_hash;
      input.receipts[2].receipt_hash = receiptDigest(input.receipts[2]);
    }, false),
    invalid("wrong-platform", "RECEIPT_PLATFORM_MISMATCH", straight, (input) => {
      input.receipts[0].platform_id = "local-b";
      input.receipts[0].receipt_hash = receiptDigest(input.receipts[0]);
      input.receipts[1].previous_receipt_hash = input.receipts[0].receipt_hash;
      input.receipts[1].receipt_hash = receiptDigest(input.receipts[1]);
      input.receipts[2].previous_receipt_hash = input.receipts[1].receipt_hash;
      input.receipts[2].receipt_hash = receiptDigest(input.receipts[2]);
    }, false),
    invalid("missing-fuse-context", "FUSE_CONTEXT_MISMATCH", repaired, (input) => {
      input.receipts[1].fuse_context_hash = "NONE";
    }),
    invalid("unexpected-fuse-context", "FUSE_CONTEXT_MISMATCH", straight, (input) => {
      input.receipts[1].fuse_context_hash = fixtureHash("unexpected-fuse");
    }),
    invalid("receipt-after-evacuation", "RECEIPT_AFTER_TERMINAL", evacuated, (input) => {
      const next = makeReceipt({ plan: input.plan, sequence: 2, previous: input.receipts[0].receipt_hash, phaseId: "P1", input: input.plan.initial_artifact_hash, output: fixtureHash("late-output"), fuse: "NONE" });
      input.receipts.push(next);
    }),
    invalid("backward-route", "ROUTE_NOT_FORWARD", straight, (input) => {
      const route = input.plan.routes.find((item) => item.route_id === "R07");
      route.to_phase_id = "P0";
    }),
    invalid("ambiguous-route", "ROUTE_AMBIGUOUS", straight, (input) => {
      input.plan.routes.push({ route_id: "R10", from_phase_id: "P0", reason_code: "EXECUTION_DEFECT", action: "REPAIR", to_phase_id: "P1", max_uses: 1 });
      input.plan.routes.sort((a, b) => a.route_id === b.route_id ? 0 : a.route_id < b.route_id ? -1 : 1);
    }),
    invalid("unsafe-contract-repair", "REPAIR_REASON_UNSAFE", straight, (input) => {
      const route = input.plan.routes.find((item) => item.route_id === "R02");
      route.action = "REPAIR";
      route.to_phase_id = "P1";
    }),
    invalid("noop-repair-hidden-retry", "REPAIR_WITHOUT_MATERIAL_CHANGE", straight, (input) => {
      input.plan.routes = input.plan.routes.filter((route) => route.route_id !== "R01");
      const source = input.plan.phases[0];
      const target = input.plan.phases[1];
      target.contract_hash = source.contract_hash;
      target.requirement_ids = [...source.requirement_ids];
      target.worker_profile = source.worker_profile;
      target.platform_id = source.platform_id;
      target.transfer_level = source.transfer_level;
    }),
    invalid("noop-transfer", "TRANSFER_WITHOUT_CHANGE", straight, (input) => {
      input.plan.phases[1].worker_profile = input.plan.phases[0].worker_profile;
      input.plan.phases[1].platform_id = input.plan.phases[0].platform_id;
    }),
    invalid("cache-exceeds-input", "USAGE_CACHE_EXCEEDS_INPUT", straight, (input) => {
      input.receipts[0].usage.cached_input_tokens = input.receipts[0].usage.input_tokens + 1;
    }),
    invalid("approval-plan-replay", "APPROVAL_PLAN_MISMATCH", straight, (input) => {
      input.approval_binding.plan_hash = fixtureHash("wrong-approved-plan");
    }, false),
    invalid("observed-failure-output-missing", "OBSERVED_FAILURE_OUTPUT_UNKNOWN", repaired, (input) => {
      input.receipts[0].output_artifact_hash = "UNKNOWN";
    }),
    invalid("pass-has-fix-log", "PASS_HAS_FIX_LOG", straight, (input) => {
      input.receipts[0].evaluation.fix_log_hash = fixtureHash("fake-fix-log");
    }),
    invalid("worker-fail-cannot-deliver", "WORKER_DID_NOT_REPORT_PASS", straight, (input) => {
      input.receipts[0].worker_status = "FAIL";
    }),
    invalid("failed-check-classification-missing", "FAILED_CHECK_CLASSIFICATION_MISSING", repaired, (input) => {
      input.receipts[0].evaluation.classification = "NONE";
    }),
    invalid("verification-status-mismatch", "VERIFICATION_STATUS_MISMATCH", straight, (input) => {
      input.receipts[0].evaluation.verification_status = "FAIL";
    }),
    invalid("error-status-wrong-class", "ERROR_CLASSIFICATION_MISMATCH", repaired, (input) => {
      input.receipts[0].evaluation.check_results[1].status = "ERROR";
      input.receipts[0].evaluation.verification_status = "ERROR";
    }),
    invalid("nonfinal-dead-end", "NONFINAL_PHASE_WITHOUT_NEXT", straight, (input) => {
      input.plan.phases[1].next_phase_id = null;
    }),
    invalid("mixed-route-order-unsorted", "ROUTES_UNSORTED", ordinalRoutes, (input) => {
      [input.plan.routes[0], input.plan.routes[1]] = [input.plan.routes[1], input.plan.routes[0]];
    }),
    invalid("invalid-unicode", "INVALID_UNICODE", straight, (input) => {
      input.plan.claim_ceiling = "bad\ud800text";
    }, false),
  );

  return cases;
}
