# Clutch

Clutch is a human-approved model-routing skill for long-context agent work. A capable advisor keeps the full conversation and performs high-value judgment. A human approves one compact task card. A lower-cost worker receives that card for one bounded attempt.

The canonical skill follows the open Agent Skills folder format. The same source can now be installed for OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI, Claude Code, or another compatible harness without maintaining separate protocol copies.

![Three-state Clutch workflow](visuals/manual-transmission-human-loop.png)

## Current status

This repository remains a `PREPARE_ONLY` reference implementation. Installing the skill makes its instructions discoverable. It does not activate routing, make an advisor read-only, authenticate a human, isolate a filesystem, select a model, or authorize a worker.

Activation requires a separate human decision in a trusted host that binds an exact policy and implementation digest. The included checker validates canonical hashes, event order, declared roles, limits, and lifecycle eligibility over caller-supplied JSON. Its output is metadata only.

## How it works

Clutch has three visible states:

1. `NEUTRAL`: the advisor holds full context and no worker runs.
2. `APPROVE CARD`: a human reviews the exact scope, constraints, sources, checks, and model profile.
3. `ENGAGED`: the approved card moves to one qualified worker for one attempt.

A failed check returns the workflow to neutral. Repair, retry, or model escalation requires a new card and new human approval. Worker success still requires verification and human acceptance.

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
```

The command verifies:

- the Agent Skills structure and optional Codex UI metadata;
- exact equivalence between `Clutch-Skill.md` and the canonical `clutch/SKILL.md`, apart from path-aware links;
- both project installation layouts across five documented harnesses;
- idempotent installation plus rejection of drift and path escape attempts;
- rejection of a second compliant installer while the destination is locked;
- the `PREPARE_ONLY` phase and zero released cards;
- the policy binding to the implementation manifest;
- 26 positive and adversarial lifecycle fixtures against two independently written reducers;
- metadata-only release output with no card-content leakage in the tested projections;
- the public preregistration extract, minimized outcome table, statistical replay, study receipt, and claim ceiling;
- the deterministic visual state sequence and pinned image hashes; and
- every release file against `release-manifest.json`.

A passing result establishes local synthetic conformance and exact package projection for the checked bytes. It does not establish vendor runtime behavior, secure identity, trusted persistence, model quality, card completeness, actual token savings, or production readiness.

## Efficiency claim

Clutch reduces repeated context only when the worker starts clean and receives a smaller approved package than the advisor history. A lower-priced worker can create a second source of savings. Both effects must be measured against an all-frontier baseline on representative tasks.

Clutch guarantees no savings. Short tasks, human review time, omitted context, retries, or host routing overhead can erase the benefit. When a harness does not expose token or cost telemetry, record savings as `UNKNOWN`.

## Measured v2 result

One preregistered fixed synthetic long-context benchmark completed 241 provider requests with no retries. After allocating the advisor charge, approved cards reduced raw input by 95.93 percent on stable Terra and 95.94 percent on a Terra-to-Luna handoff. Both routes lowered provider cost and passed the declared 10 percentage point average-quality noninferiority margin in the minimized public outcome replay.

Stable-Terra cards averaged 4.44 percentage points below full history after handoff, and only 9 of 15 card-routed tasks were fully correct at the final phase versus 15 of 15 with full history. Terra-to-Luna cards averaged 2.30 points above full history, with 13 of 15 fully correct versus 10 of 15. The separate model-switch protection endpoint remained neutral or unresolved.

This is evidence from fifteen synthetic tasks and one advisor realization. It is neither a production benchmark nor a universal savings claim. Human review time was not monetized. The public package can recompute the reported statistics, but it cannot rescore the withheld raw model responses or reestablish private execution integrity. Read the [plain-English evaluation](docs/evaluation-v2.md) and inspect the [machine-readable evidence](evidence/clutch-v2-confirmatory-001/research-summary.json).

## Repository map

```text
Clutch-Skill.md               Human-facing mirror of the canonical skill
clutch/                       Canonical Agent Skills-compatible source
clutch/references/            Protocol, card, model, and host integration rules
clutch/scripts/               Node-only checker, reference reducer, and fixtures
adapters/harness-targets.json Two deterministic project installation layouts
scripts/install-skill.mjs     Non-overwriting cross-harness installer
scripts/verify-portability.mjs Installer and projection adversarial checks
scripts/verify-evaluation.mjs  Public evidence and claim-boundary checks
scripts/recompute-evaluation.mjs Public statistical replay from minimized outcomes
evidence/                      Preregistration extract, outcomes, summary, and receipt
AGENTS.example.md             Example project policy, inactive by default
policy.example.json           Manifest-bound PREPARE_ONLY policy
model-map.example.json        One symbolic model-profile adapter example
implementation-manifest.json  Exact executable decision-surface receipts
release-manifest.json         Exact repository release receipts
visuals/                      Deterministic metaphor, source assets, and checks
```

## License

The original contents of this repository are licensed under the [Apache License 2.0](LICENSE). The license permits use, modification, distribution, and commercial use subject to its terms, including preservation of the license and prominent notices on modified files. Apache-2.0 also includes an express patent license from contributors for qualifying contribution claims.

No `NOTICE` file is included because this release carries no required third-party attribution notices. Add and preserve one if future bundled material requires it. This licensing summary is practical project documentation, not legal advice.
