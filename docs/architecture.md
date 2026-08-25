# Architecture

## Mechanical model

Clutch uses a manual transmission because the state changes have concrete meanings.

```text
NEUTRAL -> APPROVE CARD -> ENGAGED
```

Neutral disconnects worker execution while the Role Model retains full context as the read-only advisor. Human approval controls engagement. The exact card and model profile select the gear. The policy-allowlisted orchestrator performs the assignment. A simple engagement authorizes one bounded worker attempt.

Long work can bind a finite phase graph in the same approval. Each phase is still one attempt. At a phase boundary, the Fuse gate behaves like an emergency metro platform: it preserves the last known-good cargo, records the rejected candidate and fix log, and permits only a forward route already present in the approved graph. It can repair in a new phase, transfer to a different profile or platform, evacuate, or hold neutral. It cannot repeat the failed phase, silently shrink context after an omission, or count feedback as delivery.

The experimental context-fit layer is the Pedal Protocol. It combines two narrower controls. The Tetris side packs a task-shaped projection. The Operation side tests registered edges such as task identity, action boundaries, projection-code identity, and receipt identity. It tries `CARD`, `EXPANDED`, then `FULL_CONTEXT`, stopping at the smallest registered fit. `HOLD` or `UNKNOWN` returns to neutral. `FIT` means only that the registered structure still matches; it is not truth, completeness, or authority.

Inside that layer, the Rotary Context Cycle describes repeated memory flow: intake current state, compress to the smallest fitting package, execute one bounded attempt, exhaust a receipt, and feed observed error into a new card. The rotary metaphor describes feedback, not literal variable compression. Failed context becomes mandatory evidence for the next cycle; it does not create an automatic retry.

Every panel begins with the exact same pinned laptop-and-shop image. Only panel three overlays the edited lever, selector fork, and synchronizer engagement region. The laptop stays in place while its deterministic screen overlay changes from full context, to approved card, to bounded worker.

Because worker assignment cannot occur before exact human approval, the architecture is human-in-the-loop. A monitoring-only architecture would use a different authority boundary.

## Control flow

The Role Model may inspect, reason, search, red-team, and draft a card. After activation it remains read-only for project artifacts. The human approves or rejects the exact card. The trusted orchestrator validates offline consistency, then sends the card to one worker. The worker returns artifacts and a receipt. A verifier runs declared checks. The human remains the only acceptance authority.

The Role Model, human, and orchestrator are the only clutch-control roles. Their actor IDs are explicit policy fields. Workers and verifiers can report evidence but cannot assign, reroute, approve, accept, or close work. A proposed future two-key mode would let the Role Model and orchestrator proceed only inside a previously owner-delegated, reversible local envelope. Agreement would be required; disagreement would return to neutral for the human to break the tie. That mode is not implemented or active in this release.

One simple card authorizes one attempt. A multi-phase card can authorize several distinct one-attempt phases up front. After a failed check, repair request, missing capability, or desired model change, continuation requires either an exact matching route in that approved plan or a new card and human approval. The same phase never runs twice.

## Host modes

The canonical skill follows the open Agent Skills folder format. Harness adapters only choose where that folder is installed. They do not duplicate or rewrite the protocol.

`NATIVE_ROUTING` uses a host-created clean worker context. `MANUAL_HANDOFF` uses a new session created by the human, who transfers only the exact approved worker package. `CARD_ONLY` stops after planning when neither clean transfer is available. These modes preserve one state machine while keeping host capability claims explicit.

## Cost mechanism

The full conversation remains with the advisor. The worker receives the compact approved card and explicit source references. This may reduce input-context volume. The worker may also run on a lower-priced model. Lower context volume and lower model price are separate possible benefits. Both must be measured against an all-frontier baseline on representative tasks.

System efficiency is counted only when the cargo reaches its declared destination. Every attempted phase remains in total cost and elapsed time, including a phase that ends at an exhausted Fuse or platform limit. Only a passing final phase contributes a delivery unit. Missing telemetry remains `UNKNOWN`, and incomplete telemetry is ineligible for an efficiency comparison. This blocks an inexpensive failed fragment or an unobserved cost from being presented as a successful saving.

## Authority boundary

The included Node checker consumes untrusted caller-supplied JSON. Hashes prove exact bytes and internal ordering under the declared canonicalization rules. They do not prove who supplied an event. The checker emits hashes, status, state, and approved profile while withholding raw card fields. Hash equality can still disclose repeated content and is not confidentiality protection.

A production host must separately provide authenticated human identity, trusted policy and manifest storage, durable append-only events, recipient-bound delivery, filesystem isolation where needed, and real cost telemetry. Manual handoff relies on the human to preserve the clean-session boundary. This repository supplies none of those infrastructure guarantees.

## Evaluation boundary

Clutch is evaluated as a system with four matched conditions: capable model with full context, proposed worker with full context, proposed worker with an automatic card, and proposed worker with a human-approved card. This separates model downgrade, the whole automatic card transformation, and review effects. The transformation may compress, reorganize, generate, improve, or omit information, so it is not labeled pure compression. Quality is tested before efficiency, and a failed quality comparison prevents an efficiency winner from being named.

The release includes a claim ledger and minimized evidence snapshots. Raw local prompts and private workspaces are excluded. The current evidence ceiling is local synthetic conformance plus preliminary observations; it is not a production, security, general-quality, or general-savings result.

## Visual invariants

- Three states appear in a fixed order.
- The first two transmissions remain mechanically neutral.
- Only the third transmission shows engagement.
- The workshop, bench, laptop, camera, lighting, and crop stay fixed.
- The screen state compresses from full context to one approved card.
- Verification and human acceptance occur after the depicted worker attempt.
- The visual makes no claim of measured savings or production safety.
