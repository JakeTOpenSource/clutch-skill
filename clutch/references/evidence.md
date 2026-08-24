# Evidence and economic fit

Read this reference when deciding whether Clutch is worth its routing overhead or when describing what has actually been measured.

## Practical decision rule

Use direct execution for a short, self-contained task unless the human or active policy requires Clutch. Consider Clutch when a long cumulative session would otherwise resend a large history to repeated worker passes or across a model handoff, and when the approved worker package is materially smaller than that history.

Do not infer a universal token threshold from one benchmark. Before routing, record the expected worker count, full-history input, card input, advisor allocation, model prices, review burden, retry rule, and quality checks. Afterward, report observed values. Use `UNKNOWN` when the host does not expose a measurement.

## Confirmatory study 001

One preregistered fixed synthetic benchmark used fifteen cumulative coding tasks, one read-only advisor realization, 240 one-attempt worker cells, and no automatic retries. After advisor allocation, cards reduced raw input by 95.93 percent on the stable path and 95.94 percent on the Terra-to-Luna path. Both paths lowered provider cost and passed a preregistered 10 percentage point average-quality noninferiority margin.

Stable-Terra cards averaged 4.44 percentage points below full history after handoff. Terra-to-Luna cards averaged 2.30 points above full history. The stricter final all-probes count was 9/15 versus 15/15 on stable Terra and 13/15 versus 10/15 after the model switch. Cards were therefore efficient in this benchmark but were not lossless.

The model-switch protection endpoint remained `NEUTRAL_OR_UNRESOLVED`. Human review time was not monetized. The tasks were synthetic and fixed, so these observations do not establish production performance or universal savings.

The source repository contains the human report at `docs/evaluation-v2.md` and a replayable minimized outcome package under `evidence/clutch-v2-confirmatory-001/`. That package recomputes the reported statistics but does not include raw model responses or independently reestablish private execution integrity. Repository-level evidence files are not copied into a project skill installation.
