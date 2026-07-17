# 0033 — strengthen leaves the feature loop and evaluates human-run reports

- Status: accepted
- Date: 2026-07-17
- Supersedes the strengthen gate in
  [ADR-0022](0022-feature-orchestrates-plan-spec-implement-strengthen.md)

## Context

The heatmap is genuinely useful, but as `feature`'s built-in review gate it taxes
every build: the skill owns the generate → read → kill → **regenerate** loop, so each
feature run pays repeated whole-target mutation runs in wall time and the agent burns
tokens babysitting them. The oracle's `strength` command itself only _reads_ reports —
the cost is generating them, and who triggers that generation is a skill-flow choice,
not an architectural one.

## Decision

1. **`strengthen` is out of the default `feature` pipeline.** It is an on-demand audit
   — invoked deliberately, on its own cadence — and the deferred backstop for
   alignment and test-quality problems the pipeline's deterministic checks cannot see.
2. **Mutation is scoped to the slice.** Runs target `features/<name>/src/` via
   Stryker's mutate glob (with incremental mode where available), not the whole
   target.
3. **The human runs the expensive commands; the agent evaluates.** `strengthen` opens
   with a deterministic freshness check (`strength --check`: reports fresh / stale /
   missing, and whether already evaluated — the skill drops a marker after each
   evaluation). On stale or missing it prints the exact scoped commands and stops.
   With fresh reports its job shrinks to reading the heatmap and routing each
   survivor per [ADR-0012](0012-strengthen-routes-on-the-survivor-not-the-score.md).

## Consequences

- Building a feature is fast again; mutation time is spent only when the human
  chooses to spend it.
- A slice can be committed weakly defended and stay that way until the next deliberate
  heatmap run — accepted: TDD discipline plus the checks-gate
  ([ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md))
  catch most of it, and the audit is periodic rather than a toll booth.
- The oracle grows `strength --check`; report generation commands become something the
  skill recommends verbatim, never runs itself.
