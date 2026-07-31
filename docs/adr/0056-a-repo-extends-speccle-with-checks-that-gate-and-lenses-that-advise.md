# 0056 — a repo extends Speccle with checks that gate and lenses that advise

- Status: accepted
- Date: 2026-07-31
- Amends [ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md): "judgement has
  no knobs" narrows to _Speccle's_ judgement. A repo may author judgement of its own; it may
  never make it binding.
- Completes the inner-loop route of
  [ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md), which has
  named a destination the inner loop does not read since it was written.

## Context

The ask was for pluggable per-project steps across the whole cycle — plan, implement, review —
"the way lenses are pluggable in review", and it came with the tension it thought was central:
a lens is read-only, parallel and unordered, while a plan or implement step is sequential and
mutating, so the lens mechanism does not transfer.

Its premise is half-true. Lenses are not the one extension surface. There are two, and they sit
on opposite axes:

| Surface                  | Form      | Character                              | Reaches               | Gates?           |
| ------------------------ | --------- | -------------------------------------- | --------------------- | ---------------- |
| `.speccle/lenses/*.md`   | prompt    | judgement, LLM, read-only, parallel    | review, both drivers  | no — advisory    |
| `.speccle/checks/*.json` | predicate | deterministic, no LLM, change-set-wide | review's per-fix gate | **yes** — breach |

Against those two, the three motivating examples come apart rather than sharing a mechanism:

- **"A review step beyond the shipped lenses"** already works. `panel()` fans over _every_ `*.md`
  in `.speccle/lenses/`, and `materializeLenses` iterates bundled names only and never deletes,
  so a repo-authored lens runs in CI and survives an `update`. Nothing tells a repo it may write
  one, which is a documentation gap, not a design one.
- **"An implement step that enforces a house test layout"** is already expressible — it is a
  `require` check. It does nothing because `implement-feature`'s checks-gate runs `lint`,
  `claims` and the suite, and never `verify`. ADR-0043 routes a deterministic remedy to the inner
  checks-gate; the inner checks-gate has never read the directory it routes to.
- **"A plan step that checks the shape against a design system"** is the one genuinely absent
  thing, and it is a lens pointed at a different stage.

So the mechanism is not missing. What is missing is a rule for which of the two existing surfaces
may reach which stage — and the tension as posed cannot supply one, because advisory-versus-mutating
is the wrong axis. The axes are _deterministic versus judgement_ and _advisory versus gating_. The
two surfaces occupy two quadrants; a mutating implement step would land in the fourth, judgement
that gates.

The stages are only now concrete enough to decide against. Since
[ADR-0052](0052-the-feature-pipeline-runs-one-stage-per-session-and-derives-the-stage.md) and
[ADR-0054](0054-implement-runs-one-criterion-per-session-and-claims-clean-is-the-terminal-condition.md),
plan and spec are one attended session ending at the plan summary, implement is one unattended
session per criterion that auto-commits on green, and review is a separate loop with a driver that
acts on what it finds.

## Decision

**A repo extends Speccle through the two surfaces it already has. There is no third mechanism, and
no step may mutate.** Two rules fix what may go where.

### 1. Gating extension is deterministic

Only `.speccle/checks/` can fail a stage. Repo-authored judgement never gates.

Configurable judgement is gameable judgement, and a green that means something different in every
repo is not a green ([ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md)). An
LLM step with a veto is that, plus a verdict that does not reproduce: the same tree can pass and
fail on consecutive runs, so a red carries no information about the tree. A check's breach is a
fact about the change set and can be argued with; a lens's finding is an opinion, and an opinion
that blocks a build is unfalsifiable.

### 2. Advisory extension needs a reader

A lens produces a finding, and a finding is only worth producing where something acts on it — a
human at a gate, or a driver that fixes and posts. A stage with no reader either discards advisory
output or quietly promotes it to a gate, and rule 1 forbids the second.

### The stage table falls out

| Stage                   | Its reader                           | Deterministic gate                             | Advisory judgement             |
| ----------------------- | ------------------------------------ | ---------------------------------------------- | ------------------------------ |
| plan + spec (session A) | the human, at the plan summary       | `lint` — fixed, not extensible                 | **eligible** — a plan lens     |
| implement (session B)   | none: unattended, commits on green   | the checks-gate — and it **must run `verify`** | barred — nothing would read it |
| review / address        | the driver, then the human on the PR | `verify`, per fix                              | the lens panel — shipped       |

An unattended session A does not create an exception. It cannot approve, so it continues with every
open decision defaulted and flagged in the summary — and the summary is still written and still
read later. The reader is deferred, not absent. Session B has no summary anyone rules on; its
output is a commit.

### No step mutates, at any stage

A step that edits needs ordering, failure and revert semantics that the checks-gate's model does not
cover, and in the unattended session it can wedge a run with nobody watching. A repo that wants an
edit enforced writes the check that fails without it and lets the agent make the edit. That keeps
exactly one thing able to fail a stage, which is the property the question "does the checks-gate
stay the only thing that can fail a stage?" was really asking about.

### A surface `init` does not scaffold does not exist

Lenses are vendored by `init`, tracked by `doctor`, refreshed by `update`, and announced on
stdout as "yours to author". Checks are none of those — no scaffold, no doctor line, no mention
outside the README's `verify` section. That is why a surface three ADRs old has no users. An
extension point a repo cannot discover is not an extension point, and anything added here inherits
the obligation.

## Consequences

- **`verify` in the inner checks-gate is a defect to fix, not a feature to build.** ADR-0043 has
  promised that destination since 2026-07-23. Until it lands, the meta loop's cheapest remedy route
  writes a file nothing reads — the remedy record records a prevention that does not prevent.
- **ADR-0035's double rejection of inner-loop LLM judgement stands, and now rests on a rule rather
  than a cost argument.** It was rejected for being noisy and expensive; it is also barred, because
  session B has no reader and judgement there could only ever gate.
- **ADR-0040's "no configurable judgement" gets its final shape.** ADR-0043 already put lenses under
  `.speccle/`; this names which property that broke and which held. A repo authoring its own
  judgement is fine and always was — the invariant is that Speccle's own verdicts have no knobs and
  a repo's own judgement has no teeth.
- **A plan lens is the only new surface**, and it is the existing fan-out aimed at the slice's
  markdown instead of a change set. Its findings join the plan summary, where the human is already
  ruling on something.
- The empty quadrant stays empty, which answers "what stops a bad third-party step wedging an
  unattended implement run": nothing that could run there is allowed to.
- `init` and `doctor` grow `.speccle/checks/`, so the surface becomes discoverable, and the
  house-conventions template gains a sibling — a repo needs to be told it may write a lens, not
  only that one lens is its own.
