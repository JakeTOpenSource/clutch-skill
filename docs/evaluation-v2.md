# Clutch v2 confirmatory evaluation

## Result in one paragraph

The frozen private analysis recorded a release-gate pass on one fixed synthetic long-context benchmark. The public outcome replay recomputes the statistical gates from a minimized outcome table. After allocating the complete advisor charge to the card route, approved cards reduced raw input by about 95.9 percent and reduced provider cost while keeping average post-handoff quality inside the declared 10 percentage point noninferiority margin. Stable Terra lost some quality with cards. Terra-to-Luna gained some quality with cards. The separate hypothesis that cards materially protect against model-switching damage remained neutral or unresolved.

## Results at a glance

| Worker path | Card minus history quality, P3-P5 | One-sided 95% lower bound | Worst phase lower bound | Input reduction | Mean provider charge difference per task | 95% cost interval upper end | Fully correct at P5, card vs history |
|---|---:|---:|---:|---:|---:|---:|---:|
| Stable Terra | -4.44 points | -5.19 points | -8.89 points | 95.93% | -$0.776678 | -$0.773767 | 9/15 vs 15/15 |
| Terra to Luna | +2.30 points | -0.07 points | -2.67 points | 95.94% | -$0.186450 | -$0.185222 | 13/15 vs 10/15 |

The quality gate required every lower bound to remain above -10 percentage points. The cost gate required the paired 95 percent interval to remain below zero. Both paths passed both gates. There were no recorded collapses or boundary violations in either carriage condition.

The strict P5 completion counts matter. Cards were cheaper in both paths, but the stable-Terra card path produced six partially correct final tasks while full history produced none. This benchmark supports bounded average-quality preservation under the frozen tolerance. It does not support a claim that cards are lossless or always improve quality.

## What was tested

The benchmark contained fifteen cumulative JavaScript tasks: three task families with five deterministic variants each. Every task changed five times. Terra handled the first two phases. The state at the second phase was cloned before two later paths were tested: Terra remained stable in one path, while the other path moved to Luna for phases three through five.

Each path was tested with full accumulated history and with the exact approved card. All matched cells used the same active requirement, starting source, hidden probes, output ceiling, and one-attempt rule. Full-history prompting retained caching. No automatic retries were allowed. One read-only Sol advisor audited the fifteen final cumulative cards against the full session history. Its complete provider charge was divided across the fifteen card-routed tasks.

The run completed 241 provider requests: one advisor call and 240 worker calls. Measured provider spend was $16.07576105 under a $26.75 hard cap. Human review time was not monetized.

Quality was the fraction of currently active hidden probes passed at each phase. The primary endpoint covered phases three through five and also required each phase to pass separately, which prevented later recovery from hiding an immediate handoff failure. Confidence bounds came from 100,000 task-stratified bootstrap samples using the frozen seed.

## What the result means

The result supports a narrow mechanism: in this constructed long-session workload, a compact, exact-selected card avoided repeatedly transporting most of the accumulated history and lowered measured provider cost without crossing the preregistered average-quality loss limit. It gives Clutch an empirical foundation for further testing.

The result does not establish production reliability, universal savings, or population-level performance. The fifteen tasks were synthetic and fixed. There was one advisor realization. The card treatment combined context selection with context reduction, so this study did not isolate compression alone. The Node scoring environment was defense in depth, not an operating-system security boundary.

The switch-resilience endpoint estimated 6.74 percentage points of card protection with a one-sided lower bound of 4.44 points. The preregistered support threshold required at least 10 points, so its classification remains `NEUTRAL_OR_UNRESOLVED`. That finding cannot be promoted into a positive switching claim.

## Public evidence boundary

The repository publishes the compact [research summary](../evidence/clutch-v2-confirmatory-001/research-summary.json), [study receipt](../evidence/clutch-v2-confirmatory-001/study-receipt.json), [public preregistration extract](../evidence/clutch-v2-confirmatory-001/public-preregistration.json), and [minimized outcome table](../evidence/clutch-v2-confirmatory-001/outcome-table.json). Run `npm run verify:evaluation` to recompute the bootstrap bounds, quality gates, input reductions, cost intervals, safety aggregates, and switch-resilience classification.

The 240 raw worker responses and private analysis packet are not included. Readers can independently recompute the reported statistical gates from the published outcomes. They cannot independently rescore the original model responses, verify that the minimized outcomes were extracted correctly, or reestablish provider-event and source-chain integrity from this repository alone. The receipt binds those private checks, but it does not replace a full replication archive.
