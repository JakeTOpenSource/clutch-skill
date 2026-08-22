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
| `routing` | Symbolic profiles, effort, context turns, attempt limit, and concurrency |
| `claim_ceiling` | What a successful result still does not establish |

## Card example

```json
{
  "schema_version": "context-card.v1",
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
  "constraints": ["Do not add dependencies."],
  "unknowns": ["Runtime cost telemetry is unavailable."],
  "allowed_actions": ["Edit parser and test files in the declared project."],
  "forbidden_actions": ["Do not publish, deploy, or change unrelated files."],
  "required_outputs": ["Parser implementation", "Passing negative tests"],
  "acceptance_checks": ["Valid fixture parses", "Malformed fixture is rejected"],
  "stop_conditions": ["Stop after one attempt, a failed check, or any scope conflict."],
  "routing": {
    "worker_profile": "economy",
    "fallback_profile": "balanced",
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
- The worker and proposed next-card profiles must exist in the active policy and may not equal the advisor profile. The `fallback_profile` field never authorizes automatic fallback.
- `context_turns` may be zero through the policy maximum. Full-history propagation is forbidden.
- Card size must stay below the policy limit. Prefer source locators over copied source bodies.
- Every material scope change creates a new card version and digest.

## Worker envelope

The trusted host adds this compact envelope when assigning the exact approved card. It is routing metadata, not cryptographic proof. Only the direct host conversation authenticates human approval.

```text
WORKER ENVELOPE v1
phase: ACTIVE
workflow_state: WORK_ASSIGNED
policy_digest: <exact digest>
card_id: <exact ID>
card_digest: <exact digest>
approval_event_hash: <event reference or UNKNOWN>
worker_id: <assigned worker>
worker_profile: economy | balanced
workspace_root: <authorized root>
read_targets: <explicit paths or source IDs>
write_targets: <explicit paths>
do_not_read: <explicit paths or categories>
```

The worker must confirm that the envelope, card, and assignment agree before acting. Any mismatch stops work.

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
