#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const NONEMPTY_LIST_FIELDS = [
  "advisor_findings",
  "constraints",
  "allowed_actions",
  "forbidden_actions",
  "required_outputs",
  "acceptance_checks",
  "stop_conditions",
];
const CARD_KEYS = new Set([
  "schema_version", "card_id", "card_version", "objective", "task_class",
  "source_refs", "facts", "advisor_findings", "constraints", "unknowns",
  "allowed_actions", "forbidden_actions", "required_outputs",
  "acceptance_checks", "stop_conditions", "routing", "claim_ceiling",
]);
const ROUTING_KEYS = new Set([
  "phase_id", "from_profile", "transition", "state_in_binding",
  "worker_profile", "reasoning_effort", "max_attempts",
  "max_concurrent_workers", "context_turns",
]);
const POLICY_KEYS = new Set([
  "schema_version", "policy_id", "stream_id", "phase", "human_actor_ids",
  "advisor_actor_ids", "advisor_profile", "worker_profiles",
  "profile_ranks",
  "max_worker_attempts", "max_concurrent_workers", "max_context_turns",
  "max_card_bytes",
]);
const EVENT_BASE_KEYS = new Set([
  "schema_version", "stream_id", "sequence", "previous_hash", "event_type",
  "actor_type", "actor_id", "statement", "event_hash",
]);
const EVENT_OPTIONAL_KEYS = new Set([
  "policy_hash", "card_id", "card_hash", "worker_profile", "worker_id",
  "result_ref", "verification_ref", "verification_status",
]);
const EVENT_TYPES = new Set([
  "SYSTEM_ACTIVATED", "CARD_PROPOSED", "HUMAN_APPROVED", "HUMAN_REJECTED",
  "WORK_ASSIGNED", "WORK_RESULT_RECORDED", "VERIFICATION_RECORDED",
  "HUMAN_ACCEPTED", "HUMAN_REQUESTED_CORRECTION", "CLOSED",
]);

class DomainError extends Error {}

function validateDomain(value, locator = "$") {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new DomainError(`FLOAT_UNSUPPORTED:${locator}`);
    if (!Number.isSafeInteger(value) || Math.abs(value) > SAFE_INTEGER) {
      throw new DomainError(`UNSAFE_INTEGER:${locator}`);
    }
    return;
  }
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          throw new DomainError(`INVALID_UNICODE:${locator}`);
        }
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new DomainError(`INVALID_UNICODE:${locator}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateDomain(item, `${locator}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!KEY_PATTERN.test(key)) throw new DomainError(`INVALID_OBJECT_KEY:${locator}`);
      validateDomain(item, `${locator}.${key}`);
    }
    return;
  }
  throw new DomainError(`UNSUPPORTED_TYPE:${locator}`);
}

export function canonicalJson(value) {
  validateDomain(value);
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function digestObject(value) {
  return `sha256:${createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex")}`;
}

export function eventDigest(event) {
  return digestObject(Object.fromEntries(Object.entries(event).filter(([key]) => key !== "event_hash")));
}

function sameKeys(object, expected) {
  if (object === null || typeof object !== "object" || Array.isArray(object)) return false;
  const keys = Object.keys(object);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value, nonempty) {
  return Array.isArray(value) && (!nonempty || value.length > 0) && value.every(nonemptyString);
}

function addError(errors, code, locator) {
  errors.push({ code, locator });
}

function validatePolicy(policy, errors) {
  if (!sameKeys(policy, POLICY_KEYS)) {
    addError(errors, policy && typeof policy === "object" ? "INVALID_POLICY_FIELDS" : "INVALID_POLICY", "policy");
    return false;
  }
  let valid = true;
  const checks = [
    [policy.schema_version === "routing-policy.v2", "INVALID_POLICY_VERSION"],
    [nonemptyString(policy.policy_id), "INVALID_POLICY_ID"],
    [nonemptyString(policy.stream_id), "INVALID_STREAM_ID"],
    [["PREPARE_ONLY", "ACTIVE"].includes(policy.phase), "INVALID_POLICY_PHASE"],
    [stringList(policy.human_actor_ids, true), "INVALID_HUMAN_ACTORS"],
    [stringList(policy.advisor_actor_ids, true), "INVALID_ADVISOR_ACTORS"],
    [nonemptyString(policy.advisor_profile), "INVALID_ADVISOR_PROFILE"],
    [stringList(policy.worker_profiles, true), "INVALID_WORKER_PROFILES"],
  ];
  for (const [condition, code] of checks) {
    if (!condition) {
      addError(errors, code, "policy");
      valid = false;
    }
  }
  for (const [field, minimum, maximum] of [
    ["max_worker_attempts", 1, 1],
    ["max_concurrent_workers", 1, 10],
    ["max_context_turns", 0, 20],
    ["max_card_bytes", 512, 1_000_000],
  ]) {
    const value = policy[field];
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      addError(errors, "INVALID_POLICY_LIMIT", `policy.${field}`);
      valid = false;
    }
  }
  if (valid) {
    const profiles = [policy.advisor_profile, ...policy.worker_profiles];
    if (!policy.profile_ranks || typeof policy.profile_ranks !== "object" || Array.isArray(policy.profile_ranks) ||
        !sameKeys(policy.profile_ranks, new Set(profiles)) ||
        profiles.some((profile) => !Number.isSafeInteger(policy.profile_ranks[profile]) || policy.profile_ranks[profile] < 1) ||
        new Set(profiles.map((profile) => policy.profile_ranks[profile])).size !== profiles.length) {
      addError(errors, "INVALID_PROFILE_RANKS", "policy.profile_ranks");
      valid = false;
    }
    if (policy.worker_profiles.includes(policy.advisor_profile)) {
      addError(errors, "ADVISOR_IS_WORKER_PROFILE", "policy.worker_profiles");
      valid = false;
    }
    if (new Set(policy.human_actor_ids).size !== policy.human_actor_ids.length) {
      addError(errors, "DUPLICATE_HUMAN_ACTOR", "policy.human_actor_ids");
      valid = false;
    }
    if (new Set(policy.advisor_actor_ids).size !== policy.advisor_actor_ids.length) {
      addError(errors, "DUPLICATE_ADVISOR_ACTOR", "policy.advisor_actor_ids");
      valid = false;
    }
    if (policy.human_actor_ids.some((actor) => policy.advisor_actor_ids.includes(actor))) {
      addError(errors, "ACTOR_ROLE_COLLISION", "policy");
      valid = false;
    }
    if (new Set(policy.worker_profiles).size !== policy.worker_profiles.length) {
      addError(errors, "DUPLICATE_WORKER_PROFILE", "policy.worker_profiles");
      valid = false;
    }
  }
  return valid;
}

function validateCard(card, policy, errors, index) {
  const locator = `cards[${index}]`;
  if (!sameKeys(card, CARD_KEYS)) {
    addError(errors, "INVALID_CARD_FIELDS", locator);
    return false;
  }
  let valid = true;
  for (const field of ["card_id", "objective", "claim_ceiling"]) {
    if (!nonemptyString(card[field])) {
      addError(errors, "INVALID_CARD_TEXT", `${locator}.${field}`);
      valid = false;
    }
  }
  if (card.schema_version !== "context-card.v2") {
    addError(errors, "INVALID_CARD_VERSION", locator);
    valid = false;
  }
  if (!Number.isInteger(card.card_version) || card.card_version < 1) {
    addError(errors, "INVALID_CARD_REVISION", `${locator}.card_version`);
    valid = false;
  }
  if (!["ADVISORY_ONLY", "EXECUTION_REQUIRED"].includes(card.task_class)) {
    addError(errors, "INVALID_TASK_CLASS", `${locator}.task_class`);
    valid = false;
  }
  for (const field of ["facts", "unknowns"]) {
    if (!stringList(card[field], false)) {
      addError(errors, "INVALID_CARD_LIST", `${locator}.${field}`);
      valid = false;
    }
  }
  for (const field of NONEMPTY_LIST_FIELDS) {
    if (!stringList(card[field], true)) {
      addError(errors, "INVALID_CARD_LIST", `${locator}.${field}`);
      valid = false;
    }
  }
  if (!Array.isArray(card.source_refs)) {
    addError(errors, "INVALID_SOURCE_REFS", `${locator}.source_refs`);
    valid = false;
  } else {
    card.source_refs.forEach((source, sourceIndex) => {
      const sourceLocator = `${locator}.source_refs[${sourceIndex}]`;
      if (!sameKeys(source, new Set(["source_id", "locator", "digest", "access"])) ||
          !["source_id", "locator", "digest", "access"].every((key) => nonemptyString(source[key]))) {
        addError(errors, "INVALID_SOURCE_REF", sourceLocator);
        valid = false;
      }
    });
  }
  const routing = card.routing;
  if (!sameKeys(routing, ROUTING_KEYS)) {
    addError(errors, "INVALID_ROUTING_FIELDS", `${locator}.routing`);
    valid = false;
  } else {
    const worker = routing.worker_profile;
    if (!nonemptyString(routing.phase_id)) {
      addError(errors, "INVALID_MODEL_PHASE_ID", `${locator}.routing.phase_id`);
      valid = false;
    }
    if (![policy.advisor_profile, ...policy.worker_profiles].includes(routing.from_profile)) {
      addError(errors, "UNKNOWN_FROM_MODEL_PROFILE", `${locator}.routing.from_profile`);
      valid = false;
    }
    if (!["UPGRADE", "DOWNGRADE", "STABLE"].includes(routing.transition)) {
      addError(errors, "INVALID_MODEL_TRANSITION", `${locator}.routing.transition`);
      valid = false;
    }
    if (routing.state_in_binding !== "PREVIOUS_PHASE_OUTPUT") {
      addError(errors, "INVALID_STATE_BINDING", `${locator}.routing.state_in_binding`);
      valid = false;
    }
    if ([policy.advisor_profile, ...policy.worker_profiles].includes(routing.from_profile) && policy.worker_profiles.includes(worker)) {
      const fromRank = policy.profile_ranks[routing.from_profile];
      const toRank = policy.profile_ranks[worker];
      const expectedTransition = toRank > fromRank ? "UPGRADE" : toRank < fromRank ? "DOWNGRADE" : "STABLE";
      if (routing.transition !== expectedTransition) {
        addError(errors, "MODEL_TRANSITION_RANK_MISMATCH", `${locator}.routing.transition`);
        valid = false;
      }
    }
    if (!policy.worker_profiles.includes(worker)) {
      addError(errors, "UNKNOWN_MODEL_PROFILE", `${locator}.routing`);
      valid = false;
    }
    if (worker === policy.advisor_profile) {
      addError(errors, "ADVISOR_ASSIGNED_AS_WORKER", `${locator}.routing`);
      valid = false;
    }
    if (!["none", "low", "medium", "high", "xhigh", "max"].includes(routing.reasoning_effort)) {
      addError(errors, "INVALID_REASONING_EFFORT", `${locator}.routing.reasoning_effort`);
      valid = false;
    }
    for (const [field, minimum, maximum] of [
      ["max_attempts", 1, policy.max_worker_attempts],
      ["max_concurrent_workers", 1, policy.max_concurrent_workers],
      ["context_turns", 0, policy.max_context_turns],
    ]) {
      const value = routing[field];
      if (!Number.isInteger(value) || value < minimum || value > maximum) {
        addError(errors, "CARD_LIMIT_EXCEEDED", `${locator}.routing.${field}`);
        valid = false;
      }
    }
  }
  try {
    if (Buffer.byteLength(canonicalJson(card), "utf8") > policy.max_card_bytes) {
      addError(errors, "CARD_TOO_LARGE", locator);
      valid = false;
    }
  } catch (error) {
    addError(errors, String(error.message).split(":", 1)[0], locator);
    valid = false;
  }
  return valid;
}

function report({ errors, policyHash = null, activated = false, eventCount = 0, tipHash = null, cardSummaries = [], releasedCards = [] }) {
  const valid = errors.length === 0;
  return {
    authority: {
      identity: "UNAUTHENTICATED_DECLARATIONS",
      persistence: "UNTRUSTED_CALLER_SUPPLIED_STREAM",
      use: "OFFLINE_CONSISTENCY_AND_ELIGIBILITY_ONLY",
    },
    card_summaries: cardSummaries,
    claim_ceiling: "LOCAL_SYNTHETIC_ROUTING_CONFORMANCE_ONLY",
    released_cards: releasedCards,
    schema_version: "routing-report.v1",
    status: valid ? "PASS" : "FAIL",
    stream: { activated, event_count: eventCount, policy_hash: policyHash, tip_hash: tipHash },
    validation: { errors, status: valid ? "VALID" : "INVALID" },
  };
}

export function reduceInput(payload) {
  const errors = [];
  if (!sameKeys(payload, new Set(["schema_version", "policy", "cards", "events"]))) {
    addError(errors, "INVALID_INPUT_FIELDS", "$");
    return [report({ errors }), 2];
  }
  if (payload.schema_version !== "approved-routing-input.v1") {
    addError(errors, "INVALID_INPUT_VERSION", "schema_version");
  }
  const policy = payload.policy;
  if (!validatePolicy(policy, errors)) return [report({ errors }), 2];

  let policyHash;
  try {
    policyHash = digestObject(policy);
  } catch (error) {
    addError(errors, String(error.message).split(":", 1)[0], "policy");
    return [report({ errors }), 2];
  }

  const cards = payload.cards;
  if (!Array.isArray(cards)) {
    addError(errors, "INVALID_CARDS", "cards");
    return [report({ errors, policyHash }), 2];
  }
  const cardMap = new Map();
  const cardHashes = new Map();
  cards.forEach((card, index) => {
    if (!validateCard(card, policy, errors, index)) return;
    if (cardMap.has(card.card_id)) {
      addError(errors, "DUPLICATE_CARD_ID", `cards[${index}].card_id`);
      return;
    }
    cardMap.set(card.card_id, card);
    cardHashes.set(card.card_id, digestObject(card));
  });

  const events = payload.events;
  if (!Array.isArray(events)) {
    addError(errors, "INVALID_EVENTS", "events");
    return [report({ errors, policyHash }), 2];
  }
  let previousHash = null;
  const seenEventIds = new Set();
  events.forEach((event, index) => {
    const locator = `events[${index}]`;
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      addError(errors, "INVALID_EVENT", locator);
      return;
    }
    const keys = Object.keys(event);
    if (![...EVENT_BASE_KEYS].every((key) => keys.includes(key)) || keys.some((key) => !EVENT_BASE_KEYS.has(key) && !EVENT_OPTIONAL_KEYS.has(key))) {
      addError(errors, "INVALID_EVENT_FIELDS", locator);
      return;
    }
    if (event.schema_version !== "routing-event.v1") addError(errors, "INVALID_EVENT_VERSION", locator);
    if (event.stream_id !== policy.stream_id) addError(errors, "STREAM_MISMATCH", locator);
    if (event.sequence !== index + 1) addError(errors, "SEQUENCE_MISMATCH", locator);
    if (event.previous_hash !== previousHash) addError(errors, "PREVIOUS_HASH_MISMATCH", locator);
    if (!EVENT_TYPES.has(event.event_type)) addError(errors, "UNKNOWN_EVENT_TYPE", locator);
    if (![event.actor_type, event.actor_id, event.statement].every(nonemptyString)) addError(errors, "INVALID_EVENT_TEXT", locator);
    if (typeof event.event_hash !== "string" || !HASH_PATTERN.test(event.event_hash)) {
      addError(errors, "INVALID_EVENT_HASH", locator);
    } else {
      try {
        if (event.event_hash !== eventDigest(event)) addError(errors, "EVENT_HASH_MISMATCH", locator);
      } catch (error) {
        addError(errors, String(error.message).split(":", 1)[0], locator);
      }
    }
    const eventId = `${event.stream_id}:${event.sequence}`;
    if (seenEventIds.has(eventId)) addError(errors, "DUPLICATE_EVENT_ID", locator);
    seenEventIds.add(eventId);
    previousHash = typeof event.event_hash === "string" ? event.event_hash : null;
  });

  if (errors.length > 0) {
    const cardSummaries = [...cardMap.keys()].sort().map((cardId) => ({
      card_hash: cardHashes.get(cardId), card_id: cardId,
      release_status: "WITHHELD_INVALID", state: "INVALID",
    }));
    return [report({ errors, policyHash, eventCount: events.length, tipHash: previousHash, cardSummaries }), 2];
  }

  const states = new Map([...cardMap.keys()].map((cardId) => [cardId, "UNSEEN"]));
  const assignedWorkers = new Map();
  const assignedCoordinators = new Map();
  const verificationStatuses = new Map();
  const acceptedCards = new Set();
  let activated = false;

  events.forEach((event, index) => {
    const locator = `events[${index}]`;
    const eventType = event.event_type;
    const actorType = event.actor_type;
    const actorId = event.actor_id;

    if (eventType === "SYSTEM_ACTIVATED") {
      if (actorType !== "HUMAN" || !policy.human_actor_ids.includes(actorId)) addError(errors, "INVALID_ACTIVATION_ACTOR", locator);
      else if (policy.phase !== "ACTIVE") addError(errors, "ACTIVATION_IN_PREPARE_ONLY", locator);
      else if (index !== 0) addError(errors, "ACTIVATION_NOT_GENESIS", locator);
      else if (event.policy_hash !== policyHash) addError(errors, "POLICY_HASH_MISMATCH", locator);
      else if (activated) addError(errors, "DUPLICATE_ACTIVATION", locator);
      else activated = true;
      return;
    }

    if (policy.phase === "ACTIVE" && !activated) {
      addError(errors, "SYSTEM_NOT_ACTIVE", locator);
      return;
    }

    const cardId = event.card_id;
    if (!cardMap.has(cardId)) {
      addError(errors, "UNKNOWN_CARD", locator);
      return;
    }
    if (event.card_hash !== cardHashes.get(cardId)) {
      addError(errors, "CARD_HASH_MISMATCH", locator);
      return;
    }
    const state = states.get(cardId);
    if (eventType === "CARD_PROPOSED") {
      if (actorType !== "ADVISOR" || !policy.advisor_actor_ids.includes(actorId)) addError(errors, "INVALID_ADVISOR_ACTOR", locator);
      else if (state !== "UNSEEN") addError(errors, "INVALID_CARD_TRANSITION", locator);
      else states.set(cardId, "WAITING_APPROVAL");
    } else if (["HUMAN_APPROVED", "HUMAN_REJECTED"].includes(eventType)) {
      if (actorType !== "HUMAN" || !policy.human_actor_ids.includes(actorId)) addError(errors, "INVALID_HUMAN_ACTOR", locator);
      else if (state !== "WAITING_APPROVAL") addError(errors, "INVALID_CARD_TRANSITION", locator);
      else states.set(cardId, eventType === "HUMAN_APPROVED" ? "APPROVED" : "REJECTED");
    } else if (eventType === "WORK_ASSIGNED") {
      const workerId = event.worker_id;
      if (actorType !== "COORDINATOR" || !nonemptyString(actorId) || policy.human_actor_ids.includes(actorId) || policy.advisor_actor_ids.includes(actorId)) addError(errors, "INVALID_COORDINATOR_ACTOR", locator);
      else if (!activated || policy.phase !== "ACTIVE") addError(errors, "SYSTEM_NOT_ACTIVE", locator);
      else if (state !== "APPROVED") addError(errors, "CARD_NOT_ASSIGNABLE", locator);
      else if (cardMap.get(cardId).task_class !== "EXECUTION_REQUIRED") addError(errors, "TASK_NOT_EXECUTABLE", locator);
      else if (event.worker_profile !== cardMap.get(cardId).routing.worker_profile) addError(errors, "WORKER_PROFILE_MISMATCH", locator);
      else if (!nonemptyString(workerId) || workerId === actorId || policy.human_actor_ids.includes(workerId) || policy.advisor_actor_ids.includes(workerId)) addError(errors, "INVALID_WORKER_ID", locator);
      else {
        assignedWorkers.set(cardId, workerId);
        assignedCoordinators.set(cardId, actorId);
        states.set(cardId, "ASSIGNED");
      }
    } else if (eventType === "WORK_RESULT_RECORDED") {
      if (actorType !== "WORKER" || actorId !== assignedWorkers.get(cardId)) addError(errors, "INVALID_WORKER_ACTOR", locator);
      else if (state !== "ASSIGNED") addError(errors, "INVALID_CARD_TRANSITION", locator);
      else if (!nonemptyString(event.result_ref)) addError(errors, "MISSING_RESULT_REF", locator);
      else states.set(cardId, "RESULT_RECORDED");
    } else if (eventType === "VERIFICATION_RECORDED") {
      const verification = event.verification_status;
      if (actorType !== "VERIFIER" || !nonemptyString(actorId) || actorId === assignedWorkers.get(cardId) || actorId === assignedCoordinators.get(cardId) || policy.human_actor_ids.includes(actorId) || policy.advisor_actor_ids.includes(actorId)) addError(errors, "INVALID_VERIFIER_ACTOR", locator);
      else if (state !== "RESULT_RECORDED") addError(errors, "INVALID_CARD_TRANSITION", locator);
      else if (!["PASS", "FAIL", "UNKNOWN"].includes(verification)) addError(errors, "INVALID_VERIFICATION_STATUS", locator);
      else if (!nonemptyString(event.verification_ref)) addError(errors, "MISSING_VERIFICATION_REF", locator);
      else {
        verificationStatuses.set(cardId, verification);
        states.set(cardId, verification === "PASS" ? "VERIFIED" : "CORRECTION_REQUIRED");
      }
    } else if (eventType === "HUMAN_ACCEPTED") {
      if (actorType !== "HUMAN" || !policy.human_actor_ids.includes(actorId)) addError(errors, "INVALID_HUMAN_ACTOR", locator);
      else if (state !== "VERIFIED" || verificationStatuses.get(cardId) !== "PASS") addError(errors, "RESULT_NOT_ACCEPTABLE", locator);
      else {
        states.set(cardId, "ACCEPTED");
        acceptedCards.add(cardId);
      }
    } else if (eventType === "HUMAN_REQUESTED_CORRECTION") {
      if (actorType !== "HUMAN" || !policy.human_actor_ids.includes(actorId)) addError(errors, "INVALID_HUMAN_ACTOR", locator);
      else if (!["RESULT_RECORDED", "VERIFIED"].includes(state)) addError(errors, "INVALID_CARD_TRANSITION", locator);
      else states.set(cardId, "CORRECTION_REQUIRED");
    } else if (eventType === "CLOSED") {
      if (actorType !== "COORDINATOR" || !nonemptyString(actorId) || policy.human_actor_ids.includes(actorId) || policy.advisor_actor_ids.includes(actorId) || (assignedCoordinators.has(cardId) && actorId !== assignedCoordinators.get(cardId))) addError(errors, "INVALID_COORDINATOR_ACTOR", locator);
      else if (!["ACCEPTED", "REJECTED"].includes(state)) addError(errors, "INVALID_CARD_TRANSITION", locator);
      else states.set(cardId, "CLOSED");
    }
  });

  if (errors.length > 0) {
    const cardSummaries = [...cardMap.keys()].sort().map((cardId) => ({
      card_hash: cardHashes.get(cardId), card_id: cardId,
      release_status: "WITHHELD_INVALID", state: "INVALID",
    }));
    return [report({ errors, policyHash, activated, eventCount: events.length, tipHash: previousHash, cardSummaries }), 2];
  }

  const cardSummaries = [];
  const releasedCards = [];
  for (const cardId of [...cardMap.keys()].sort()) {
    const state = states.get(cardId);
    let releaseStatus;
    if (policy.phase !== "ACTIVE") releaseStatus = "WITHHELD_PHASE";
    else if (!activated) releaseStatus = "WITHHELD_ACTIVATION";
    else if (state === "APPROVED" && cardMap.get(cardId).task_class === "EXECUTION_REQUIRED") {
      releaseStatus = "RELEASED";
      releasedCards.push({
        card_hash: cardHashes.get(cardId),
        card_id: cardId,
        worker_profile: cardMap.get(cardId).routing.worker_profile,
      });
    } else if (state === "WAITING_APPROVAL") releaseStatus = "WITHHELD_APPROVAL";
    else if (state === "REJECTED") releaseStatus = "WITHHELD_REJECTED";
    else releaseStatus = "NOT_ASSIGNABLE";
    cardSummaries.push({
      accepted: acceptedCards.has(cardId), card_hash: cardHashes.get(cardId), card_id: cardId,
      release_status: releaseStatus, state,
    });
  }
  return [report({ errors: [], policyHash, activated, eventCount: events.length, tipHash: previousHash, cardSummaries, releasedCards }), 0];
}

function main() {
  const inputIndex = process.argv.indexOf("--input");
  let output;
  let exitCode;
  try {
    if (inputIndex < 0 || !process.argv[inputIndex + 1]) throw new Error("INVALID_ARGUMENTS");
    const payload = JSON.parse(readFileSync(process.argv[inputIndex + 1], "utf8"));
    [output, exitCode] = reduceInput(payload);
  } catch (error) {
    output = report({ errors: [{ code: "INVALID_INPUT", locator: error.constructor.name }] });
    exitCode = 2;
  }
  process.stdout.write(`${canonicalJson(output)}\n`);
  process.exitCode = exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
