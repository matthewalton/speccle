# 0006 — implement-feature accepts any input and pauses for ratification

- Status: accepted
- Date: 2026-07-09

## Context

How a developer specs is their business — prose, a ticket, a file, or an
already-conventioned SPEC.md. But something must become the conventioned spec, and the
question is when the human sees the criteria: before code exists, or after.

Also at stake: what "done" means. Folding oracle strength into the skill's inner loop
means every feature build ends with a multi-minute mutation run and fails hard in
projects without Stryker.

## Decision

`implement-feature` accepts any input. It drafts the conventioned `SPEC.md` +
`CONTEXT.md`, lints them, then **stops at the ratify pause**: the developer approves
the criteria before any test or code is written. Already-conventioned input passes
straight through the pause.

Done = the feature folder exists, the spec lints clean, every criterion has at least
one token-tagged test, and all tests are green. Oracle strength is the separate
`strengthen` skill's job.

## Consequences

- Humans own criteria; the pause is where that ownership lives.
- The skill stays fast and works in projects with no mutation tooling.
- A slice can be "done" yet weakly defended — by design; `strengthen` exists to close
  exactly that gap, on its own cadence.
