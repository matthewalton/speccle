# 0015 — Dogfooding starts with one pilot slice: the lint rules

- Status: accepted
- Date: 2026-07-10
- Supersedes: [ADR-0009](0009-speccle-does-not-dogfood-its-own-convention.md)

## Context

ADR-0009 kept this repo off its own convention while the priority was shipping the
workflow, and named its own exit: revisit once the tooling is stable enough that
dogfooding would be cheap. The v1 board is now clear — lint, the strength heatmap, and
both skills shipped and survived agent cold-tests — so the condition was priced against
reality.

Two facts changed the price. `discoverSpecs` finds a `SPEC.md` anywhere under a target
root, and the convention leaves code layout free, so governing existing code needs no
restructure — a spec lands beside the source it owns. And the oracle is itself the
ADR-0008 pinned stack (TypeScript, vitest), so wiring coverage and Stryker is the same
config the toy target already carries.

What did not change: the oracle has zero real-world usage and will churn as real
projects expose issues. Blanket dogfooding would front-load retroactive specs for nine
modules that may still move, and re-impose the standing tax ADR-0009 existed to avoid.

## Decision

One pilot slice: `packages/oracle/src/rules/` — the nine lint rules — becomes a
governed feature (key `LINT`) with its own `SPEC.md`, `CONTEXT.md`, and criterion-tagged
tests. The rules are the most stable surface in the repo (their behaviour is fixed by
`docs/convention.md`), and they carry the credibility story in its strongest form: the
linter lints its own spec, and oracle strength measures whether the rules' tests would
notice a broken rule.

The oracle runs against `packages/oracle/src`, not the package root:
`test/fixtures/dirty/` holds deliberately violating specs, and a run over the package
would sweep them up. Mutation and coverage reports stay at the package root, so
`strength` takes explicit `--mutation`/`--coverage` paths.

The rest of the repo stays off the convention. Another module earns a slice only when
it has stopped churning and the pilot has shown the per-change tax is small.

## Consequences

- Every change to `src/rules/` now pays the convention tax: criteria updated, tests
  tagged, lint and strength kept clean. Scoped to one subtree, that is the experiment.
- The carve was done by hand; what it took is prior art for the deferred carve-feature
  skill.
- A target whose tree contains fixture specs cannot run the oracle at its root — the
  pilot hit this immediately. Real adopters with spec fixtures will too; a future
  ignore mechanism is a product question this ADR only records.
- ADR-0009's lighter documentation discipline (root `CONTEXT.md`, ADRs) continues
  unchanged everywhere else.
