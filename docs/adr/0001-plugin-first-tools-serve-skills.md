# 0001 — Plugin-first: the product is the workflow, tools serve skills

- Status: accepted
- Date: 2026-07-09

## Context

The previous Speccle ([speccle-legacy](https://github.com/matthewalton/speccle-legacy))
was toolkit-first: four npm packages of deterministic tooling (lint, heatmap, gate, CLI)
with the agent workflow as a roadmap item. The project grew until its author lost the
thread — the tools were built out ahead of the workflow that was supposed to need them.

## Decision

The fresh Speccle is a Claude Code plugin first. The product is the workflow of building
features as vertical slices via skills; deterministic tooling exists to serve those
skills and is built only when a skill needs it. The old repo stays browsable as a quarry
but no code is carried over — the tools are rebuilt from scratch when their turn comes.

Build order: scaffold + docs → `oracle lint` → `implement-feature` skill →
oracle-strength heatmap → `strengthen` skill. Deferred beyond v1: `carve-feature`,
`gate`, npm publishing.

## Consequences

- Nothing speculative: every tool that exists has a skill consuming it.
- The oracle join and gate machinery from the old repo must be re-earned, not pasted.
- A standalone CLI for non-Claude users is deferred until demand shows up.
