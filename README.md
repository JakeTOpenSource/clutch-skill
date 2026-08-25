# Clutch

Clutch is a human-approved model-routing protocol and Agent Skill for long-context work. A capable advisor keeps the full conversation and performs high-value judgment. A human approves one bounded task card. For long work, the same approval can bind a finite phase plan with explicit emergency routes. Other model profiles receive only the context authorized for their current phase.

The capable advisor is the `Role Model`. Clutch control is restricted to three policy-allowlisted roles: the Role Model proposes, the human governs approval and acceptance, and the trusted orchestrator assigns and closes. Workers and verifiers return evidence but cannot operate the clutch.

The canonical skill follows the open Agent Skills folder format. The same source can now be installed for OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI, Claude Code, or another compatible harness without maintaining separate protocol copies.

![Three-state Clutch workflow](visuals/manual-transmission-human-loop.png)

## Current status

Version `0.4.0-rc.1` remains a local `PREPARE_ONLY` research release candidate. Installing the skill makes its instructions discoverable. It does not activate routing, make an advisor read-only, authenticate a human, isolate a filesystem, select a model, or authorize a worker.

Activation requires a separate human decision in a trusted host that binds an exact policy and implementation digest. The included checker validates canonical hashes, event order, declared roles, declared implementation binding, limits, and lifecycle eligibility over caller-supplied JSON. It cannot establish that the supplied implementation digest belongs to the bytes the host loaded. Its output is bounded to hashes, status, state, and profile.

## How it works

Clutch has three visible states:

1. `NEUTRAL`: the advisor holds full context and no worker runs.
2. `APPROVE CARD`: a human reviews the exact scope, constraints, sources, checks, and model profile.
3. `ENGAGED`: the approved card moves to one qualified worker for one attempt.

A simple card permits one attempt and returns to neutral after a failed check. A long-task card may include an exact human-approved Fuse plan. Each phase still gets one attempt, but a failed or misaligned phase can transfer its hash-linked feedback to a separately named repair or worker phase already in that plan. The failed candidate never becomes accepted state, and the same phase cannot run twice. Missing or undeclared routes hold neutral. Worker success still requires verification and human acceptance. Human silence does not count as new approval.

Read [`fuse-protocol.md`](clutch/references/fuse-protocol.md) for the phase contract, reason-to-route rules, receipts, and accounting boundary.

The experimental [Pedal Protocol](clutch/references/context-fit.md) chooses transfer depth. It tests a compact card, an expanded card with selected state or evidence, and full authorized context, then chooses the smallest registered fit. Full context is allowed when compression would break coherence, but that route makes no compression claim.

An experimental context-fit gate adds a host-side quality-control check before assignment. It binds the exact task recipe, projection code, and resulting receipt. A structural fit does not prove that a card is complete or correct. See [`context-fit.md`](clutch/references/context-fit.md).

Clutch supports three operating modes:

- `NATIVE_ROUTING`: the host creates a clean worker context and passes only the approved worker package.
- `MANUAL_HANDOFF`: the human opens a clean lower-cost worker session and transfers the approved package.
- `CARD_ONLY`: the advisor prepares a card and stops because no clean worker boundary is available.

Read [`host-integration.md`](clutch/references/host-integration.md) for the capability check and exact boundaries.

## Install for a project

Requirements: Node.js 20 or newer for the installer and local checks. The skill itself is plain Markdown and supporting files.

Codex, GitHub Copilot, Cursor, and Gemini CLI use the shared Agent Skills project path:

```text
node scripts/install-skill.mjs --harness codex --project path/to/project
node scripts/install-skill.mjs --harness github-copilot --project path/to/project
node scripts/install-skill.mjs --harness cursor --project path/to/project
node scripts/install-skill.mjs --harness gemini-cli --project path/to/project
```

Claude Code uses its project skill path:

```text
node scripts/install-skill.mjs --harness claude-code --project path/to/project
```

The installer verifies every copied byte. Serialized local installs use an exclusive sibling lock and refuse known drift. Use `--dry-run` to preview or `--check` to compare an existing installation. See [`docs/portability.md`](docs/portability.md) for custom targets and the verification ceiling.

## Verify the repository

There are no package dependencies and no package-install step.

```text
npm test
npm run verify:fuses
```

The command verifies:

- the Agent Skills structure and optional Codex UI metadata;
- exact equivalence between `Clutch-Skill.md` and the canonical `clutch/SKILL.md`, apart from path-aware links;
- both project installation layouts across five documented harnesses;
- idempotent installation plus rejection of drift and path escape attempts;
- rejection of a second compliant installer while the destination is locked;
- the `PREPARE_ONLY` phase and zero released cards;
- the example policy's declared binding to the packaged implementation manifest;
- 30 positive and adversarial assignment/lifecycle fixtures against two independently written reducers;
- 48 phase and Fuse cases, including 29 hostile mutations and 19 valid journeys, against a primary reducer and independently written projection;
- stopped journeys that preserve failed candidates, fix logs, and attempted usage when a Fuse or transfer limit is exhausted;
- explicit `UNKNOWN` telemetry that cannot collapse to zero, with efficiency eligibility restricted to verified delivery plus complete telemetry;
- strict safety, authority, contract, observation, and transport failures that cannot be laundered through a generic phase-mismatch repair route;
- worker result and verification receipt binding, rejection of false promotion from worker failure to verifier pass, and a closable path for verified non-delivery;
- bounded hash/status/profile output with field-by-field canary checks for the tested projections;
- the evaluation claim ledger, blocked preregistration, 20 analyzer branch and rejection cases, minimized pilot arithmetic, and preserved negative result;
- the deterministic visual state sequence and pinned image hashes; and
- every release file against an explicit allowlist and `release-manifest.json`.

A passing result establishes local synthetic conformance and exact package projection for the checked bytes. It does not establish vendor runtime behavior, secure identity, trusted persistence, model quality, card completeness, actual token savings, human-review effectiveness, or production readiness.

## Efficiency claim

Clutch may reduce repeated context only when the worker starts clean and receives a smaller approved package than the advisor history. A lower-priced worker can create a second possible benefit. Both effects must be measured against an all-frontier baseline on representative tasks.

Clutch guarantees no savings. Short tasks, human review time, omitted context, repairs, or host routing overhead can erase the benefit. Every phase cost remains charged. Cost and time count as successful system efficiency only when the final artifact passes its registered destination checks. Exploratory runs record unavailable telemetry as `UNKNOWN`. The formal comparison rejects incomplete required telemetry and names a reduction only when the quality gate passes and the upper endpoint of its frozen 95 percent interval is below zero.

## Evidence so far

One preregistered six-round local pilot observed six accepted artifacts in the Clutch arm and five in the direct growing-context arm. The Clutch route recorded 449,319 raw input-plus-output tokens versus 1,031,809 for the direct route, and 365,113 prompt bytes versus 1,581,508. It also took longer in aggregate: 492,824 milliseconds versus 428,231.

Those are descriptive readings from one low-power pilot. The direct arm failed its preregistered quality bar while the Clutch arm passed, so the study's own rule prohibited naming an efficiency winner. The raw prompts and private workspaces are not bundled; the repository includes only a minimized evidence snapshot and source digests.

A separate local projection experiment exhaustively tested 512 subsets of nine registered host-manifest fields. Its first, smaller result failed corrective cases. The corrected result selected three digests at 431 bytes versus 864 bytes for all fields, with no change to the 867-byte worker board. This establishes only a minimum inside that frozen synthetic domain.

Read [`evaluation/README.md`](evaluation/README.md) for the four-condition study and five reported contrasts covering model configuration, automatic card transformation, human approval, Clutch versus a full-context worker, and the complete route. The [Stage 0 acceptance record](evaluation/owner-acceptance-stage-0.json) authorizes preparation only. The [preparation receipt](evaluation/stage-0-preparation-receipt.json) binds five private synthetic task workspaces, telemetry fixtures, and hard resource stops while withholding hidden checks and model-run authority. The supplied preregistration remains visibly blocked until a live telemetry preflight and separate run authorization are recorded.

The current GitHub publication gate is documented in [`docs/release-gate.md`](docs/release-gate.md). This candidate stops before any push, tag, or release.

The next empirical step is proposed, not authorized, in [`evaluation/OWNER-DECISION-PACKET.md`](evaluation/OWNER-DECISION-PACKET.md). Its deterministic [study proposal](evaluation/study-proposal.json) treats one 30-minute build as one independent task, exposes the sample-size tradeoff, and keeps both model execution and GitHub publication disabled.

## Repository map

```text
Clutch-Skill.md               Human-facing mirror of the canonical skill
clutch/                       Canonical Agent Skills-compatible source
clutch/references/            Protocol, card, model, and host integration rules
clutch/scripts/               Node-only card and Fuse reducers, references, and fixtures
examples/                     Executable hash-linked Fuse input example
adapters/harness-targets.json Two deterministic project installation layouts
scripts/install-skill.mjs     Non-overwriting cross-harness installer
scripts/verify-portability.mjs Installer and projection adversarial checks
AGENTS.example.md             Example project policy, inactive by default
policy.example.json           Manifest-bound PREPARE_ONLY policy
model-map.example.json        One symbolic model-profile adapter example
evaluation/                    Claim ledger, owner proposal, preregistration, minimized evidence, and checks
release-files.json             Explicit release and implementation allowlists
docs/release-gate.md           Remaining owner decisions and GitHub stop condition
implementation-manifest.json  Exact executable decision-surface receipts
release-manifest.json         Exact repository release receipts
visuals/                      Deterministic metaphor, source assets, and checks
```

## License

The original contents of this repository are licensed under the [Apache License 2.0](LICENSE). The license permits use, modification, distribution, and commercial use subject to its terms, including preservation of the license and prominent notices on modified files. Apache-2.0 also includes an express patent license from contributors for qualifying contribution claims.

No `NOTICE` file is included because this release carries no required third-party attribution notices. Add and preserve one if future bundled material requires it. This licensing summary is practical project documentation, not legal advice.
