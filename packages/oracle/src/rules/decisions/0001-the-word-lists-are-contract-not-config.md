# 0001 — The word lists are contract, not config

- Status: accepted
- Date: 2026-07-11 (recorded; decided with ADR-0007)

## Context

`weasel-wording` and `unmeasurable` judge statements against fixed word lists
(`WEASEL_TERMS`, `VACUOUS_PREDICATES`). Configurable lists would let every project
relitigate what a clean spec means
([ADR-0007](../../../../../docs/adr/0007-lint-rules-are-fixed-heuristics.md)).

## Decision

The word lists are part of the convention's contract. Extending one means changing
`docs/convention.md`, not passing configuration.

## Consequences

- A spec lints the same everywhere; "clean" is one judgement, not a project setting.
- Growing a list is a convention change with an ADR trail, not a config tweak.
