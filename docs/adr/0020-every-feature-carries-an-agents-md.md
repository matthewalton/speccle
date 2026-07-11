# 0020 — Every feature carries an AGENTS.md

- Status: accepted
- Date: 2026-07-11

## Context

The convention promises "an agent landing in the folder needs nothing else to
understand it", but the folder carried no agent-facing entry point: `SPEC.md` is the
criteria and `CONTEXT.md` the language, and neither says how to _work_ the slice — run
its tests, find the boundary, know what the oracle expects. The Wield carve surfaced
the gap. Meanwhile `AGENTS.md` has become the cross-tool convention for exactly this
file.

## Decision

Every feature folder holds an `AGENTS.md` at its root: what the slice does in a
sentence or two, how to run its tests, and where the contract lives. It states only
facts about working the slice — behaviour stays in `SPEC.md`, language in `CONTEXT.md`.

## Consequences

- Any agent landing in any Speccle feature folder gets oriented the same way, and
  tools that auto-read `AGENTS.md` pick it up for free.
- The markdown floor per feature rises from two files to three.
- The file can drift from reality like any doc; keeping it to facts the folder cannot
  show (chiefly commands) minimises the surface.
