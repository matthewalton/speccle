# 0043 — `review` is the outer loop; the meta loop routes remedies back down

- Status: accepted
- Date: 2026-07-23

## Context

Speccle is being built as a software factory with three nested loops:

- **Inner loop** — `edit · run · check` — the `feature` pipeline; the checks-gate
  ([ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md)) is
  its `check`. Drives autonomy: the agent churns here until a change is PR-ready.
- **Outer loop** — `test · lint · review` — runs on the change set (a branch/PR). Drives
  automation.
- **Meta loop** — reads logs and PR feedback and ships improvements back into the inner
  and outer loops. Drives quality.

The review work has to be placed in this model, and earlier questions kept treating "the
check path" as a single artefact choice when it is really a routing decision the meta loop
makes.

## Decision

**`review` is an outer-loop skill.** Its unit is the change set, not the slice, which is
why it is separate from `feature` and why the CI driver belongs to it. It generates
feedback — findings, fixes, risk scores — and does not itself change the inner loop.

**The meta loop owns the memory and the routing.** Two durable records live here: the
**remedy record** (each finding, the fix applied, the prevention artefact chosen) and the
**calibration record** ([ADR-0042](0042-calibration-proposes-only-the-human-reduces-supervision.md)).
For each finding the meta loop routes a remedy to whichever loop will catch the class next
time:

| Remedy                                 | Loop it feeds       | Artefact                                       |
| -------------------------------------- | ------------------- | ---------------------------------------------- |
| deterministic check                    | inner (checks-gate) | an `oracle verify` check in `.speccle/checks/` |
| new acceptance criterion + tagged test | inner (`claims`)    | a `SPEC.md` criterion                          |
| sharpened lens                         | outer               | `.speccle/lenses/*.md`                         |
| moved risk weight/threshold            | outer               | risk policy, on calibration evidence           |

**`oracle verify` is the one check surface, always.** It is a Speccle tool by the existing
definition — deterministic, no LLM. Its reason to exist is the class of invariant no
linter can express: cross-file and whole-change-set relationships like "a changed `@Model`
requires a round-trip test in the same change". Owning the surface outright keeps the meta
loop's memory in one place, works identically across every supported language, and lets
Speccle read and reason about every check it wrote. The repo's own linter remains normal
outer-loop tooling; prevention artefacts the meta loop creates do not get handed to it.

## Consequences

- The three prevention routes agreed earlier are not competing options; they are the three
  destinations the meta loop feeds, one artefact per loop.
- `oracle verify` is new oracle surface to build, and it can duplicate a pattern a repo's
  linter already enforces — accepted, because splitting the memory across two homes costs
  more than the duplication.
- "Reads logs and PR feedback, ships improvements back" is concretely the remedy record
  plus the calibration record. The factory's quality loop is those two records and the
  routing table above.
