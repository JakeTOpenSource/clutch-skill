# Clutch context card contract

A context card is an immutable transfer object from the advisor to one bounded worker. Its full canonical JSON is hashed. Human approval binds that exact hash.

## Required fields

| Field | Purpose |
|---|---|
| `schema_version` | Exact card contract version |
| `card_id` and `card_version` | Stable identity and immutable revision |
| `objective` | One plain-language outcome |
| `task_class` | `ADVISORY_ONLY` or `EXECUTION_REQUIRED` |
| `source_refs` | Authorized source IDs, locators, digests when available, and access class |
| `facts` | Explicit facts carried forward with source references |
| `advisor_findings` | Risks, design decisions, and red-team findings |
| `constraints` | Requirements the worker must preserve |
| `unknowns` | Missing or contested information that may not be guessed |
| `allowed_actions` | Exact permitted work |
| `forbidden_actions` | Scope and consequence ceiling |
| `required_outputs` | Deliverables the worker must return |
| `acceptance_checks` | Observable tests, not aesthetic preferences |
| `stop_conditions` | Conditions that end work or return control |
| `routing` | Current phase, prior and next symbolic profiles, transition direction, effort, context turns, attempt limit, and concurrency |
| `claim_ceiling` | What a successful result still does not establish |

## Card example

```json
{
  "schema_version": "context-card.v2",
  "card_id": "card-example-001",
  "card_version": 1,
  "objective": "Add one deterministic parser and its tests.",
  "task_class": "EXECUTION_REQUIRED",
  "source_refs": [
    {
      "source_id": "spec-1",
      "locator": "specs/parser.md",
      "digest": "UNKNOWN",
      "access": "PROJECT_READ"
    }
  ],
  "facts": ["The parser input grammar is defined by spec-1."],
  "advisor_findings": ["Malformed input must fail closed."],
  "constraints": [
    "C1: Do not add dependencies.",
    "C2: Reject malformed input; continue parsing valid input."
  ],
  "unknowns": ["The host has not established whether the target model is available."],
  "allowed_actions": ["Edit parser and test files in the declared project."],
  "forbidden_actions": ["Do not publish, deploy, or change unrelated files."],
  "required_outputs": ["Parser implementation", "Passing negative tests"],
  "acceptance_checks": [
    "C1-CHECK: The dependency manifest is byte-identical.",
    "C2-ALLOW: A valid fixture parses.",
    "C2-DENY: A malformed fixture is rejected."
  ],
  "stop_conditions": ["Stop after one attempt, a failed check, or any scope conflict."],
  "routing": {
    "phase_id": "phase-parser-implementation",
    "from_profile": "advisor",
    "worker_profile": "worker_rank_1",
    "transition": "DOWNGRADE",
    "state_in_binding": "PREVIOUS_PHASE_OUTPUT",
    "reasoning_effort": "low",
    "max_attempts": 1,
    "max_concurrent_workers": 1,
    "context_turns": 0
  },
  "claim_ceiling": "Passing fixtures establish only bounded local conformance."
}
```

## Validation rules

- Object keys use the portable canonical domain defined by the checker.
- Integers stay within the portable JSON safe range. Floating-point values are rejected.
- Required text and list fields cannot be empty.
- `task_class` must be `EXECUTION_REQUIRED` before a worker may receive the card.
- The worker profile must exist in the active policy and may not equal the advisor profile. A different target profile requires a new exact phase card.
- Every model change creates a new `phase_id`. Its card binds `from_profile`, `worker_profile`, `transition`, and the rule `state_in_binding: PREVIOUS_PHASE_OUTPUT`. The runtime receipt supplies the actual digests and must prove exact continuity before the phase can engage.
- `context_turns` may be zero through the policy maximum. Full-history propagation is forbidden.
- Card size must stay below the policy limit. Prefer source locators over copied source bodies.
- Give every material constraint a stable tag and at least one acceptance check with the same tag.
- When a condition changes behavior, include the smallest contrasting allowed and disallowed case needed to prevent the worker from applying the rule too broadly.
- State copy, replay, mutation, and identity behavior explicitly when those semantics affect correctness.
- Every material scope change creates a new card version and digest.

## Worker envelope

The trusted host adds this compact envelope when assigning the exact approved card. It is routing metadata, not cryptographic proof. Only the direct host conversation authenticates human approval.

```text
WORKER ENVELOPE v1
phase: ACTIVE
model_phase_id: <exact phase ID>
transition: UPGRADE | DOWNGRADE | STABLE
from_profile: <exact prior profile>
workflow_state: WORK_ASSIGNED
policy_digest: <exact digest>
card_id: <exact ID>
card_digest: <exact digest>
approval_event_hash: <event reference or UNKNOWN>
worker_id: <assigned worker>
worker_profile: <exact profile from the active model map>
state_in_digest: <exact incoming-state digest>
workspace_root: <authorized root>
read_targets: <explicit paths or source IDs>
write_targets: <explicit paths>
do_not_read: <explicit paths or categories>
```

The worker must confirm that the envelope, card, and assignment agree before acting. Any mismatch stops work.

At completion, the host appends the `MODEL PHASE RECEIPT v1` defined in [protocol.md](protocol.md). Its outgoing digest becomes the next phase's incoming digest. The next model may not engage until those values match.

## Worker receipt

The worker returns one plain-text receipt followed by the declared artifacts:

```text
WORK RECEIPT v1
status: PASS | FAIL | STOPPED | UNKNOWN
changed_files: <exact paths or NONE>
commands_run: <exact commands or NONE>
check_results: <check and result pairs>
unresolved: <items or NONE>
stop_reason: <reason or NONE>
claim_ceiling: <what this work does not establish>
```

The receipt records work. It cannot accept the result or authorize another attempt.

## What the digest means

The digest establishes exact content identity under the declared canonicalization rules. It does not establish completeness, truth, good judgment, human identity, or the correctness of the requested work.
