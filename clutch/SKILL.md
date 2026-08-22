---
name: clutch
description: Route bounded implementation through a read-only frontier advisor and exact human-approved context cards before assigning work to lower-cost models. Use when a user requests model-tier routing, lower agent cost, preserved long-context coherence, or approval-gated subagents. Do not use for ordinary single-model work unless routed execution is requested or activated by project policy.
license: Apache-2.0
---

# Clutch

Use a frontier model as a read-only advisor and lower-cost models as bounded workers. Preserve coherence by transferring an approved context card, not the full conversation.

The manual-transmission metaphor is functional: neutral means no worker is engaged, the human approval gate acts as the clutch, and an exact approved card selects one bounded worker attempt.

## Phase gate

Determine the declared phase before routing:

- `PREPARE_ONLY`: design, inspect, and test the framework. The current root retains its existing authority. Do not claim routing is active, release a card to a worker, or change global configuration.
- `ACTIVE`: apply the workflow only when an exact human activation record binds the current policy. The frontier advisor becomes read-only for project artifacts.
- Missing, conflicting, or stale phase evidence is `UNKNOWN` and fails closed.

Read [protocol.md](references/protocol.md) when activating the workflow, creating a card, assigning a worker, reviewing a result, or handling a correction. Read [card-contract.md](references/card-contract.md) when drafting or validating card fields. Read [model-profiles.md](references/model-profiles.md) when selecting or changing a model mapping.

## Active workflow

1. The advisor reads the request and only the sources needed to understand it. It may analyze, search, red-team, and propose. It must not edit artifacts, execute the implementation, accept a result, publish, deploy, purchase, or widen access.
2. Classify the request as `ADVISORY_ONLY` or `EXECUTION_REQUIRED`. Answer advisory-only requests directly. For execution, draft one context card in the human-visible response.
3. Show the card ID, version, exact digest, proposed worker profile, allowed actions, forbidden actions, acceptance checks, unknowns, and stop conditions. Do not spawn or brief a worker yet.
4. Wait for a human to approve that exact card and scope. Approval of a topic, an earlier revision, or a similar card is insufficient.
5. The orchestrator that directly received the human approval runs the deterministic consistency checker. The checker returns eligibility metadata only. It never authenticates the human, exposes card content, or grants authority. If it withholds the card, stop and report the reason.
6. If the checker confirms eligibility, that same orchestrator assigns the exact approved card to the least-cost qualified worker. Use `fork_turns: "none"` by default and provide only the worker envelope, approved card, and authorized source references. Never fork the complete history. Tell the worker not to spawn children.
7. Run deterministic checks directly where possible. The worker returns artifacts and a bounded receipt. Failure does not create acceptance.
8. The advisor may review the result read-only. Any repair, retry, or model change needs a new card and new human approval. The failed result remains evidence for the next card.
9. Only the human may accept, reject, defer, or request correction. Append a new event; never rewrite an accepted record.

## Routing defaults

- One worker at a time. Use two only for human-approved, independent cards.
- Start with the `economy` profile for bounded execution. After a declared failure or capability mismatch, the advisor may propose a new `balanced` card. It is never an automatic fallback.
- The `advisor` profile never becomes an implementation worker after activation.
- Maximum worker attempts per approved card: one. Every retry requires a new card and human decision.
- Do not substitute an unavailable model silently. Return `UNKNOWN_MODEL_PROFILE` and request a mapping decision.
- Treat the target labor percentage and cost savings as measurements, not guarantees. Record tokens or cost as `UNKNOWN` when the runtime does not expose them.

## Context integrity

Cards preserve decisions, constraints, evidence anchors, unknowns, and tests. They intentionally omit conversational repetition, personality cues, private reasoning, and irrelevant history. A digest proves exact card bytes only. It does not prove that the advisor selected all relevant context or that the card is correct.

Workers may read only the approved card, worker envelope, and explicitly authorized source references. In environments where every agent shares filesystem access, this is an orchestration and instruction boundary, not hard access isolation. Use a sandbox or separate service account when technical confidentiality between agents is required.

## Deterministic consistency checker

Use `scripts/card-gate.mjs` to check the internal consistency and assignment eligibility of a policy, immutable cards, and a caller-supplied event stream. Use `scripts/release-reference.mjs` as a separately written projection of the same load-bearing decision. Both return metadata only. Run `node scripts/validate-skill.mjs` and `node scripts/verify.mjs` before activation or after changing the protocol, scripts, fixtures, or model map. The package uses only the Node standard library and installs no packages.

The checker does not authenticate an actor, persist a trusted ledger, establish that an event was written by a human, or release secret content. Human authority comes only from the direct approval observed by the trusted host conversation. The host may pass the exact approved card after the checker confirms eligibility. Never treat caller-supplied hashes as proof of identity or permission.

Agreement between the two implementations catches logic drift, but both share one runtime. Treat that as implementation diversity, not runtime diversity or a security proof.

For a packaged deployment, pin the advisor instructions, model adapter, skill, checker, reference implementation, validator, and fixtures in an implementation manifest. Bind that manifest digest into the active policy identity before recording human activation. A policy-only approval must not authorize changed implementation bytes.

The checker may mark a card eligible only when:

- the policy is `ACTIVE`;
- an exact human activation event binds the current policy digest;
- the advisor proposed the exact card digest;
- an allowed human approved that digest after proposal;
- the event sequence and hash chain are valid; and
- the card stays within concurrency, attempt, context, and model-profile limits.

Its output is always metadata-only. Anything else is withheld or rejected. Shared-filesystem instructions remain a scope boundary, not a confidentiality boundary.
