# 0008 — v1 targets TypeScript + vitest + StrykerJS only

- Status: accepted
- Date: 2026-07-09

## Context

The oracle join needs per-test mutant data (which tests covered and killed each
mutant), and that constrains the stack hard. Supporting several runners and report
formats from day one doubles surface area for little learning.

## Decision

v1 tooling targets one stack: TypeScript projects using vitest, StrykerJS with
`perTest` coverage analysis, and Istanbul `json-summary` coverage — the stack the old
repo proved the join on.

The convention itself (feature folders, spec.md, CONTEXT.md, test tokens) is
language-agnostic; only the `strengthen` tooling is stack-constrained.

## Consequences

- One stack, fully working, before any breadth.
- `implement-feature` is usable in any project; `strengthen` politely requires the
  target stack.
- jest (and non-JS ecosystems) wait for demand.
