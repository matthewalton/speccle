# 0002 — Two packages; the oracle package owns lint

- Status: accepted
- Date: 2026-07-09

## Context

The old repo split into core / lint / heatmap / cli, and the package boundaries were
part of the sprawl. Both lint and the oracle heatmap need to parse specs; a shared-core
package to serve them both is how four packages happen.

## Decision

The monorepo holds exactly two packages:

- `packages/plugin` — the Claude Code plugin (skills, plugin manifest).
- `packages/oracle` — the deterministic tooling: one bin exposing `lint` and the
  oracle-strength heatmap, with spec parsing written once and shared internally.

A package boundary is added later only if something earns independent consumption.

## Consequences

- One contract between the halves: the oracle bin's typed JSON output.
- Lint and heatmap can never drift on how a spec parses.
- If lint ever needs to ship without the mutation machinery, splitting it is a real
  (and deliberate) decision rather than a default.
