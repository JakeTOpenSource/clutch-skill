# Host integration

Clutch uses one Agent Skills-compatible `clutch/` folder. Installation makes the instructions discoverable. It does not activate a policy, authenticate approval, isolate files, select a model, or dispatch a worker.

## Choose one operating mode

### `NATIVE_ROUTING`

Use this mode only when the host can start a worker in a clean context, select the approved worker profile, pass only the approved worker envelope and source references, limit the worker to one attempt, and return a receipt. The trusted host must directly observe the human approval before dispatch.

### `MANUAL_HANDOFF`

Use this mode when the harness can load the skill but cannot perform isolated model routing. After approving the exact card, the human starts a new clean session with the selected qualified model and transfers only the worker envelope, approved card, and authorized references. The human returns the worker receipt to the advisor session for read-only review.

Manual handoff preserves the context boundary by human action. It adds friction and can introduce copy errors, so verify the exact card digest at both ends. It is an instruction boundary unless the host separately enforces access controls.

### `CARD_ONLY`

Use this mode when neither native routing nor a clean manual worker session is available. The advisor may prepare a proposed card and stop. Do not claim routed execution or phase continuity.

## Capability check

Before selecting `NATIVE_ROUTING`, confirm all of these are true:

1. The advisor can remain read-only after activation.
2. A worker can start without inheriting the advisor conversation.
3. The selected model matches the approved symbolic profile.
4. The worker receives only the approved card, envelope, and authorized references.
5. One approval authorizes exactly one attempt.
6. The worker returns the fixed receipt from [card-contract.md](card-contract.md).
7. Failed checks return control to neutral without automatic retry or fallback.
8. Every model change produces a phase-transition receipt binding the prior phase, next phase, outgoing-state digest, incoming-state digest, exact approved card, and result.

If a capability is enforced only by prompting, label it `INSTRUCTION_ONLY`. If its state cannot be observed, label it `UNKNOWN`. Neither label establishes a security boundary.

## Manual handoff sequence

1. The advisor shows the complete proposed card and digest in the human-visible conversation.
2. The human approves that exact version and profile.
3. The approval observer runs the metadata-only consistency check.
4. The human opens a clean worker session, chooses the approved model profile, and sends only the approved worker package.
5. The worker makes one attempt and returns artifacts plus the fixed receipt.
6. The human brings the receipt and verification results back to the advisor session.
7. The human accepts, rejects, defers, or requests a new card.

## Project installation targets

| Harness | Project path | Discovery source |
|---|---|---|
| OpenAI Codex | `.agents/skills/clutch` | [OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills) |
| GitHub Copilot | `.agents/skills/clutch` | [GitHub Agent Skills documentation](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |
| Cursor | `.agents/skills/clutch` | [Cursor Agent Skills documentation](https://cursor.com/docs/skills) |
| Gemini CLI | `.agents/skills/clutch` | [Gemini CLI Agent Skills documentation](https://geminicli.com/docs/cli/using-agent-skills/) |
| Claude Code | `.claude/skills/clutch` | [Claude Code skills documentation](https://code.claude.com/docs/en/slash-commands) |

These paths were checked against the linked vendor documentation on 2026-08-22. Harness behavior can change. Recheck the official documentation before treating a new release as supported.

For another Agent Skills-compatible host, copy the canonical folder to its documented skill directory or use the installer's `custom` target. Do not maintain a separate protocol copy for each vendor.
