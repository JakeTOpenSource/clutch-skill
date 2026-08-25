# Clutch model profiles

The protocol uses symbolic profiles so it remains portable across vendors and future model families.

| Profile | Function | Default behavior |
|---|---|---|
| `advisor` | Long-context judgment, red-team analysis, card drafting, read-only review | Frontier-capability model, high or extra-high reasoning, no artifact mutation after activation |
| `worker_rank_1` | Bounded implementation | Capability rank 1 in this frozen map |
| `worker_rank_2` | Bounded implementation | Capability rank 2 in this frozen map |

The profile names state only their relative capability rank inside one frozen map. They are not price classes. The map lets Clutch label a transition `UPGRADE`, `DOWNGRADE`, or `STABLE`; economic interpretation remains external.

The model map is an adapter, not accepted policy. Validate every mapped model against the active environment before assignment. Do not silently replace an unavailable model.

## Example mapping for one Codex host

```json
{
  "schema_version": "model-map.v1",
  "status": "EXAMPLE_NOT_ACTIVATED",
  "profiles": {
    "advisor": {
      "model": "gpt-5.6-sol",
      "capability_rank": 3,
      "reasoning_effort": "xhigh",
      "mutation_mode": "READ_ONLY"
    },
    "worker_rank_1": {
      "model": "gpt-5.6-luna",
      "capability_rank": 1,
      "reasoning_effort": "low",
      "mutation_mode": "CARD_BOUNDED"
    },
    "worker_rank_2": {
      "model": "gpt-5.6-terra",
      "capability_rank": 2,
      "reasoning_effort": "medium",
      "mutation_mode": "CARD_BOUNDED"
    }
  }
}
```

This example is not a claim that the models are available in every account or host. Each host needs its own explicit mapping from the symbolic profiles to available models. Keep that mapping outside the canonical skill so the protocol remains vendor-neutral. Other providers may map their own models only after representative evaluations pass.

Compare `capability_rank` only inside one frozen model map. Moving to a lower rank is a downgrade, moving to a higher rank is an upgrade, and remaining at the same rank is stable. Missing, duplicate, or incomparable ranks fail closed. Rank is a routing declaration to test, not a universal measure of intelligence or price.

## Selection rules

1. Bind the current and next profile at every model change.
2. Start workers only in the profile named by an exact approved phase card.
3. After a named test fails, required tool behavior is unsupported, or evaluation shows unacceptable degradation, return to neutral and propose a new phase card.
4. Return to the human for ambiguous scope, consequential risk, missing evidence, or a new acceptance rule.
5. Never promote cost telemetry into a quality judgment.
