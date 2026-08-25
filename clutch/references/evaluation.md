# Evaluation rules

Evaluate Clutch as a routed system, not as a contest between model names.

## Four matched conditions

Use the same frozen tasks, workspace state, tools, permissions, time limits, and hidden checks in four conditions:

1. capable model with full context;
2. proposed worker model with full context;
3. proposed worker model with an automatically generated card; and
4. proposed worker model with the exact human-approved card.

Report all five planned contrasts. Capable-full versus worker-full measures the model-and-setting change. Worker-full versus worker-auto-card measures the automatic card transformation, including compression and generation effects. Worker-auto-card versus worker-approved-card measures the reviewed-card intervention. Worker-full versus worker-approved-card directly measures Clutch against the same worker receiving full context. Capable-full versus worker-approved-card measures the complete route. Give each condition one attempt and randomize or counterbalance order.

## Primary gate

Task quality is primary. Predeclare a paired non-inferiority margin, named critical harms and thresholds, reviewer error thresholds, task strata, exact task count, power analysis or simulation, and analysis before model calls. Freeze the preregistration and bind the exact file digest into the results. Require the approved-card route to meet the quality rule against both capable-full and worker-full in every release-critical stratum before naming an efficiency winner.

Track first-pass success, critical defects, omitted constraints, unsupported claims, scope violations, and executable checks. Keep output quality separate from human acceptance.

For multi-phase work, preserve three views of every phase: the admissible state before it ran, the candidate and observations produced during it, and the admissible state after the Fuse decision. A candidate that fails remains feedback but earns no delivery credit. This prevents an isolated input or output from defining the system's state by itself.

The primary long-horizon outcome is `verified cargo delivered`: the final artifact passed every registered final-phase requirement and remained eligible for human acceptance. Report completed deliveries over all started journeys, not successful phase fragments over attempted phases.

## Conditional efficiency

If quality passes, report advisor, card-generation, worker, verification, and human-review costs separately. Record cached input, uncached input, output, prompt bytes, provider charges, wall time, and reviewer-level decisions, confidence, and review seconds. Price review time using the frozen accounting rule. The formal cost study must reject missing required telemetry. Exploratory observations may use `UNKNOWN`, but they cannot produce an efficiency verdict.

Count the cost, time, and tokens of every failed, held, transferred, repaired, and evacuated phase in the numerator. Count a delivery in the denominator only after the final registered checks pass. Report `cost per verified delivery`, `time to verified delivery`, phase survival, Fuse-use rate, evacuation rate, and undelivered-journey cost. Never present lower phase cost as system efficiency when the cargo did not arrive.

A lower sample mean does not establish a reduction. The upper endpoint of the preregistered 95 percent interval must also be below zero before naming lower total cost or lower token use.

Short tasks where routing overhead should lose belong in the test population. A workflow that wins only after those tasks are removed has not established a general routing rule.

## Robustness

Include growing history, irrelevant distractors, contradictory facts, stale sources, a source change after approval, model transitions, tool failure, hostile instructions inside source material, phase-order mistakes, missing evaluator requirements, context omission, and missing clean-context capability. A changed task or boundary must return to neutral rather than reuse approval. A preapproved Fuse route may preserve progress only when its exact reason, phase, and limits still match.

## Reporting

Publish counts and denominators, failed strata, uncertainty, exclusions, model and harness versions, task provenance, pricing date, review time, and claim ceilings. Seeds are sensitivity checks, not independent tasks. Do not claim security, semantic completeness, human effectiveness, production readiness, or general savings from local conformance tests.
