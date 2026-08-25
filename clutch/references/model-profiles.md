# Clutch model profiles

The protocol uses symbolic profiles so it remains portable across vendors and future model families.

| Profile | Function | Default behavior |
|---|---|---|
| `advisor` | Long-context judgment, red-team analysis, card drafting, read-only review | Frontier-capability model, high or extra-high reasoning, no artifact mutation after activation |
| `economy` | Bounded implementation and repetitive work | Lowest-cost model that passes the task's evaluation, low or medium reasoning |
| `balanced` | Proposed next-card route after a demonstrated economy failure or capability mismatch | Mid-tier model, medium reasoning; never an automatic fallback |

The model map is an adapter, not accepted policy. Validate every mapped model against the active environment before assignment. Do not silently replace an unavailable model.

## Example mapping for one Codex host

```json
{
  "schema_version": "model-map.v1",
  "status": "EXAMPLE_NOT_ACTIVATED",
  "profiles": {
    "advisor": {
      "model": "gpt-5.6-sol",
      "reasoning_effort": "xhigh",
      "mutation_mode": "READ_ONLY"
    },
    "economy": {
      "model": "gpt-5.6-luna",
      "reasoning_effort": "low",
      "mutation_mode": "CARD_BOUNDED"
    },
    "balanced": {
      "model": "gpt-5.6-terra",
      "reasoning_effort": "medium",
      "mutation_mode": "CARD_BOUNDED"
    }
  }
}
```

This example is not a claim that the models are available in every account or host. Each host needs its own explicit mapping from the symbolic profiles to available models. Keep that mapping outside the canonical skill so the protocol remains vendor-neutral. Other providers may map their own frontier, economy, and balanced models only after representative evaluations pass.

## Selection rules

1. Keep the advisor profile stable while evaluating worker routes.
2. Start workers at `economy` only for bounded tasks with explicit checks.
3. After a named test fails, required tool behavior is unsupported, or evaluation shows unacceptable degradation, propose a new `balanced` card for human approval.
4. Return to the human for ambiguous scope, consequential risk, missing evidence, or a new acceptance rule.
5. Never promote cost telemetry into a quality judgment.
