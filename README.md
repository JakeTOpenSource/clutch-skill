# Clutch

Clutch is a human-approved model-routing skill for long-context agent work. A frontier advisor keeps the full conversation and performs high-value judgment. A human approves one compact task card. A lower-cost worker receives that card for one bounded attempt.

![Three-state Clutch workflow](visuals/manual-transmission-human-loop.png)

## Current status

This repository is a `PREPARE_ONLY` reference implementation. Its files do not activate routing, make the advisor read-only, or authorize a worker. Activation requires a separate human decision in a trusted host that binds an exact policy and implementation digest.

The included checker is deliberately modest. It validates canonical hashes, event order, declared roles, limits, and lifecycle eligibility over caller-supplied JSON. It does not authenticate a human, secure a shared filesystem, create durable append-only storage, or decide that work is correct.

## Why it exists

Long sessions become expensive and noisy when every worker receives the full history. Clutch keeps that history with the advisor and transfers the smallest human-approved context that can support a testable task. This can reduce worker-context volume and move routine execution to a cheaper model. It guarantees no savings. Short tasks, retries, card omissions, or routing overhead can erase the benefit.

The workflow has three visible states:

1. `NEUTRAL`: the advisor holds full context and no worker runs.
2. `APPROVE CARD`: a human reviews the exact scope, constraints, sources, checks, and model profile.
3. `ENGAGED`: the trusted host sends that exact card to one qualified worker for one attempt.

A failed check returns the workflow to neutral. Repair, retry, or model escalation requires a new card and new human approval. Worker success still requires verification and human acceptance.

## Verify the repository

Requirements: Git and Node.js 20 or newer. There are no package dependencies and no install step.

```text
npm test
```

The command verifies:

- the required Codex skill structure and UI metadata;
- content equivalence between `Clutch-Skill.md` and `clutch/SKILL.md`, allowing only the relative link prefix needed at each location;
- the `PREPARE_ONLY` phase and zero released cards;
- the policy binding to the implementation manifest;
- 26 positive and adversarial lifecycle fixtures against two independently written reducers;
- metadata-only release output with no card-content leakage in the tested projections;
- the deterministic visual state sequence and pinned image hashes; and
- every release file against `release-manifest.json`.

A passing result establishes local synthetic conformance for the exact checked bytes. It does not establish secure identity, trusted persistence, model quality, completeness of a context card, actual token savings, or production readiness.

## Use the skill

The installable skill lives in [`clutch/`](clutch/). Codex requires the canonical entry point to remain named [`SKILL.md`](clutch/SKILL.md). [`Clutch-Skill.md`](Clutch-Skill.md) is the human-facing copy requested for sharing. It is generated from the canonical skill with only the relative link prefix changed so both locations work on GitHub.

Copying the folder into a supported skills directory makes the skill discoverable. It does not activate the example policy. Read [`clutch/references/protocol.md`](clutch/references/protocol.md) before adapting the framework to a real host.

## Repository map

```text
Clutch-Skill.md              Human-facing skill specification
clutch/SKILL.md              Canonical installable skill entry point
clutch/references/           Protocol, card contract, and model profiles
clutch/scripts/              Node-only checker, reference reducer, and tests
AGENTS.example.md            Example project policy, inactive by default
policy.example.json          Manifest-bound PREPARE_ONLY policy
model-map.example.json       Symbolic model-profile adapter
implementation-manifest.json Exact executable decision-surface receipts
release-manifest.json        Exact repository release receipts
scripts/                     Manifest maintenance and repository verifier
visuals/                     Deterministic metaphor, source assets, and checks
```

## License

The original contents of this repository are licensed under the [Apache License 2.0](LICENSE). The license permits use, modification, distribution, and commercial use subject to its terms, including preservation of the license and prominent notices on modified files. Apache-2.0 also includes an express patent license from contributors for qualifying contribution claims.

No `NOTICE` file is included because this release carries no required third-party attribution notices. Add and preserve one if future bundled material requires it. This licensing summary is practical project documentation, not legal advice.
