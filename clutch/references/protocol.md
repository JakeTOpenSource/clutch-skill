# Clutch protocol

## Purpose and claim ceiling

This protocol separates long-context judgment from bounded execution without treating a summary, model choice, or passing test as authority. It governs model-phase transitions. It is not a security boundary or proof of correctness.

The protocol can run through native host routing, a human-mediated clean-session handoff, or card-only preparation. Select the mode through [host-integration.md](host-integration.md). Installation alone does not select or activate a mode.

## State sequence

```text
INTAKE
  -> ADVISOR_REVIEW
  -> CARD_PROPOSED
  -> HUMAN_APPROVED | HUMAN_REJECTED
  -> WORK_ASSIGNED
  -> WORK_RESULT_RECORDED
  -> VERIFICATION_RECORDED
  -> HUMAN_ACCEPTED | HUMAN_REQUESTED_CORRECTION
  -> CLOSED | NEW_CARD_PROPOSED
```

The framework itself begins in `PREPARE_ONLY`. It enters `ACTIVE` only when the trusted host directly observes an allowed human activation decision binding the exact active policy hash. In a packaged deployment, the policy identity also binds the implementation manifest so the instructions, model adapter, and checker logic cannot change underneath the approval.

## Planes

| Plane | Holds | Cannot establish |
|---|---|---|
| Advisor context | Long request history and read-only sources | Worker authority or accepted state |
| Draft card | Advisor's proposed bounded transfer | Approval, completeness, or correctness |
| Approval ledger | Ordered human and agent events with causal hashes | Truth merely because an event was logged |
| Approved card | Exact human-approved worker context | Permission beyond its listed scope |
| Execution state | Worker progress, output, and failure receipt | Human acceptance or retry authority |
| Verification | Results of declared checks | External truth outside those checks |
| Accepted projection | Human-recognized result and limits | Future correctness or external world state |
| External telemetry reference | Optional pointers to provider usage, latency, and price receipts | Quality, permission, or a Clutch pass |

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

Collaboration control that passes an approved card to a worker is permitted orchestration. It is not project-artifact authorship or human acceptance. The orchestrator must have observed the approval directly in the trusted host conversation. A caller-supplied event stream or digest cannot authenticate that approval.

## Card approval

Approval must identify the exact card ID, card version, card digest, worker profile, and allowed scope. If the human changes any load-bearing field, the advisor creates a new immutable card version and requests a new approval.

The shortest valid human interaction is:

1. Advisor shows one proposed card and one approval question.
2. Human approves, rejects, or edits it.
3. The system routes or stops.

Do not add ceremonial approvals between bounded steps inside one unchanged model phase that were already included in the approved card.

## Model phases

Each model upgrade or downgrade is a phase change. Before crossing that boundary:

1. Return execution to neutral.
2. Record the prior and next model profiles and classify the transition as `UPGRADE`, `DOWNGRADE`, or `STABLE` under the active model map. Missing or incomparable ranks fail closed before assignment.
3. Bind the outgoing state digest, the receiving-state digest, the exact phase card, and the human approval that covers it.
4. Engage only the model and steps named by that card.
5. Verify that the next phase consumed the exact state released by the prior phase.

An unchanged model may perform several declared steps inside one phase. A new model always requires a new exact phase card. The human may approve a frozen batch of already visible phase cards in one decision. That batch does not approve unknown future cards, and a later phase remains ineligible until its predecessor state matches.

Use this receipt at every model boundary:

```text
MODEL PHASE RECEIPT v1
transition_id: <stable ID>
from_phase: <phase ID>
to_phase: <phase ID>
direction: UPGRADE | DOWNGRADE | STABLE
from_model_profile: <exact profile>
to_model_profile: <exact profile>
state_out_digest: <digest from prior phase>
state_in_digest: <digest received by next phase>
phase_card_digest: <exact approved card>
approval_event_hash: <exact approval reference>
status: COMPLETE | INCOMPLETE | STOPPED | UNKNOWN
```

The transition is coherent only when `state_out_digest` equals `state_in_digest`, the card and approval match, and the declared checks pass. A digest establishes byte identity, not semantic completeness.

## Worker boundary

After the approval observer confirms the exact human decision and the metadata-only consistency check passes, the worker receives:

- the worker envelope and exact approved card;
- only the source references authorized by that card;
- the declared model profile and reasoning effort;
- one deliverable;
- deterministic checks; and
- a stop condition.

The worker does not receive the full chat history, advisor scratch work, rejected cards, private reasoning, or unrelated project files. A native host must create that clean context. In manual mode, the human creates it by opening a new session and transferring only the approved package. The worker must not spawn other agents, widen scope, or change its own model profile.

The worker returns the fixed receipt defined in [card-contract.md](card-contract.md). It does not declare acceptance.

## Failure and escalation

One approved card authorizes one worker attempt in one model phase. A failed check, unavailable capability, context omission, desired repair, or proposed model change returns to the advisor for a new card and to the human for a new approval unless the human already approved that exact next-phase card in a frozen batch. There is no automatic retry or fallback. Ambiguous ownership, missing authority, conflicting sources, safety-critical uncertainty, or a requested scope change also returns to the human.

The frontier advisor is not an escalation worker. It may diagnose and issue a new proposed card.

## Corrections

Corrections are new cards and new events. Preserve the failed card, worker receipt, verification, and human disposition. Do not overwrite the path that exposed the failure.

## Checker boundary

The Node checker validates canonical hashes, ordering, declared roles, phase, limits, and lifecycle eligibility. It always returns metadata, never card contents. Its event stream is untrusted caller input. Passing checks establishes same-runtime offline consistency only. It does not establish human identity, durable append-only storage, recipient isolation, confidentiality, or permission to act. The trusted host conversation supplies approval authority and passes the approved card itself.

## External evaluation boundary

Clutch decides only whether the authorized work stayed coherent and reached its declared verification boundary. Provider economics do not participate in that decision.

An external governance system may compare the routed workflow with a control on representative tasks. Keep its observations separate:

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

These fields are telemetry, not protocol authority. Economic analysis may begin after verified delivery and may never convert failed work into success.
