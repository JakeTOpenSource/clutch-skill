# Clutch protocol

## Purpose and claim ceiling

This protocol separates expensive judgment from lower-cost execution without treating a summary, model choice, or passing test as authority. It is a model-routing profile, not a security boundary, proof of correctness, or guarantee of savings.

The protocol can run through native host routing, a human-mediated clean-session handoff, or card-only preparation. Select the mode through [host-integration.md](host-integration.md). Installation alone does not select or activate a mode.

## State sequence

```text
INTAKE
  -> ADVISOR_REVIEW
  -> CARD_PROPOSED
  -> HUMAN_APPROVED | HUMAN_REJECTED
  -> WORK_ASSIGNED
  -> PHASE_RESULT_RECORDED
  -> PHASE_VERIFICATION_RECORDED
  -> PASS: NEXT_PHASE | FINAL_DELIVERABLE
  -> NON_DELIVERY: PREAPPROVED_REPAIR | PREAPPROVED_TRANSFER | EVACUATE | HOLD_NEUTRAL
  -> HUMAN_ACCEPTED | HUMAN_REQUESTED_CORRECTION
  -> CLOSED | NEW_CARD_PROPOSED
```

A card without a Fuse plan has one phase and one attempt. A long-task card may bind a finite [Fuse plan](fuse-protocol.md) in the same exact human approval. Each phase still has one attempt. Preapproved emergency routing advances to a new phase; it never repeats or silently rewrites the failed phase.

The framework itself begins in `PREPARE_ONLY`. It enters `ACTIVE` only when the trusted host directly observes an allowed human activation decision binding the exact active policy hash. In a packaged deployment, the policy declares the implementation-manifest digest and the policy ID binds that same digest. The checker can verify that the declarations agree. Only the trusted host can establish that the digest belongs to the bytes it actually loaded.

## Clutch control

The protocol uses three control roles. `Role Model` is the human-facing name for the designated read-only advisor. The Role Model may propose an exact card. The human owner may activate the policy, approve or reject a card, accept a verified result, or request correction. The trusted orchestrator may assign an approved card and close its lifecycle. Every actor ID must appear in the corresponding policy allowlist.

Workers and verifiers are evidence producers. Their result and verification events can expose success, failure, or uncertainty, but they cannot engage, re-engage, reroute, approve, accept, or close work. An undeclared coordinator is invalid even when its ID is nonempty.

This release implements the human-approved path only. A proposed two-key fallback would require prior owner delegation, matching Role Model and orchestrator concurrence on the exact card and state, reversible local scope, and a return to neutral when they disagree. The human would break that tie. Human absence alone would confer no authority. That extension is not active in this release.

## Planes

| Plane | Holds | Cannot establish |
|---|---|---|
| Advisor context | Long request history and read-only sources | Worker authority or accepted state |
| Draft card | Advisor's proposed bounded transfer | Approval, completeness, or correctness |
| Approval ledger | Ordered human and agent events with causal hashes | Truth merely because an event was logged |
| Approved card | Exact human-approved worker context | Permission beyond its listed scope |
| Approved phase plan | Exact forward phases and emergency routes | Permission to invent, repeat, or reverse a route |
| Execution state | Worker progress, output, and failure receipt | Human acceptance or retry authority |
| Verification | Results of declared checks | External truth outside those checks |
| Fuse feedback | Rejected candidate, fix log, and route receipt | Delivery or admissible project state |
| Accepted projection | Human-recognized result and limits | Future correctness or external world state |
| Cost telemetry | Tokens, latency, and price observations | Quality or savings when measurements are absent |

No plane promotes itself.

## Advisor boundary

After activation, the advisor may:

- inspect authorized sources and current state;
- ask one necessary question;
- search and reason;
- identify risks, missing context, and acceptance tests;
- draft a card in the human-visible conversation;
- compute or report card and policy digests through pure computation;
- route an exact approved card to a worker; and
- review worker results without modifying them.

The advisor may not:

- edit project artifacts or perform implementation labor;
- send an unapproved draft to another agent;
- approve its own card, result, or policy;
- silently relax tests, scope, privacy, or model requirements;
- publish, deploy, purchase, merge, or perform other consequential writes; or
- convert a failed worker result into acceptance.

Collaboration control that passes an approved card to a worker is permitted orchestration. It is not project-artifact authorship or human acceptance. The orchestrator must be policy-allowlisted and must have observed the approval directly in the trusted host conversation. A caller-supplied event stream or digest cannot authenticate that approval.

## Card approval

Approval must identify the exact card ID, card version, card digest, worker profile, and allowed scope. For multi-phase work it must also identify the exact Fuse-plan digest. If the human changes any load-bearing field, phase, route, limit, or transfer level, the advisor creates a new immutable version and requests a new approval.

The shortest valid human interaction is:

1. Advisor shows one proposed card and one approval question.
2. Human approves, rejects, or edits it.
3. The system routes or stops.

Do not add ceremonial approvals between distinct phases already bound into an approved Fuse plan. Stop for a new approval when the required phase or route was not bound up front.

## Worker boundary

After the approval observer confirms the exact human decision and the metadata-only consistency check passes, the worker receives:

- the worker envelope and exact approved card;
- only the source references authorized by that card;
- the declared model profile and reasoning effort;
- one deliverable;
- deterministic checks; and
- a stop condition.

The worker does not receive the full chat history, advisor scratch work, rejected cards, private reasoning, or unrelated project files. A native host must create that clean context. In manual mode, the human creates it by opening a new session and transferring only the approved package. The worker must not spawn other agents, widen scope, or change its own model profile.

The worker returns the fixed receipt defined in [card-contract.md](card-contract.md). In a multi-phase run the host converts that evidence into one hash-linked `phase-receipt.v1` and evaluates it with the Fuse gate. The receipt does not declare acceptance.

Before assignment, a host may also apply the experimental [Pedal Protocol](context-fit.md). It tests candidate transfer depths against the task recipe, projection code, receipt, and registered requirements. It returns `FIT`, `HOLD`, or `UNKNOWN`. A fit result is neither approval nor proof that the selected context is semantically complete.

## Failure, feedback, and phase routing

One phase authorizes one worker attempt. A failed or misaligned phase remains a charged non-delivery receipt. Its candidate artifact and fix log become feedback, while the last passing artifact remains the only admissible state.

Without a Fuse plan, a failed check, unavailable capability, context omission, desired repair, or model change returns to the advisor for a new card and to the human for a new approval. With an exact approved Fuse plan, the trusted host may select only the unique route matching the current phase and observed reason. The route may advance to a distinct repair phase, transfer to a distinct profile or platform, evacuate, or hold neutral. Missing authority, an undeclared route, an exhausted limit, a backward edge, or an ambiguous mapping fails closed.

This is bounded continuation, not automatic retry. The same phase and attempt IDs cannot reappear. A context-omission route cannot reduce transfer depth. Contract, observation, transport, authority, and safety failures cannot be laundered into repair work by relabeling them.

The frontier advisor is not an escalation worker. It may diagnose and issue a new proposed card.

## Corrections

Corrections are new cards or separately named phases already present in the approved plan. Preserve the failed card, phase receipt, candidate artifact hash, verification, fix log, Fuse decision, and human disposition. Do not overwrite the path that exposed the failure.

## Checker boundary

The Node card checker validates canonical hashes, ordering, declared Role Model, human, and orchestrator IDs, phase, declared implementation binding, limits, and assignment eligibility. It requires a worker result status and receipt hash, requires a verification receipt hash, prevents a verifier PASS from promoting a worker-declared non-pass, and gives verified non-delivery a closable correction path.

The Fuse checker independently validates phase contracts, requirement coverage, route uniqueness, one-use limits, forward motion, admissible-state continuity, and delivery accounting. Both checker families reject worker or verifier attempts to operate the clutch. They return bounded metadata while withholding raw card and artifact content. Caller input remains untrusted. Passing checks establishes same-runtime offline consistency only. It does not establish actor identity, durable append-only storage, recipient isolation, confidentiality, or permission to act. The trusted host conversation supplies approval authority and passes the approved package itself.

## Cost and quality evaluation

Use the four matched conditions in [evaluation.md](evaluation.md) so model capability, automatic compression, and human review can be separated. Keep these fields separate:

- task success;
- critical defect count;
- acceptance-check coverage;
- context omissions;
- human interventions;
- advisor tokens and cost;
- worker tokens and cost;
- retries;
- latency; and
- total cost.

Adopt a cheaper route only when quality remains within a human-approved, preregistered tolerance. Lower cost, fewer calls, or faster completion is not an improvement when required evidence or constraints are lost. A failed or unresolved quality gate leaves the efficiency winner unclaimed.
