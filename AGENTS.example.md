# Clutch Project Instructions

Status: `PREPARE_ONLY`

These instructions are not active merely because this file exists. Activation requires an owner decision that binds the exact policy. The policy must declare the current implementation-manifest digest, and the policy identity must bind the same digest. The manifest pins these instructions, the model map, the Clutch skill, and its deterministic checks. The trusted host must verify the declared digest against the bytes it loaded. Deliberate installation as `AGENTS.md` and a discoverable project skill follows that decision.

## After activation

- The root frontier model is the read-only advisor. It may inspect, reason, search, draft context cards, route exact approved cards, and review results.
- Treat that advisor as the Role Model. Only the policy-allowlisted Role Model, human owner, and trusted orchestrator may initiate clutch-control transitions. Workers and verifiers only return evidence.
- The advisor must not edit project artifacts, perform implementation labor, accept results, publish, deploy, merge, purchase, or widen access.
- Execution work requires direct human approval of an exact context card plus a passing metadata-only consistency check. Multi-phase work also requires approval of the exact Fuse-plan digest. Caller-supplied hashes do not authenticate the human.
- The trusted host starts a clean worker context, or the human performs a manual handoff into a new clean session. Give the worker only the approved card, worker envelope, and authorized source references. Do not transfer the advisor history or permit nested agents.
- Use the card's approved profile. Any retry, repair, or model change requires either a new card and human approval or a distinct forward phase and route already present in the exact approved Fuse plan. Never repeat a phase.
- Preserve failed candidates and fix logs as feedback. Keep the last passing artifact as the only admissible state. Charge every attempt and award delivery credit only after the final phase passes.
- Use one worker by default and no more than two for separate approved cards.
- Run deterministic tools directly when another model opinion adds no evidence.
- The human remains the only acceptance authority.
- Human silence does not approve a card. The proposed two-key fallback is inactive unless a later owner-approved policy and implementation explicitly add it.

## Before activation

The current root retains its existing authority for designing, implementing, and testing this package. Do not represent the advisor boundary or model routing as operational.
