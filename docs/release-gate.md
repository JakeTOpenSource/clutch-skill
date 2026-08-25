# Release gate for 0.4.0-rc.1

Status: `HOLD_BEFORE_GITHUB`

This candidate is structurally testable and claim-bounded. It is not yet authorized for publication. The hold protects the distinction between a tested protocol implementation and an empirically supported model-routing result.

## Completed locally

- Clean release materialized from an exact source manifest; local trial artifacts were not copied.
- An explicit release allowlist rejects both unexpected and missing files.
- Example policy declares the implementation digest, policy identity binds it, and activation records must repeat it.
- Two independent reducers agree on 30 lifecycle fixtures, including rejection of an undeclared orchestrator and a worker attempting clutch control.
- Worker and verification receipts are now separately bound. A verifier PASS cannot promote a worker-declared non-pass, and verified non-delivery has a closable correction path.
- Two independent Fuse reducers agree on 19 valid phase journeys. Twenty-nine hostile mutations reject hidden retries, renamed no-op repairs, reused provider attempts, backward or ambiguous routes, context shrinkage after omission, missing requirement coverage, false worker or verification status, chain tampering, false approval binding, semantic-ID leakage, invalid Unicode, and nonportable route ordering. Consumed next phases and exhausted Fuse or platform limits stop in valid `HOLD_NEUTRAL` state while preserving evidence and attempted usage. Three adversarial journeys prove that strict safety, authority, and contract failures cannot be relabeled as phase-mismatch repair work.
- Missing usage is represented as `UNKNOWN`, never zero. Efficiency eligibility requires both a verified delivery and complete telemetry.
- Failed phase candidates remain feedback, failed cost remains charged, the last known-good artifact remains admissible, and only a passing final phase earns delivery credit.
- A whole-lifecycle canary test finds no raw card, source, actor, statement, result-reference, or verification-reference value in reducer output.
- Twenty synthetic analyzer branches bind exact preregistration bytes, expose five planned contrasts, reconcile provider-cost components, enforce study controls, named harms, unauthorized-clutch-transition thresholds, exact harm-incidence bounds, and reviewer-error gates, require complete cost telemetry and uncertainty, and reject forged or undersized inputs.
- The earlier projection failure and its corrective result are both retained.
- Node-only release, portability, visual, privacy, license, manifest, and evaluation checks pass in the local candidate.

These checks establish only their declared local fixture and byte-identity claims.

## Still required

The owner must freeze every null field in `evaluation/preregistration.example.json`. In particular:

- the exact task-population digest and task strata;
- model versions, decoding settings, tools, permissions, and pricing timestamp;
- the acceptable paired quality-loss margin;
- critical-harm definitions;
- sample size supported by a power calculation or simulation;
- reviewer false-approval and false-rejection limits;
- treatment of human review time and provider charges; and
- the public reporting rule.

The non-authorizing proposal in `evaluation/OWNER-DECISION-PACKET.md` recommends first running a five-task instrumentation shakedown, then choosing the confirmatory sample from observed paired discordance and the owner's accepted quality margin. The separate `evaluation/owner-acceptance-stage-0.json` authorizes preparation only. The minimized `evaluation/stage-0-preparation-receipt.json` binds the private task index, workspace digests, telemetry parser result, and hard resource ceilings without publishing hidden checks. Neither record authorizes model calls or publication. The proposal also records a default-off two-key delegation design with human tie-breaking and a shadow-only Pedal Protocol measurement.

After approval, run the four matched conditions without changing the verifier, tasks, rubric, or exclusions. Preserve every run and disposition. Then run an independent clean-room replay and a final claim audit.

## Release choices

The safer path is to finish the preregistered behavioral study before publishing `0.4.0`. If an earlier research preview is desired, publish only an `0.4.0-rc.1` evaluation-ready release and say explicitly that general quality, coherence, savings, human-review effectiveness, security, and production readiness remain unproven.

## GitHub handoff

After an owner changes this status to `GO`, apply the reviewed candidate changes to a clean branch based on the intended upstream commit. Do not copy the candidate's directory over a dirty worktree. Re-run `npm run refresh-manifests` and `npm test` from the clean branch, inspect the final diff and release manifest, then request a separate owner decision for push, pull request, tag, and release publication.
