# Clutch evaluation kit

This directory turns Clutch from a plausible workflow into a falsifiable system hypothesis. It does not claim that Clutch saves money, preserves all relevant context, improves quality, or creates a security boundary. It defines the tests required before any of those narrower claims may be made.

## Current state

Status: `DRAFT_OWNER_APPROVAL_REQUIRED`

The deterministic repository checks are runnable now. A new model-in-the-loop study is not authorized until an owner freezes the task population, model versions and settings, quality tolerance, sample size or power analysis, price source, and human-review accounting in `preregistration.example.json`.

The [owner decision packet](OWNER-DECISION-PACKET.md) and [machine-readable proposal](study-proposal.json) recommend a five-task instrumentation shakedown followed by a separately powered confirmatory study. The separate [Stage 0 acceptance record](owner-acceptance-stage-0.json) approves preparation of that shakedown while withholding model-run and publication authority. The six five-minute transitions inside one 30-minute build are treated as repeated state changes within one task, not six independent samples. The proposed two-key delegation path remains default-off and outside the four-arm study. The Pedal Protocol runs in shadow mode only, recording the transfer level it would choose without changing a condition.

The minimized [Stage 0 preparation receipt](stage-0-preparation-receipt.json) now binds five private synthetic task workspaces and their six-transition prompt streams by digest. The answer-bearing hidden checks remain outside this release candidate. The private scorer rejects every starter and accepts its registered oracle across 20 checks. Its telemetry parser accepts two complete synthetic records and rejects five malformed or over-budget records. Live provider capture, invoice reconciliation, model calls, and outcome claims remain untested or unauthorized.

The included evidence files are minimized snapshots of earlier local pilots. Their source hashes are retained, but their raw prompts, transcripts, and private workspaces are not published. They are preliminary observations, not replication packages.

## What to test

Use the same frozen tasks in four matched conditions:

1. `FRONTIER_FULL_CONTEXT`: a capable model receives full context and completes the task.
2. `WORKER_FULL_CONTEXT`: the proposed lower-cost worker receives the same full context. This isolates model-capability loss.
3. `WORKER_AUTO_CARD`: the worker receives an automatically generated card without human correction. This measures the whole automatic card transformation, including compression, reorganization, generation effects, and omission.
4. `WORKER_APPROVED_CARD`: the worker receives the exact human-approved card. This tests the complete Clutch route.

Each condition gets one worker attempt. Freeze the workspace, task order, tools, permissions, time limit, model settings, and executable checks before any run. Randomize or counterbalance condition order. Keep task classes visible rather than hiding a failed high-risk class inside an aggregate.

## Decision order

Quality is primary. Efficiency is conditional.

Compare `WORKER_APPROVED_CARD` with both `FRONTIER_FULL_CONTEXT` and `WORKER_FULL_CONTEXT` using the same predeclared paired non-inferiority margin. Count first-pass success, critical defects, context omissions, scope violations, unsupported claims, unauthorized clutch transitions, and hidden-check results. The quality gate requires both reference comparisons to pass. If either fails or remains statistically unresolved, do not name an efficiency winner.

Only after the quality gate passes may the report compare total tokens, prompt bytes, provider charges, elapsed time, retries, and human review time. Report the approved-card route against both the full-context worker and the frontier-full route. Report cached and uncached tokens separately. Every condition's provider totals must reconcile with planning-and-card, execution, model-verification, and other components. A price-sheet estimate is not an invoice, and unpriced human time is not zero.

The analyzer reports five frozen pairwise contrasts. Frontier versus worker-full measures the model-and-setting change. Worker-full versus auto-card measures the automatic card transformation. Auto-card versus approved-card measures the reviewed-card intervention. Worker-full versus approved-card directly tests Clutch against an ordinary full-context model switch. Frontier versus approved-card measures the complete route against leaving the frontier model engaged. A failed diagnostic arm remains visible, so the card, model, and reviewer cannot silently receive each other's credit or blame.

## Test ladder

The release gate has five layers:

- Deterministic conformance: schema, canonicalization, event order, lifecycle, one-attempt transitions, declared Role Model, human, and orchestrator identities, and dual-reducer agreement.
- Boundary and mutation tests: stale policy, changed implementation declaration, replayed approval, card mutation, role collision, undeclared orchestrator, worker clutch-control attempt, forbidden fallback, field canaries, path escape, and unmanifested release files.
- Behavioral task tests: executable or blinded rubric checks on frozen tasks, including short tasks where Clutch is expected to lose.
- Robustness tests: growing context, distractors, contradictions, source changes after approval, model transitions, tool failures, and hostile source instructions.
- Human approval tests: false approvals, false rejections, decision time, confidence calibration, and reviewer agreement. No claim about human effectiveness is allowed until actual reviewers are studied.

## Statistics

There is no universal minimum sample size. Set the acceptable quality loss first, estimate the baseline and paired discordance, then run a power calculation or simulation. Tasks are the independent units; repeated stochastic seeds are sensitivity checks, not extra tasks.

For paired binary success, report the paired risk difference and a one-sided 95 percent confidence bound against the predeclared non-inferiority margin. The packaged reference analyzer fixes both declared alpha values at 0.05, requires the exact frozen sample size and minimum stratum size, and refuses to run without a recorded power-analysis or simulation digest. Its task-stratified percentile bootstrap remains a reference calculation, not statistical certification. For cost and latency, report paired, task-stratified 95 percent intervals. For zero observed critical failures, report an exact one-sided upper confidence bound rather than saying the failure rate is zero.

The frozen preregistration must name each critical harm, set event thresholds, define reviewer false-approval and false-rejection limits, freeze the task index, and state how human review time is valued. Results record cached input, uncached input, output tokens, provider charge, latency, review time, reviewer decisions, confidence, and reference decisions. Total cost includes the recorded provider charge plus the frozen value of review time. A negative sample mean is insufficient: the upper endpoint of the frozen 95 percent interval must also be below zero before the analyzer names a lower-cost or lower-token route.

## Reproduce the packaged checks

From the repository root:

```text
npm run verify:evaluation
npm run verify:stage0-acceptance
npm run verify:stage0-preparation
npm run verify:study-proposal
npm test
```

The first command checks the claim ledger, the deliberately incomplete preregistration, the minimized evidence arithmetic, the preserved negative result, public-language ceilings, and 20 synthetic analyzer branches and rejection cases. Those cases include a forged preregistration hash, inflated alpha, an undersized sample, a changed task index, missing or unreconciled cost data, a failed auto-card arm, a failed critical stratum, a false human approval, an unauthorized clutch transition, control bypasses, an unbalanced declared order, and zero- and nonzero-harm bounds. It does not run models. The full repository command adds protocol, portability, visual, privacy, and release-byte checks.

After a study has been frozen and run, the reference analyzer accepts a result file with the schema demonstrated in `fixtures/analysis-cases.json`:

```text
node evaluation/scripts/analyze-study.mjs --preregistration path/to/frozen-preregistration.json --input path/to/frozen-results.json
```

The analyzer hashes the exact preregistration bytes, requires the results to bind that hash, and then applies a deterministic stratified paired bootstrap and the quality-first gate. This detects a changed study file. It does not authenticate who approved the file, prove the observations are true, independently score outputs, or provide statistical certification. Those remain trusted-host and study-operation responsibilities.

## Publication rule

Publish counts, denominators, uncertainty, failed strata, exclusions, raw component costs, and the exact claim ceiling. A valid release sentence has this form:

> For this frozen task population and configuration, the approved-card route [met the declared quality margin / did not meet it] and [had the following measured costs].

Do not replace the bracketed result with a general claim about all tasks, models, users, security, coherence, or savings.
