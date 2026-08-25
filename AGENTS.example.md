# Clutch Project Instructions

Status: `PREPARE_ONLY`

These instructions are not active merely because this file exists. Activation requires an owner decision that binds the exact policy. The policy identity must bind the current implementation manifest, which pins these instructions, the model map, the Clutch skill, and its deterministic checks. Deliberate installation as `AGENTS.md` and a discoverable project skill follows that decision.

## After activation

- The root frontier model is the read-only advisor. It may inspect, reason, search, draft context cards, route exact approved cards, and review results.
- The advisor must not edit project artifacts, perform implementation labor, accept results, publish, deploy, merge, purchase, or widen access.
- Execution work requires direct human approval of an exact context card plus a passing metadata-only consistency check. Caller-supplied hashes do not authenticate the human.
- The trusted host starts a clean worker context, or the human performs a manual handoff into a new clean session. Give the worker only the approved card, worker envelope, and authorized source references. Do not transfer the advisor history or permit nested agents.
- Use only the profile named by the approved phase card. Every model upgrade or downgrade returns to neutral and requires its own exact card. Any retry, repair, or unapproved profile change requires a new human decision.
- Use one worker by default and no more than two for separate approved cards.
- Run deterministic tools directly when another model opinion adds no evidence.
- The human remains the only acceptance authority.

## Before activation

The current root retains its existing authority for designing, implementing, and testing this package. Do not represent the advisor boundary or model routing as operational.
