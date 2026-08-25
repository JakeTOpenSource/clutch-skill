# Fuse Protocol

The Fuse Protocol lets a long task cross a bad or misaligned phase without erasing evidence, repeating the phase, or pretending the attempt succeeded. It is the emergency platform between two bounded parts of one approved journey.

## What it changes

A simple Clutch card still authorizes one worker attempt. A long task may instead attach one exact, human-approved phase plan to the card. That approval names every phase, contract, worker profile, platform, context-transfer level, maximum transition count, and permitted emergency route before execution begins.

Each phase still gets one attempt. A route to another phase is not a retry of the failed phase. It is a new, separately named part of the approved plan. The same phase ID, attempt ID, or provider-attempt hash can never be used twice. A renamed repair phase must differ materially in its contract, requirements, worker profile, platform, or transfer level; an identical phase under a new name is rejected as a hidden retry.

Human approval is invested in the exact plan up front. The Role Model and trusted orchestrator may follow only its declared routes. Human absence creates no new permission. A missing, ambiguous, exhausted, backward, or undeclared route returns the system to `HOLD_NEUTRAL`. Runtime exhaustion is a valid stopped journey, not malformed evidence: the reducer preserves the candidate, fix log, receipt, and attempted usage while authorizing no transition.

## Four linked records

Keep these records separate and hash-linked:

1. `candidate artifact`: what the phase produced, even when it is unusable;
2. `evaluation receipt`: requirement-by-requirement observations about that candidate;
3. `fix log`: the observed defect or missing condition needed by a later phase; and
4. `fuse decision`: the exact preapproved route selected from the phase and reason.

Only an artifact that passes every registered requirement becomes the next admissible artifact. A rejected candidate remains feedback evidence. It never silently becomes project state.

## State flow

```text
READY
  -> phase attempt
  -> all registered checks PASS
       -> ADVANCE_READY
       -> final phase: DELIVERABLE
  -> observed non-delivery
       -> declared REPAIR route: FUSE_OPEN
       -> declared TRANSFER route: FUSE_OPEN
       -> declared EVACUATE route: EVACUATED
       -> no usable exact route: HOLD_NEUTRAL
```

`DELIVERABLE` means the final phase passed its registered checks and is eligible for human acceptance. It is not acceptance by itself.

## Reason and action boundary

The reducer derives transport and observation failures from check statuses and otherwise uses the declared evaluation classification.

| Reason | Permitted continuation |
|---|---|
| `EXECUTION_DEFECT` | `REPAIR`, `TRANSFER`, or stop |
| `CAPABILITY_MISMATCH` | `TRANSFER` or stop |
| `CONTEXT_OMISSION` | `REPAIR`, `TRANSFER`, or stop; transfer depth cannot shrink |
| `STALE_STATE` | `REPAIR`, `TRANSFER`, or stop |
| `PHASE_MISMATCH` | `REPAIR`, `TRANSFER`, or stop; a fix log is required |
| `CONTRACT_DEFECT` | `EVACUATE` or stop |
| `OBSERVATION_GAP` | `EVACUATE` or stop |
| `TRANSPORT_FAILURE` | `EVACUATE` or stop |
| `AUTHORITY_GAP` | `EVACUATE` or stop |
| `SAFETY_HOLD` | `EVACUATE` or stop |

The plan may omit any route. Omission means hold, not improvisation. `TRANSFER` must change the declared worker profile or platform. Every route is forward-only, unique for one `from_phase_id` plus `reason_code`, and usable at most once.

`CONTRACT_DEFECT`, `OBSERVATION_GAP`, `TRANSPORT_FAILURE`, `AUTHORITY_GAP`, and `SAFETY_HOLD` dominate `PHASE_MISMATCH`. A receipt arriving in the wrong phase cannot relabel one of those strict stop reasons as repairable work.

## Transfer levels

- `CARD`: the approved task card and declared sources;
- `EXPANDED`: the card plus selected state, evidence, or fix logs named by the plan; and
- `FULL_CONTEXT`: all authorized context needed for that phase.

A context-omission route can stay at the same level or move upward. It cannot move downward. The protocol makes no compression claim when `FULL_CONTEXT` is required.

## Phase receipt

Every phase appends one `phase-receipt.v1` object containing:

- sequence and previous-receipt hash;
- exact plan, phase, attempt, provider-attempt, worker, worker-status, profile, platform, transfer-level, and contract bindings;
- input, candidate-output, provider-attempt, and prior fuse-decision hashes;
- every registered requirement ID with `PASS`, `FAIL`, `UNKNOWN`, or `ERROR` and an evidence hash;
- a verification status, classification, and fix-log hash; and
- input, cached-input, output, elapsed-time, and cost telemetry as nonnegative integers or the exact sentinel `UNKNOWN` when the host did not observe a value.

Every registered requirement must appear exactly once. An unregistered or missing requirement invalidates the stream. The aggregate verification status is derived from those checks rather than trusted from the caller. A passing phase requires worker status `PASS`, verification status `PASS`, a known output artifact, and no fix log. An observed failed candidate must have both an output hash and fix log. An observation or transport failure may use `UNKNOWN` for its candidate artifact but must still carry a fix log.

The next routed phase receives the exact previous Fuse-decision hash in `fuse_context_hash`. A merely nonempty or unrelated hash is rejected. A normal forward phase must use `NONE`. This makes emergency transfer visible and prevents an ordinary transition from impersonating one.

## Accounting

Every attempted phase contributes its tokens, time, and cost to the total, including failed, evacuated, and held work. If any required telemetry value is unavailable, its aggregate remains `UNKNOWN`; it never collapses to zero. `delivery_units` becomes `1` only after the final phase passes. `efficiency_eligible` becomes true only when there is one verified delivery and all required telemetry is complete. Any cost-per-delivery or savings comparison must use verified deliveries as its denominator. No delivery or incomplete telemetry means there is no successful efficiency observation.

The host must write `UNKNOWN` when it did not observe a telemetry value. The reducer can preserve that declaration but cannot prove that a caller reporting zero actually observed zero. Trusted measurement remains a host boundary.

## Deterministic tools

Run:

```text
node clutch/scripts/fuse-gate.mjs examples/fuse-input.example.json
node clutch/scripts/verify-fuses.mjs
```

`fuse-gate.mjs` is the primary metadata-only reducer. It withholds caller-supplied plan, phase, route, and claim text from its report, returning only opaque hash references and fixed enums. `fuse-reference.mjs` is a separately written projection used for parity checks. `verify-fuses.mjs` exercises successful delivery, repair, transfer, context expansion, phase realignment, evacuation, neutral hold, exhausted limits with preserved accounting, unknown telemetry, ordinal route ordering, and hostile mutations.

The tools establish local deterministic conformance only. They do not authenticate a human, guarantee durable append-only storage, prove model quality, enforce filesystem isolation, or establish savings.
