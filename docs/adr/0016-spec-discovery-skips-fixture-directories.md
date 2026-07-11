# 0016 — Spec discovery skips fixture directories by fixed name

- Status: accepted
- Date: 2026-07-11

## Context

`discoverSpecs` sweeps every `SPEC.md` under the target root, so a tree holding
deliberately-dirty spec fixtures cannot run the oracle at its root. The pilot slice
(ADR-0015) hit this immediately: `packages/oracle/test/fixtures/dirty/` forced the
pilot to target `packages/oracle/src` instead of the package root, and any real
adopter who fixtures specs for their own tests hits the same wall.

Three mechanisms were on the table. Respecting `.gitignore` fails the motivating
case outright — spec fixtures are committed, that is the point of them. An ignore
flag or config file solves it but breaks ADR-0007's stance that the tools carry
contract, not configuration, and opens the escape-hatch surface that stance exists
to avoid. A fixed name-based skip extends what discovery already does: it
hard-codes `node_modules` and `dist` today.

## Decision

Directories named `fixtures` or `__fixtures__` join `node_modules`, `dist`, and
dot-directories in discovery's fixed skip list. The list is contract, documented in
[docs/convention.md](../convention.md), and grows only by changing the contract —
no flag, no config file, no per-project override.

The corollary is also contract: a feature directory may not take a skipped name. A
slice living under a directory called `fixtures` is invisible to the oracle, by
design.

## Consequences

- A target that fixtures dirty specs lints and measures clean at its root; "run at
  a narrower root" is no longer the documented answer.
- The pilot's own commands keep working unchanged — a narrower root remains valid —
  but the reason AGENTS.md gave for it ("would sweep the dirty fixtures") is gone.
- An adopter whose fixture directory uses any other name still hits the original
  wall; the remedy is renaming to a skipped name or running at a narrower root,
  not configuration.
