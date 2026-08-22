# Architecture

## Mechanical model

Clutch uses a manual transmission because the state changes have concrete meanings.

```text
NEUTRAL -> APPROVE CARD -> ENGAGED
```

Neutral disconnects worker execution while the advisor retains full context. Human approval acts as the clutch gate. The exact card and model profile select the gear. Engagement authorizes one bounded worker attempt. A failed check disengages the worker and returns control to neutral.

Every panel begins with the exact same pinned laptop-and-shop image. Only panel three overlays the edited lever, selector fork, and synchronizer engagement region. The laptop stays in place while its deterministic screen overlay changes from full context, to approved card, to bounded worker.

Because worker assignment cannot occur before exact human approval, the architecture is human-in-the-loop. A monitoring-only architecture would use a different authority boundary.

## Control flow

The advisor may inspect, reason, search, red-team, and draft a card. After activation it remains read-only for project artifacts. The human approves or rejects the exact card. The trusted host validates offline consistency, then sends the card to one worker. The worker returns artifacts and a receipt. A verifier runs declared checks. The human remains the only acceptance authority.

One card authorizes one attempt. After a failed check, repair request, missing capability, or desired model change, every retry requires a new card and human approval.

## Cost mechanism

The full conversation remains with the advisor. The worker receives the compact approved card and explicit source references. This may reduce input-context volume. The worker may also run on a lower-priced model. Lower context volume and lower model price are separate possible benefits. Both must be measured against an all-frontier baseline on representative tasks.

## Authority boundary

The included Node checker consumes untrusted caller-supplied JSON. Hashes prove exact bytes and internal ordering under the declared canonicalization rules. They do not prove who supplied an event. The checker emits eligibility metadata and never emits card content.

A production host must separately provide authenticated human identity, trusted policy and manifest storage, durable append-only events, recipient-bound delivery, filesystem isolation where needed, and real cost telemetry. This repository supplies none of those infrastructure guarantees.

## Visual invariants

- Three states appear in a fixed order.
- The first two transmissions remain mechanically neutral.
- Only the third transmission shows engagement.
- The workshop, bench, laptop, camera, lighting, and crop stay fixed.
- The screen state compresses from full context to one approved card.
- Verification and human acceptance occur after the depicted worker attempt.
- The visual makes no claim of measured savings or production safety.
