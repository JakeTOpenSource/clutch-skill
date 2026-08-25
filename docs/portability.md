# Cross-harness use

Clutch now has one canonical Agent Skills folder and two project installation projections. Codex, GitHub Copilot, Cursor, and Gemini CLI share `.agents/skills/clutch`. Claude Code uses `.claude/skills/clutch`.

## Install safely

Run the installer from this repository. It copies the canonical `clutch/` folder and verifies every copied byte. Serialized local installs use an exclusive sibling lock, recheck the destination before commit, and refuse known drift.

```text
node scripts/install-skill.mjs --harness codex --project path/to/project
node scripts/install-skill.mjs --harness github-copilot --project path/to/project
node scripts/install-skill.mjs --harness cursor --project path/to/project
node scripts/install-skill.mjs --harness gemini-cli --project path/to/project
node scripts/install-skill.mjs --harness claude-code --project path/to/project
```

Preview without writing:

```text
node scripts/install-skill.mjs --harness codex --project path/to/project --dry-run
```

Check an existing installation against the canonical source:

```text
node scripts/install-skill.mjs --harness codex --project path/to/project --check
```

For another harness with a documented skills directory:

```text
node scripts/install-skill.mjs --harness custom --project path/to/project --destination .vendor/skills/clutch
```

The custom destination must stay inside the selected project and end in `clutch`. The installer has no force mode. Update a changed installation deliberately after reviewing its local differences.

The lock coordinates Clutch installers that follow this protocol. It is not a hostile-filesystem transaction against unrelated processes. A crashed installer can leave `.clutch-install.lock` beside the destination. Confirm that no install is running before removing a stale lock manually.

## What works everywhere

The portable core defines the state machine, card contract, role boundaries, one-attempt rule, failure return, symbolic model profiles, and metadata-only consistency check. A human can also use manual handoff between a full-context advisor session and a clean qualified-worker session.

## What remains host-specific

Each harness decides how skills are discovered, which models are available, whether a worker can receive a clean context, how read-only access is enforced, and whether token or cost telemetry is exposed. Clutch cannot create those capabilities from instructions alone.

Use `NATIVE_ROUTING` only when the host supplies the required isolation and dispatch controls. Use `MANUAL_HANDOFF` when a human can open the clean worker session. Otherwise use `CARD_ONLY` and stop after planning. See [`host-integration.md`](../clutch/references/host-integration.md) for the exact capability check.

## Verification ceiling

`npm test` checks both installation projections in temporary directories, confirms idempotent installs, rejects drift and path escapes, and verifies that every installed byte matches the canonical skill. This demonstrates local packaging behavior. It does not prove that every vendor version will discover the skill, obey its instructions, select the intended model, or save money on a real task.
