# 0007 — Lint rules are fixed heuristics: structure plus heading quality

- Status: accepted
- Date: 2026-07-09

## Context

`implement-feature` claims "lints clean" as part of its done, so lint must be
deterministic — not agent self-checking, which drifts. The old repo's stance ("the
lists are contract, not config": fixed rules, one severity, no disable flag) worked.
The open question for the new heading-based format: mechanical structure only, or also
the quality heuristics that catch vague criteria before oracle strength exposes them
expensively?

## Decision

Both, with a crisp boundary. Structural rules (`missing-key`, `key-collision`,
`key-mismatch`, `malformed-id`, `duplicate-id`, `empty-statement`) enforce the format;
quality heuristics (`weasel-wording`, `compound-criterion`, `unmeasurable`) judge the
heading statement **only** — the body is never linted. Fixed rules, one severity, no
configuration, as before. The rule set is specified in
[docs/convention.md](../convention.md).

## Consequences

- "Lints clean" is deterministic, so the skill's done is mechanical.
- Vague statements are caught at drafting time, not after a mutation run.
- No config surface to maintain — and no escape hatch when a rule annoys; changing a
  rule means changing the contract here.
