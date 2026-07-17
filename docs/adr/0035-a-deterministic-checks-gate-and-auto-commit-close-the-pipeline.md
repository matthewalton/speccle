# 0035 — a deterministic checks-gate and auto-commit close the pipeline

- Status: accepted
- Date: 2026-07-17

## Context

With strengthen out of the loop
([ADR-0033](0033-strengthen-leaves-the-feature-loop-and-evaluates-human-run-reports.md)),
the pipeline needs an end-of-run quality signal that is cheap enough to pay on every
build. A fresh-context review subagent judging spec–code alignment was considered
twice and rejected twice: its findings on a well-planned slice are mostly noise, its
cost is real, and the misalignment it uniquely catches — behaviour no criterion
mentions, a tagged test asserting the wrong thing — surfaces later in the heatmap,
which is the accepted backstop.

## Decision

The pipeline closes with a **deterministic checks-gate** run by the orchestrator, no
subagent:

1. `oracle lint` — the slice's contract is clean.
2. `oracle claims` — a **new oracle command**: parse test names for `[KEY-n]` tokens
   and join against the spec, no mutation or coverage reports needed. Every criterion
   claimed by at least one test; every tagged test points at a real criterion.
3. The slice's tests, green.

Any failure returns the run to the implement subagent, not to the human. On green, the
orchestrator renders a one-screen, product-voiced summary — criteria and their
claiming tests, the implementer's closing notes — and **commits automatically**: no
"commit? y/n" pause. The commit message derives from the route the plan settled (new
slice vs amendment), following the repo's commit conventions.

## Consequences

- The per-build quality signal costs seconds, not mutation minutes; `claims` becomes
  the cheap everyday complement to `strength`.
- The human gates in a feature run stay at exactly one (plan,
  [ADR-0036](0036-planning-grills-conditionally-and-gates-once-via-plan-mode.md));
  the closing summary is a glance, not a gate. A bad commit is one revert away on a
  solo repo committing to main.
- Machines gate structure only. Alignment judgement is deliberately absent from the
  loop and lives in the periodic heatmap audit.
