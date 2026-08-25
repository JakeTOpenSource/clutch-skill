---
name: clutch
description: Route bounded implementation through a read-only capable advisor, exact human-approved context cards, and preapproved phase fuses before assigning work across model profiles. Use for long-context model routing, measured context transfer, recoverable phase changes, or approval-gated workers. Do not use for ordinary single-model work unless routed execution is requested or activated by project policy.
license: Apache-2.0
compatibility: Agent Skills-compatible harness or manual handoff; Node.js 20 or newer is needed only for the included deterministic checks.
---

# Clutch

Use a capable model as a read-only advisor and other model profiles as bounded workers. Transfer one approved context package instead of automatically copying the full conversation. For long work, bind a finite phase plan before execution so a failed or misaligned phase can become feedback without becoming delivery. Whether a transfer is sufficient is an empirical question, not a protocol guarantee.

The manual-transmission metaphor is functional: neutral means no worker is engaged, the human approval gate controls engagement, and an exact approved card selects one bounded worker attempt. A Fuse route is an emergency platform between separately named phases. It preserves the last known-good artifact and never repeats a phase invisibly.

## Control roles

`Role Model` is the human-facing name for the designated read-only advisor. Only three policy-allowlisted roles may initiate clutch-control transitions: the Role Model proposes the exact card, the human owner activates, approves, rejects, accepts, or requests correction, and the trusted orchestrator assigns or closes the approved attempt. Workers and verifiers append result evidence only. They cannot engage, re-engage, reroute, approve, accept, or close work.

The current release requires exact human approval before assignment. A two-key fallback between the Role Model and orchestrator is only a proposed, default-off extension. Human silence is never approval. Until a future policy explicitly binds a narrow owner-delegated envelope, matching concurrence records, deterministic inactivity evidence, reversible local scope, and a human tie-break rule, disagreement or absence returns to neutral.

## Phase gate

Determine the declared phase before routing:

- `PREPARE_ONLY`: design, inspect, and test the framework. The current root retains its existing authority. Do not claim routing is active, release a card to a worker, or change global configuration.
- `ACTIVE`: apply the workflow only when an exact human activation record binds the current policy. The frontier advisor becomes read-only for project artifacts.
- Missing, conflicting, or stale phase evidence is `UNKNOWN` and fails closed.

Read [protocol.md](clutch/references/protocol.md) when activating the workflow, creating a card, assigning a worker, reviewing a result, or handling a correction. Read [fuse-protocol.md](clutch/references/fuse-protocol.md) before approving or executing a multi-phase plan. Read [card-contract.md](clutch/references/card-contract.md) when drafting or validating card fields. Read [model-profiles.md](clutch/references/model-profiles.md) when selecting or changing a model mapping. Read [host-integration.md](clutch/references/host-integration.md) when installing the skill, selecting an operating mode, or transferring a card between sessions. Read the [Pedal Protocol](clutch/references/context-fit.md) before choosing a compact, expanded, or full-context transfer. Read [evaluation.md](clutch/references/evaluation.md) before making a quality, resilience, token, cost, or portability claim.

## Active workflow

1. The advisor reads the request and only the sources needed to understand it. It may analyze, search, red-team, and propose. It must not edit artifacts, execute the implementation, accept a result, publish, deploy, purchase, or widen access.
2. Classify the request as `ADVISORY_ONLY` or `EXECUTION_REQUIRED`. Answer advisory-only requests directly. For execution, draft one context card in the human-visible response.
3. Show the card ID, version, exact digest, proposed worker profile, allowed actions, forbidden actions, acceptance checks, unknowns, and stop conditions. For long work, also show one finite phase plan with exact phase contracts, transfer levels, emergency routes, and maximum fuse uses. Do not spawn or brief a worker yet.
4. Wait for a human to approve that exact card and, when present, the exact phase-plan digest. Approval of a topic, an earlier revision, a similar card, or an unlisted route is insufficient.
5. The trusted host or human operator that directly observed the approval runs the deterministic consistency checker. The checker confirms that the Role Model, human, and orchestrator identities are declared in the policy. It returns bounded metadata such as hashes, state, status, and profile. It does not authenticate an actor, return raw card fields, or grant authority. If it withholds the card, stop and report the reason.
6. If the host implements the experimental [Pedal Protocol](clutch/references/context-fit.md), test transfer levels from smallest to largest and require `FIT` for the exact task, projector, receipt, and registered requirements. `HOLD` or `UNKNOWN` returns to neutral. If only `FULL_CONTEXT` fits, use it without claiming compression. A fit result is structural admissibility only and does not replace approval.
7. Select the operating mode from [host-integration.md](clutch/references/host-integration.md). In `NATIVE_ROUTING`, the host starts one clean worker context. In `MANUAL_HANDOFF`, the human starts a clean worker session. In either mode, provide only the worker envelope, exact approved card, and authorized source references. Do not transfer the advisor conversation or let the worker spawn children. In `CARD_ONLY`, stop after the proposed card.
8. Run deterministic checks directly where possible. The worker returns artifacts and a bounded receipt. Failure does not create acceptance. For a phase plan, append one `phase-receipt.v1` and run the Fuse gate before any next phase.
9. The advisor may review the result read-only. Without an approved phase plan, any repair, retry, or model change needs a new card and human approval. With an exact approved plan, the host may consume one forward-only `REPAIR`, `TRANSFER`, or `EVACUATE` route. The failed candidate and fix log remain evidence, the last admissible artifact remains unchanged, and the same phase cannot run again.
10. Only the human may accept, reject, defer, or request correction. Append a new event; never rewrite an accepted record.

## Routing defaults

- One worker at a time. Use two only for human-approved, independent cards.
- Prefer `NATIVE_ROUTING` when the host can enforce a clean worker context. Use `MANUAL_HANDOFF` when the human can create that boundary explicitly. Use `CARD_ONLY` when neither is available.
- Start with the card's approved profile. A different profile may run only in a new human-approved card or a separately named phase already bound into the exact approved Fuse plan. There is no implicit fallback.
- The `advisor` profile never becomes an implementation worker after activation.
- The orchestrator must be named in `orchestrator_actor_ids`. A nonempty but undeclared coordinator ID is invalid.
- Workers and verifiers have no clutch-control authority.
- Maximum worker attempts per phase: one. A simple card contains one phase. A long-task card may contain several distinct, forward-only phases approved up front. Repeating a phase, reusing an attempt ID, or inventing a route is invalid.
- Do not substitute an unavailable model silently. Return `UNKNOWN_MODEL_PROFILE` and request a mapping decision.
- Treat the target labor percentage and cost savings as measurements, not guarantees. Record tokens or cost as `UNKNOWN` when the runtime does not expose them.

## Context integrity

Cards are intended to carry decisions, constraints, evidence anchors, unknowns, and tests. They intentionally omit conversational repetition, personality cues, private reasoning, and material judged irrelevant to the task. A digest proves exact card bytes only. It does not prove that the advisor selected all relevant context or that the card is correct.

Workers may read only the approved card, worker envelope, and explicitly authorized source references. In environments where every agent shares filesystem access, this is an orchestration and instruction boundary, not hard access isolation. Use a sandbox or separate service account when technical confidentiality between agents is required.

## Deterministic consistency checker

Use `scripts/card-gate.mjs` to check the internal consistency and assignment eligibility of a policy, immutable cards, and a caller-supplied event stream. Use `scripts/release-reference.mjs` as a separately written projection of the same load-bearing decision. For multi-phase execution, use `scripts/fuse-gate.mjs` and its independent `scripts/fuse-reference.mjs` projection. Run `node scripts/validate-skill.mjs`, `node scripts/verify.mjs`, and `node scripts/verify-fuses.mjs` before activation or after changing the protocol, scripts, fixtures, or model map. All reducers return metadata only. The package uses only the Node standard library and installs no packages.

The checker does not authenticate an actor, persist a trusted ledger, establish that an event was written by a human, or release secret content. Human authority comes only from the direct approval observed by the trusted host conversation. The host may pass the exact approved card after the checker confirms eligibility. Never treat caller-supplied hashes as proof of identity or permission.

Agreement between the two implementations catches logic drift, but both share one runtime. Treat that as implementation diversity, not runtime diversity or a security proof.

For a packaged deployment, pin the advisor instructions, model adapter, skill, checker, reference implementation, validator, and fixtures in an implementation manifest. The policy must declare that manifest digest, and its policy ID must bind the same digest before human activation is recorded. The local release verifier checks the bundled example. The generic lifecycle checker verifies only that caller-supplied declarations agree; a trusted host must establish that the declared digest belongs to the bytes it actually loaded.

The checker may mark a card eligible only when:

- the policy is `ACTIVE`;
- an exact human activation event binds the current policy digest;
- the advisor proposed the exact card digest;
- an allowed human approved that digest after proposal;
- an allowed orchestrator performs assignment and closure;
- the event sequence and hash chain are valid; and
- the card stays within concurrency, attempt, context, and model-profile limits.

Its output is bounded to hashes, state, status, and approved profile. Hashes can still disclose equality and are not confidentiality protection. Raw card fields are withheld. Shared-filesystem instructions remain a scope boundary, not a confidentiality boundary.

## Evidence discipline

Run the deterministic package checks for every change. Before any model-in-the-loop comparison, freeze the four-condition design in [evaluation.md](clutch/references/evaluation.md), including the task population, versions, quality tolerance, named harm and reviewer-error gates, sample and power rule, full cost accounting, and analysis. Bind results to the exact frozen preregistration digest. Judge quality before cost. If the quality comparison is not authorized, preserve descriptive telemetry but name no efficiency winner. A lower sample mean is not enough; the frozen uncertainty rule must also pass.

Current public evidence is limited to local synthetic conformance, byte projection, one low-power six-round pilot, and one registered-domain projection experiment with its failed predecessor preserved. These results do not establish general savings, semantic card completeness, human-review effectiveness, production readiness, or security.
