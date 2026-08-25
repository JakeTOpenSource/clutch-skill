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

One card authorizes one attempt in one declared model phase. Every model upgrade or downgrade creates a new phase boundary. The system returns to neutral, binds the outgoing state to the incoming state, and requires its own exact approved phase card. After a failed check, repair request, or missing capability, every retry requires a new card and human approval.

## Host modes

The canonical skill follows the open Agent Skills folder format. Harness adapters only choose where that folder is installed. They do not duplicate or rewrite the protocol.

`NATIVE_ROUTING` uses a host-created clean worker context. `MANUAL_HANDOFF` uses a new session created by the human, who transfers only the exact approved worker package. `CARD_ONLY` stops after planning when neither clean transfer is available. These modes preserve one state machine while keeping host capability claims explicit.

## Phase mechanism

The full conversation remains with the advisor. The worker receives the exact approved phase card, explicit source references, and the state released by the prior phase. The next model may engage only when the outgoing and incoming state digests match. Capability ranks in the frozen policy determine whether the model transition is an upgrade, downgrade, or stable assignment. Price has no role in that classification.

## Empirical status

An earlier preregistered fixed synthetic benchmark measured provider economics and average post-handoff quality. Stable-Terra cards produced fewer fully correct final tasks than full history, and the model-switch protection endpoint remained neutral or unresolved. Those results are retained as historical evidence in [evaluation-v2.md](evaluation-v2.md). The current protocol decision reads only authorization, phase identity, state continuity, and verified delivery. Economic analysis belongs to an external governance layer.

## Authority boundary

The included Node checker consumes untrusted caller-supplied JSON. Hashes prove exact bytes and internal ordering under the declared canonicalization rules. They do not prove who supplied an event. The checker emits eligibility metadata and never emits card content.

A production host must separately provide authenticated human identity, trusted policy and manifest storage, durable append-only events, recipient-bound delivery, and filesystem isolation where needed. Manual handoff relies on the human to preserve the clean-session boundary. This repository supplies none of those infrastructure guarantees.

## Visual invariants

- Three states appear in a fixed order.
- The first two transmissions remain mechanically neutral.
- Only the third transmission shows engagement.
- The workshop, bench, laptop, camera, lighting, and crop stay fixed.
- The screen state compresses from full context to one approved card.
- Verification and human acceptance occur after the depicted worker attempt.
- The visual makes no claim of semantic completeness or production safety.
