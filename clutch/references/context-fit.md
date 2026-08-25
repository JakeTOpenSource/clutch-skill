# Pedal Protocol: context fit and transfer depth

The Pedal Protocol is the experimental quality-control layer between card approval and worker assignment. Clutch governs who may engage work. The Pedal Protocol governs how much context may cross the boundary. It asks a narrow question: what is the smallest candidate package whose exact task-shaped projection still matches the recipe, projector, state receipt, and registered task requirements?

It does not decide whether the card is true, complete, wise, safe, or sufficient for reality outside the observation boundary.

## Tetris and Operation

The Tetris part packs only the pieces needed for the active task. The Operation part checks the edges. If the task identity, allowed actions, forbidden actions, projection logic, or resulting state changes, the old piece no longer fits and the route returns to neutral.

The metaphor describes two different controls:

- Packing reduces repeated material on the worker board.
- Contact detection rejects a structurally mismatched transfer.

A smaller board is not automatically a better board. A clean fit is admissibility within registered checks, not semantic completeness.

## Transfer levels

Evaluate these levels from smallest to largest. Select the first level that returns `FIT` for every registered requirement:

1. `CARD`: the approved card and its mandatory source references.
2. `EXPANDED`: the card plus explicitly selected state, evidence, or memory bundles.
3. `FULL_CONTEXT`: the complete authorized task context when a smaller projection cannot preserve fit.

If no level fits, return `HOLD` and remain neutral. Using `FULL_CONTEXT` is a valid coherence decision, but it carries no context-compression claim. The system must record the source bytes or tokens, transferred bytes or tokens, selected level, omitted registered fields, fit result, and any unavailable measurement as `UNKNOWN`.

The optimization target is minimum sufficient context under a frozen quality boundary. Maximum compression is not the target. Quality and registered constraints are evaluated before token reduction.

## Rotary Context Cycle

Use a generic rotary-engine cycle as the feedback model:

```text
INTAKE CURRENT STATE
  -> COMPRESS TO THE SMALLEST FITTING PACKAGE
  -> EXECUTE ONE BOUNDED ATTEMPT
  -> EXHAUST A RESULT AND VERIFICATION RECEIPT
  -> FEED OBSERVED ERROR INTO A NEW CARD CYCLE
```

The mechanical analogy stops there. A Wankel-style engine repeats intake, compression, power, and exhaust around a rotor; its accelerator is not a general variable-compression control. In Clutch, transfer depth is the controlled variable.

Failure is retained as feedback. A context omission, stale state, failed check, or unresolved uncertainty becomes a mandatory input to the next proposed card. A new cycle never inherits permission from the old one and does not run automatically. If a context-related failure occurred, the next proposal cannot select a smaller transfer level unless new registered evidence resolves that failure. Every new package must independently pass fit and approval.

Repeated cycles within one task lineage are dependent state transitions. They must not be counted as new independent tasks in an evaluation.

## Experimental host manifest

One local exhaustive pilot selected three host-side digests from a registered nine-field domain:

- `task_digest`: the exact task recipe, including identity, roots, budget, allowed actions, and forbidden actions.
- `compiler_bundle_digest`: the exact local code bundle that created the projection and receipt.
- `receipt_digest`: the exact reducer outcome, visible and omitted state, board digest, and status represented by the receipt.

These fields stay with the host. They need not enlarge the worker card. The host may expose one digest of the three-field manifest in the worker envelope so the returned receipt can be linked to the exact projection decision.

## Required state

Use only these statuses:

- `FIT`: all registered identities and checks match.
- `HOLD`: at least one registered identity or boundary changed, is missing, or cannot be checked.
- `UNKNOWN`: the host cannot observe enough to decide.

Only `FIT` is eligible to continue to the separate approval and assignment gates. In the current release that means exact human approval. `FIT` grants no authority by itself. `HOLD` and `UNKNOWN` return to neutral.

## Failure lesson

An earlier local optimizer selected a smaller 376-byte manifest. It passed because the frozen counterexamples failed to vary task identity and authorization independently. Corrective cases showed that it missed task-ID, allowed-action, and forbidden-action changes. The corrected registered-domain result used 431 bytes.

That failed result is part of the design rule: optimize only after the counterexample domain is frozen, preserve every failed shortcut, and never promote a smaller representation merely because it passes an incomplete test suite.

## Claim ceiling

The current evidence establishes only a local minimum over one registered field set, serialization, fixture, and counterexample suite. The three transfer levels are a proposed decision rule and have not been validated as an adaptive routing policy. The evidence does not establish global minimality, semantic completeness, present-world standing, actor identity, authorization, confidentiality, security, model quality, or token savings.
