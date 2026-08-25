# Clutch phase-transition repeatability program

## The finish line

Clutch passes only when every Clutch task reaches verified delivery through every declared model transition. Cost, tokens, cache behavior, latency, and human review time are outside this decision and belong to an external governance system.

A model upgrade or downgrade is a phase change. The frozen benchmark route has three phases:

1. A read-only Sol advisor, or the one declared GPT-5.5 stress advisor, transfers an approved task package to Terra.
2. Terra performs the build step and transfers its exact state to Luna.
3. Luna integrates and verifies the result inside one unchanged Luna phase.

The first and second model transitions each have their own exact approved phase card. The Luna integration and verification steps share the Luna card because the model does not change between them. Every step records state-in and state-out digests, and the next step must consume the exact state released by the prior step.

The full-history and card arms traverse the same Terra-to-Luna worker route. The only treatment difference is the authorized context package.

## What counts as repeated

The independent unit is one fresh advisor wave, not one task or one prompt. Each wave has its own busy-session history, task variants, advisor generation, card set, cache namespace, source freeze, and approval binding.

There are fourteen primary Sol waves at each of three context intervals: 180,000, 360,000, and 660,000 pre-handoff bytes. The intervals are interleaved by an explicit frozen sequence so calendar time cannot quietly stand in for context depth. Each wave carries two task families selected by a frozen round-robin pair schedule. Across the forty-two primary waves, every one of the six families appears exactly fourteen times, four or five times at each context interval. Each family receives all three task variants, four or five times each.

Both Clutch tasks in every primary wave must reach verified delivery. The full-history arm remains a diagnostic control and cannot create or rescue a pass. With fourteen all-delivered waves in fourteen independent waves, the exact one-sided 95 percent lower bound on that context interval's repeat probability is about 0.807. That clears the declared 0.80 target without pretending the two tasks inside a wave are independent experiments.

One additional middle-interval wave uses the pinned `gpt-5.5-2026-04-23` advisor instead of Sol. It must preserve delivery for the overall result to pass, but it is a stress case only. One wave cannot establish model equivalence.

## Evidence binding

The analyzer rejects caller-supplied success booleans and aggregate totals. A completed result must bind:

- the explicit wave schedule and frozen source digest;
- task family, rotating variant, source, and hidden-test digests;
- the complete preregistered model/rank program, card-set, per-transition phase-card, and human-approval digests;
- the Terra build, Luna integration, and Luna verification calls;
- generation request and response digests, each bound to its call, state, phase card, model, provider response identity, and status;
- model phase, transition direction, state continuity, and global call and record order;
- chained call, record, stream-tip, and final-outcome digests; and
- the final hidden-test receipt and boundary-violation count.

Verified delivery is derived from those receipts. All three worker steps must complete, state must remain continuous across both model changes, every hidden assertion must pass, and the boundary-violation count must be zero.

The digest chain establishes internal byte identity and makes silent substitution, promotion, or reordering detectable. It does not authenticate the provider or prove that a claimed digest came from particular raw bytes. The execution harness must retain the exact private request and response artifacts and any authenticated provider receipts for an execution-integrity audit. Public minimized results may report their hashes without claiming raw replayability.

A transport or model failure is preserved as a failed delivery and unrelated cells continue. Generation retries are forbidden. Clutch stops for source drift, credential risk, or an unsafe execution boundary. A separate external controller may stop provider calls at its declared resource ceiling without changing completed Clutch outcomes.

## Card correction

The earlier stable-Terra failures exposed two recurring compression defects. Five routing cases lost an edge condition because the card failed to contrast a blocking rule with an ordinary route. Another case left replay cloning semantics ambiguous.

The skill now requires stable constraint tags with matching acceptance checks, the smallest useful allowed/disallowed contrast for conditional behavior, and explicit copy, replay, mutation, or identity semantics when they affect correctness. This is a targeted correction supported by observed failures, not extra prose for its own sake.

## Economics are outside Clutch

The repository keeps the study optimizer at `external-governance/plan-repeatability.mjs`. Its directory and manifest exclusion make the boundary explicit: it does not participate in the Clutch decision surface or the repeatability verdict.

The two-task rotating design is provisionally estimated at about $51.31, or about $61.58 with a 20 percent planning margin. The owner ceiling is $64. The forty-three fresh request sets do not exist yet, so this is not a construction-bound provider certificate. No paid generation may begin unless frozen request bytes, exact token counts, output ceilings, and declared rates certify the complete block at or below $64.

Run `npm run verify:repeatability` to exercise the passing fixture and adversarial fixtures covering delivery failure, matched failure, alternate-advisor failure, missing receipts, source and state tampering, phase-card tampering, contradictory external economics, call, record, or wave reordering, swapped or substituted call identities, false status promotion, altered stream tips, replayed wave or provider evidence, altered batch approval or preregistration, altered advisor release state, missing model rank, false transition direction, and altered final test receipts. Run `npm run plan:repeatability` to inspect the external provisional budget.
