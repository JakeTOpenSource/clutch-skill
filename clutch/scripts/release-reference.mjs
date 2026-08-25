#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// This is intentionally independent from card-gate.mjs. It projects only the
// load-bearing decision: whether a card may be released, and why not.

const INPUT_FIELDS = ["cards", "events", "policy", "schema_version"];
const POLICY_FIELDS = [
  "advisor_actor_ids", "advisor_profile", "human_actor_ids", "orchestrator_actor_ids", "max_card_bytes",
  "max_concurrent_workers", "max_context_turns", "max_worker_attempts", "phase",
  "implementation_digest", "policy_id", "schema_version", "stream_id", "worker_profiles",
];
const CARD_FIELDS = [
  "acceptance_checks", "advisor_findings", "allowed_actions", "card_id",
  "card_version", "claim_ceiling", "constraints", "facts", "forbidden_actions",
  "objective", "required_outputs", "routing", "schema_version", "source_refs",
  "stop_conditions", "task_class", "unknowns",
];
const ROUTING_FIELDS = [
  "context_turns", "fallback_profile", "max_attempts", "max_concurrent_workers",
  "reasoning_effort", "worker_profile",
];
const REQUIRED_EVENT_FIELDS = [
  "actor_id", "actor_type", "event_hash", "event_type", "previous_hash",
  "schema_version", "sequence", "statement", "stream_id",
];
const OPTIONAL_EVENT_FIELDS = new Set([
  "card_hash", "card_id", "implementation_digest", "policy_hash", "result_ref", "verification_ref",
  "verification_status", "worker_id", "worker_profile", "result_status", "result_receipt_hash",
  "verification_receipt_hash",
]);
const EVENT_TYPES = new Set([
  "SYSTEM_ACTIVATED", "CARD_PROPOSED", "HUMAN_APPROVED", "HUMAN_REJECTED",
  "WORK_ASSIGNED", "WORK_RESULT_RECORDED", "VERIFICATION_RECORDED",
  "HUMAN_ACCEPTED", "HUMAN_REQUESTED_CORRECTION", "CLOSED",
]);
const NONEMPTY_CARD_LISTS = [
  "acceptance_checks", "advisor_findings", "allowed_actions", "constraints",
  "forbidden_actions", "required_outputs", "stop_conditions",
];
const HASH = /^sha256:[a-f0-9]{64}$/;
const OBJECT_KEY = /^[A-Za-z0-9_.-]+$/;

function scalarText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function exactFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function listOfText(value, requireItem = false) {
  return Array.isArray(value) && (!requireItem || value.length > 0) && value.every(scalarText);
}

function encodeCanonical(value, path = "$") {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error(`FLOAT_UNSUPPORTED:${path}`);
    if (!Number.isSafeInteger(value)) throw new Error(`UNSAFE_INTEGER:${path}`);
    return String(value);
  }
  if (typeof value === "string") {
    for (let offset = 0; offset < value.length; offset += 1) {
      const unit = value.charCodeAt(offset);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const following = value.charCodeAt(offset + 1);
        if (following < 0xdc00 || following > 0xdfff) throw new Error(`INVALID_UNICODE:${path}`);
        offset += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        throw new Error(`INVALID_UNICODE:${path}`);
      }
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => encodeCanonical(entry, `${path}[${index}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      if (!OBJECT_KEY.test(key)) throw new Error(`INVALID_OBJECT_KEY:${path}`);
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encodeCanonical(value[key], `${path}.${key}`)}`).join(",")}}`;
  }
  throw new Error(`UNSUPPORTED_TYPE:${path}`);
}

function hashObject(value) {
  const body = Buffer.from(encodeCanonical(value), "utf8");
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function hashEvent(event) {
  const unsigned = {};
  for (const [key, value] of Object.entries(event)) {
    if (key !== "event_hash") unsigned[key] = value;
  }
  return hashObject(unsigned);
}

function result(validation, errorCode, activated, cards, releasedCardHashes) {
  return {
    activated,
    cards,
    error_code: errorCode,
    released_card_hashes: releasedCardHashes,
    schema_version: "routing-reference.v1",
    validation,
  };
}

function invalid(errorCode, activated = false, cardHashes = []) {
  return result(
    "INVALID",
    errorCode,
    activated,
    [...new Set(cardHashes)].sort().map((cardHash) => ({
      card_hash: cardHash,
      release_status: "WITHHELD_INVALID",
      state: "INVALID",
    })),
    [],
  );
}

function firstCardProblem(card, policy) {
  if (!exactFields(card, CARD_FIELDS)) return "INVALID_CARD_FIELDS";
  if (!scalarText(card.card_id) || !scalarText(card.objective) || !scalarText(card.claim_ceiling)) return "INVALID_CARD_TEXT";
  if (card.schema_version !== "context-card.v1") return "INVALID_CARD_VERSION";
  if (!Number.isInteger(card.card_version) || card.card_version < 1) return "INVALID_CARD_REVISION";
  if (!["ADVISORY_ONLY", "EXECUTION_REQUIRED"].includes(card.task_class)) return "INVALID_TASK_CLASS";
  if (!listOfText(card.facts) || !listOfText(card.unknowns)) return "INVALID_CARD_LIST";
  for (const field of NONEMPTY_CARD_LISTS) {
    if (!listOfText(card[field], true)) return "INVALID_CARD_LIST";
  }
  if (!Array.isArray(card.source_refs)) return "INVALID_SOURCE_REFS";
  for (const source of card.source_refs) {
    if (!exactFields(source, ["access", "digest", "locator", "source_id"])) return "INVALID_SOURCE_REF";
    if (![source.access, source.digest, source.locator, source.source_id].every(scalarText)) return "INVALID_SOURCE_REF";
  }
  if (!exactFields(card.routing, ROUTING_FIELDS)) return "INVALID_ROUTING_FIELDS";
  const route = card.routing;
  if (!policy.worker_profiles.includes(route.worker_profile) || !policy.worker_profiles.includes(route.fallback_profile)) {
    return "UNKNOWN_MODEL_PROFILE";
  }
  if (route.worker_profile === policy.advisor_profile || route.fallback_profile === policy.advisor_profile) {
    return "ADVISOR_ASSIGNED_AS_WORKER";
  }
  if (!["none", "low", "medium", "high", "xhigh", "max"].includes(route.reasoning_effort)) {
    return "INVALID_REASONING_EFFORT";
  }
  for (const [value, floor, ceiling] of [
    [route.max_attempts, 1, policy.max_worker_attempts],
    [route.max_concurrent_workers, 1, policy.max_concurrent_workers],
    [route.context_turns, 0, policy.max_context_turns],
  ]) {
    if (!Number.isInteger(value) || value < floor || value > ceiling) return "CARD_LIMIT_EXCEEDED";
  }
  try {
    if (Buffer.byteLength(encodeCanonical(card), "utf8") > policy.max_card_bytes) return "CARD_TOO_LARGE";
  } catch (error) {
    return String(error.message).split(":", 1)[0];
  }
  return null;
}

function firstPolicyProblem(policy) {
  if (!exactFields(policy, POLICY_FIELDS)) return policy && typeof policy === "object" ? "INVALID_POLICY_FIELDS" : "INVALID_POLICY";
  if (policy.schema_version !== "routing-policy.v3") return "INVALID_POLICY_VERSION";
  if (typeof policy.implementation_digest !== "string" || !HASH.test(policy.implementation_digest)) return "INVALID_IMPLEMENTATION_DIGEST";
  if (policy.policy_id !== `clutch-policy-v3@${policy.implementation_digest}`) return "INVALID_POLICY_ID";
  if (!scalarText(policy.stream_id)) return "INVALID_STREAM_ID";
  if (!["PREPARE_ONLY", "ACTIVE"].includes(policy.phase)) return "INVALID_POLICY_PHASE";
  if (!listOfText(policy.human_actor_ids, true)) return "INVALID_HUMAN_ACTORS";
  if (!listOfText(policy.advisor_actor_ids, true)) return "INVALID_ADVISOR_ACTORS";
  if (!listOfText(policy.orchestrator_actor_ids, true)) return "INVALID_ORCHESTRATOR_ACTORS";
  if (!scalarText(policy.advisor_profile)) return "INVALID_ADVISOR_PROFILE";
  if (!listOfText(policy.worker_profiles, true)) return "INVALID_WORKER_PROFILES";
  for (const [value, floor, ceiling] of [
    [policy.max_worker_attempts, 1, 1],
    [policy.max_concurrent_workers, 1, 10],
    [policy.max_context_turns, 0, 20],
    [policy.max_card_bytes, 512, 1_000_000],
  ]) {
    if (!Number.isInteger(value) || value < floor || value > ceiling) return "INVALID_POLICY_LIMIT";
  }
  if (policy.worker_profiles.includes(policy.advisor_profile)) return "ADVISOR_IS_WORKER_PROFILE";
  if (new Set(policy.human_actor_ids).size !== policy.human_actor_ids.length) return "DUPLICATE_HUMAN_ACTOR";
  if (new Set(policy.advisor_actor_ids).size !== policy.advisor_actor_ids.length) return "DUPLICATE_ADVISOR_ACTOR";
  if (new Set(policy.orchestrator_actor_ids).size !== policy.orchestrator_actor_ids.length) return "DUPLICATE_ORCHESTRATOR_ACTOR";
  const controlActors = [...policy.human_actor_ids, ...policy.advisor_actor_ids, ...policy.orchestrator_actor_ids];
  if (new Set(controlActors).size !== controlActors.length) return "ACTOR_ROLE_COLLISION";
  if (new Set(policy.worker_profiles).size !== policy.worker_profiles.length) return "DUPLICATE_WORKER_PROFILE";
  return null;
}

function firstEventShapeProblem(event, policy, index, previousHash, seenIds) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "INVALID_EVENT";
  const keys = Object.keys(event);
  if (!REQUIRED_EVENT_FIELDS.every((key) => keys.includes(key))) return "INVALID_EVENT_FIELDS";
  if (keys.some((key) => !REQUIRED_EVENT_FIELDS.includes(key) && !OPTIONAL_EVENT_FIELDS.has(key))) return "INVALID_EVENT_FIELDS";
  if (event.schema_version !== "routing-event.v1") return "INVALID_EVENT_VERSION";
  if (event.stream_id !== policy.stream_id) return "STREAM_MISMATCH";
  if (event.sequence !== index + 1) return "SEQUENCE_MISMATCH";
  if (event.previous_hash !== previousHash) return "PREVIOUS_HASH_MISMATCH";
  if (!EVENT_TYPES.has(event.event_type)) return "UNKNOWN_EVENT_TYPE";
  if (![event.actor_type, event.actor_id, event.statement].every(scalarText)) return "INVALID_EVENT_TEXT";
  if (typeof event.event_hash !== "string" || !HASH.test(event.event_hash)) return "INVALID_EVENT_HASH";
  try {
    if (event.event_hash !== hashEvent(event)) return "EVENT_HASH_MISMATCH";
  } catch (error) {
    return String(error.message).split(":", 1)[0];
  }
  const identity = `${event.stream_id}:${event.sequence}`;
  if (seenIds.has(identity)) return "DUPLICATE_EVENT_ID";
  seenIds.add(identity);
  return null;
}

export function projectInput(payload) {
  if (!exactFields(payload, INPUT_FIELDS)) return invalid("INVALID_INPUT_FIELDS");
  if (payload.schema_version !== "approved-routing-input.v1") return invalid("INVALID_INPUT_VERSION");

  const policyError = firstPolicyProblem(payload.policy);
  if (policyError) return invalid(policyError);
  const policy = payload.policy;
  let policyHash;
  try {
    policyHash = hashObject(policy);
  } catch (error) {
    return invalid(String(error.message).split(":", 1)[0]);
  }

  if (!Array.isArray(payload.cards)) return invalid("INVALID_CARDS");
  const cards = new Map();
  const cardHashes = new Map();
  for (const card of payload.cards) {
    const cardError = firstCardProblem(card, policy);
    if (cardError) return invalid(cardError);
    if (cards.has(card.card_id)) return invalid("DUPLICATE_CARD_ID", false, [...cardHashes.values()]);
    cards.set(card.card_id, card);
    cardHashes.set(card.card_id, hashObject(card));
  }

  if (!Array.isArray(payload.events)) return invalid("INVALID_EVENTS", false, [...cardHashes.values()]);
  let previousHash = null;
  const seenIds = new Set();
  for (let index = 0; index < payload.events.length; index += 1) {
    const event = payload.events[index];
    const shapeError = firstEventShapeProblem(event, policy, index, previousHash, seenIds);
    if (shapeError) return invalid(shapeError, false, [...cardHashes.values()]);
    previousHash = event.event_hash;
  }

  let activated = false;
  const states = new Map([...cards.keys()].map((id) => [id, "UNSEEN"]));
  const assigned = new Map();
  const coordinators = new Map();
  const verification = new Map();
  const resultStatuses = new Map();

  const stopInvalid = (code) => invalid(code, activated, [...cardHashes.values()]);

  for (let eventIndex = 0; eventIndex < payload.events.length; eventIndex += 1) {
    const event = payload.events[eventIndex];
    if (event.event_type === "SYSTEM_ACTIVATED") {
      if (event.actor_type !== "HUMAN" || !policy.human_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_ACTIVATION_ACTOR");
      if (policy.phase !== "ACTIVE") return stopInvalid("ACTIVATION_IN_PREPARE_ONLY");
      if (eventIndex !== 0) return stopInvalid("ACTIVATION_NOT_GENESIS");
      if (event.implementation_digest !== policy.implementation_digest) return stopInvalid("IMPLEMENTATION_DIGEST_MISMATCH");
      if (event.policy_hash !== policyHash) return stopInvalid("POLICY_HASH_MISMATCH");
      if (activated) return stopInvalid("DUPLICATE_ACTIVATION");
      activated = true;
      continue;
    }

    if (policy.phase === "ACTIVE" && !activated) return stopInvalid("SYSTEM_NOT_ACTIVE");

    if (!cards.has(event.card_id)) return stopInvalid("UNKNOWN_CARD");
    if (event.card_hash !== cardHashes.get(event.card_id)) return stopInvalid("CARD_HASH_MISMATCH");

    const id = event.card_id;
    const state = states.get(id);
    switch (event.event_type) {
      case "CARD_PROPOSED":
        if (event.actor_type !== "ADVISOR" || !policy.advisor_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_ADVISOR_ACTOR");
        if (state !== "UNSEEN") return stopInvalid("INVALID_CARD_TRANSITION");
        states.set(id, "WAITING_APPROVAL");
        break;
      case "HUMAN_APPROVED":
      case "HUMAN_REJECTED":
        if (event.actor_type !== "HUMAN" || !policy.human_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_HUMAN_ACTOR");
        if (state !== "WAITING_APPROVAL") return stopInvalid("INVALID_CARD_TRANSITION");
        states.set(id, event.event_type === "HUMAN_APPROVED" ? "APPROVED" : "REJECTED");
        break;
      case "WORK_ASSIGNED":
        if (event.actor_type !== "COORDINATOR" || !policy.orchestrator_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_COORDINATOR_ACTOR");
        if (!activated || policy.phase !== "ACTIVE") return stopInvalid("SYSTEM_NOT_ACTIVE");
        if (state !== "APPROVED") return stopInvalid("CARD_NOT_ASSIGNABLE");
        if (cards.get(id).task_class !== "EXECUTION_REQUIRED") return stopInvalid("TASK_NOT_EXECUTABLE");
        if (event.worker_profile !== cards.get(id).routing.worker_profile) return stopInvalid("WORKER_PROFILE_MISMATCH");
        if (!scalarText(event.worker_id) || event.worker_id === event.actor_id || policy.human_actor_ids.includes(event.worker_id) || policy.advisor_actor_ids.includes(event.worker_id) || policy.orchestrator_actor_ids.includes(event.worker_id)) {
          return stopInvalid("INVALID_WORKER_ID");
        }
        assigned.set(id, event.worker_id);
        coordinators.set(id, event.actor_id);
        states.set(id, "ASSIGNED");
        break;
      case "WORK_RESULT_RECORDED":
        if (event.actor_type !== "WORKER" || event.actor_id !== assigned.get(id)) return stopInvalid("INVALID_WORKER_ACTOR");
        if (state !== "ASSIGNED") return stopInvalid("INVALID_CARD_TRANSITION");
        if (!scalarText(event.result_ref)) return stopInvalid("MISSING_RESULT_REF");
        if (!["PASS", "FAIL", "STOPPED", "UNKNOWN"].includes(event.result_status)) return stopInvalid("INVALID_RESULT_STATUS");
        if (typeof event.result_receipt_hash !== "string" || !HASH.test(event.result_receipt_hash)) return stopInvalid("MISSING_RESULT_RECEIPT_HASH");
        resultStatuses.set(id, event.result_status);
        states.set(id, "RESULT_RECORDED");
        break;
      case "VERIFICATION_RECORDED":
        if (event.actor_type !== "VERIFIER" || !scalarText(event.actor_id) || event.actor_id === assigned.get(id) || event.actor_id === coordinators.get(id) || policy.human_actor_ids.includes(event.actor_id) || policy.advisor_actor_ids.includes(event.actor_id) || policy.orchestrator_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_VERIFIER_ACTOR");
        if (state !== "RESULT_RECORDED") return stopInvalid("INVALID_CARD_TRANSITION");
        if (!["PASS", "FAIL", "UNKNOWN"].includes(event.verification_status)) return stopInvalid("INVALID_VERIFICATION_STATUS");
        if (!scalarText(event.verification_ref)) return stopInvalid("MISSING_VERIFICATION_REF");
        if (typeof event.verification_receipt_hash !== "string" || !HASH.test(event.verification_receipt_hash)) return stopInvalid("MISSING_VERIFICATION_RECEIPT_HASH");
        if (event.verification_status === "PASS" && resultStatuses.get(id) !== "PASS") return stopInvalid("WORKER_DID_NOT_REPORT_PASS");
        verification.set(id, event.verification_status);
        states.set(id, event.verification_status === "PASS" ? "VERIFIED" : "CORRECTION_REQUIRED");
        break;
      case "HUMAN_ACCEPTED":
        if (event.actor_type !== "HUMAN" || !policy.human_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_HUMAN_ACTOR");
        if (state !== "VERIFIED" || verification.get(id) !== "PASS") return stopInvalid("RESULT_NOT_ACCEPTABLE");
        states.set(id, "ACCEPTED");
        break;
      case "HUMAN_REQUESTED_CORRECTION":
        if (event.actor_type !== "HUMAN" || !policy.human_actor_ids.includes(event.actor_id)) return stopInvalid("INVALID_HUMAN_ACTOR");
        if (!["RESULT_RECORDED", "VERIFIED", "CORRECTION_REQUIRED"].includes(state)) return stopInvalid("INVALID_CARD_TRANSITION");
        states.set(id, "CORRECTION_REQUIRED");
        break;
      case "CLOSED":
        if (event.actor_type !== "COORDINATOR" || !policy.orchestrator_actor_ids.includes(event.actor_id) || (coordinators.has(id) && event.actor_id !== coordinators.get(id))) return stopInvalid("INVALID_COORDINATOR_ACTOR");
        if (!["ACCEPTED", "REJECTED", "CORRECTION_REQUIRED"].includes(state)) return stopInvalid("INVALID_CARD_TRANSITION");
        states.set(id, "CLOSED");
        break;
      default:
        return stopInvalid("UNKNOWN_EVENT_TYPE");
    }
  }

  const summaries = [];
  const released = [];
  for (const id of [...cards.keys()].sort()) {
    const state = states.get(id);
    let releaseStatus = "NOT_ASSIGNABLE";
    if (policy.phase !== "ACTIVE") releaseStatus = "WITHHELD_PHASE";
    else if (!activated) releaseStatus = "WITHHELD_ACTIVATION";
    else if (state === "APPROVED" && cards.get(id).task_class === "EXECUTION_REQUIRED") {
      releaseStatus = "RELEASED";
      released.push(cardHashes.get(id));
    } else if (state === "WAITING_APPROVAL") releaseStatus = "WITHHELD_APPROVAL";
    else if (state === "REJECTED") releaseStatus = "WITHHELD_REJECTED";
    summaries.push({ card_hash: cardHashes.get(id), release_status: releaseStatus, state });
  }
  return result("VALID", null, activated, summaries, released);
}

function main() {
  const marker = process.argv.indexOf("--input");
  try {
    if (marker < 0 || !process.argv[marker + 1]) throw new Error("INVALID_ARGUMENTS");
    const input = JSON.parse(readFileSync(process.argv[marker + 1], "utf8"));
    const projection = projectInput(input);
    process.stdout.write(`${JSON.stringify(projection)}\n`);
    process.exitCode = projection.validation === "VALID" ? 0 : 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(invalid("INVALID_INPUT"))}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
