# 0054 — Implement runs one criterion per session, and `claims` clean is the terminal condition

- Status: accepted
- Date: 2026-07-29
- Amends [ADR-0052](0052-the-feature-pipeline-runs-one-stage-per-session-and-derives-the-stage.md):
  its session table and its `next` derivation table — the stage is still derived from the
  folder, but the derivation now names a criterion
- Amends the checks-gate of
  [ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md): its
  `claims` check narrows from the slice to the criterion under work
- Refines the tracer rule of
  [ADR-0013](0013-implement-feature-traces-one-criterion-end-to-end-first.md) as ADR-0052
  re-based it: `next` reports that a tracer is owed; the session still picks which
  criterion it is

## Context

[ADR-0052](0052-the-feature-pipeline-runs-one-stage-per-session-and-derives-the-stage.md)
moved the pipeline to one stage per session so the orchestrator would stop accumulating
every stage's context. It fixes the orchestrator and leaves the largest single session
untouched. Implement still takes every unclaimed criterion in one go — write the tests,
watch them fail, make them green, next criterion — and then runs the checks-gate and the
commit. On a slice of eight criteria that is eight red-green loops, eight rounds of test
output and every intermediate failure, all resident in the one session. The stage that was
meant to be insulated is the stage that grows with the size of the work.

The unit that actually bounds that work is the **criterion**. It is already the unit of the
spec ([ADR-0003](0003-criteria-are-headings-with-key-n-ids.md)), the unit a test claims
([ADR-0004](0004-tests-claim-criteria-in-the-full-test-name.md)), and the unit
`implement-feature`'s red-green loop iterates over. Making it the unit of the session costs
nothing new to derive: `claims` already reports which ids are unclaimed.

What it does cost is the pipeline's one remaining slice-wide assertion. The checks-gate
([ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md))
requires `claims` to exit `0` — every criterion claimed. Mid-slice that is false by
construction: a session that has just implemented the third of eight criteria cannot pass a
gate demanding all eight. Per-criterion sessions need a different answer to "is this session
done?" than to "is this slice done?"

## Decision

**The implement stage runs one criterion per session, and full `claims` clean stops being a
gate assertion and becomes the pipeline's terminal condition.**

### The sessions

| Session | Stage                                       | Attended?                                      |
| ------- | ------------------------------------------- | ---------------------------------------------- |
| A       | plan + spec                                 | yes — the pipeline's one human gate lives here |
| B…N     | implement **one** criterion + gate + commit | no                                             |
| N+1     | nothing unclaimed — point at review         | no                                             |

Session A is unchanged, and ADR-0052's reason for it stands: plan and spec share a session
because the per-behaviour decisions `plan-feature` settles get no file of their own, so they
must be consumed before the boundary.

### `next` names the criterion

| What it observes                          | The stage                                     |
| ----------------------------------------- | --------------------------------------------- |
| no `SPEC.md`                              | spec                                          |
| `SPEC.md` present, `lint` fails           | spec, unfinished                              |
| lints clean, `unknownClaims` is non-empty | clear the stale claims — before any criterion |
| lints clean, `unclaimed` is non-empty     | implement, **and which criterion**            |
| lints clean, `claims` is clean            | the slice is done                             |

Naming a criterion rather than a stage forces three things the stage-level table never had to
settle.

**Document order, not id order.** `implement-feature` takes the remaining criteria in
document order, because a spec reads top to bottom and its criteria build on each other in
that direction. Criterion ids are names, not order (ADR-0003), so on an amend route the two
diverge: a new criterion takes the next never-used number and may sit anywhere in the
document. `claims` today sorts `unclaimed` by id and discards the document order it read on
the way through. `next` means document order, so `claims` reports it.

**The tracer is reported, not chosen.** ADR-0013 picks the tracer by judgement — the
criterion whose passing test exercises the thinnest complete path through every layer — and
that is not derivable from markdown. So `next` reports only that a tracer is **owed**, which
is exactly ADR-0052's observation that nothing claimed means nothing is built yet. The
session picks which criterion satisfies it; every session after takes the next unclaimed in
document order. This is the one place where the folder does not fully determine the work, and
it is a judgement the tracer rule always contained.

**Stale claims come first.** A test claiming a retired id is a lie about what is defended.
ADR-0052 left it to the gate — `claims` fails on it, so no note need be passed along. With
the gate no longer asserting slice-wide claims, nothing would catch it until session N+1. So
`next` routes to it ahead of any new criterion: deleting the test is a minute's work, and
every session in between would otherwise read a `claims` report that misstates the slice.

### The per-criterion gate

An implement session closes on three checks:

1. `<oracle> lint <feature-folder>` — exit `0`.
2. The criterion it worked is **claimed**, and `unknownClaims` is empty.
3. The whole project's test suite — green.

Only (2) changes, and only in scope: slice-wide claims are what session N+1 _observes_, not
what sessions B…N _assert_. Check (3) was already `implement-feature`'s standing rule at every
criterion boundary, so a per-criterion commit inherits a green suite rather than needing a new
promise. ADR-0035's other terms hold: no judgement here, no oracle-strength measurement, and a
gate that fails the same way twice stops and shows the human — in-session now, since the
session is the implement agent. A session that stops does not commit, and `next` routes to the
same criterion again.

### One commit per criterion

The commit names the criterion. On a new slice the first session introduces the slice; every
session after it amends a slice that already runs, so the route
([ADR-0023](0023-plan-feature-routes-new-amend-or-carve.md)) no longer distinguishes one
commit from another and the criterion does. The auto-commit of ADR-0035 is otherwise
unchanged: on a green gate the pause is ceremony.

### A spec change found mid-implement

`implement-feature` may find a compound criterion that lint let through and amend the spec.
Per-criterion this gets simpler, not harder: the session amends, re-lints, commits and stops,
and `next` picks up the new ids in the next session. It no longer has to carry a spec change
through the rest of its own run.

## Consequences

- **The human types `/feature` once per criterion.** A five-criterion slice is five
  invocations. This is the amendment's real price, and it is a judgement call rather than a
  fact — bought with the same currency ADR-0052 spent, and for the same reason: every session
  ends naming the next command, so the cost is typing, not remembering.
- **The fat session is gone; the session count is not free.** Each session reads the slice's
  markdown cold — `SPEC.md`, `CONTEXT.md`, `CLAUDE.md`, `decisions/`. ADR-0052 accepted that
  cost once per stage; this accepts it once per criterion. It is still bounded by the slice's
  prose against an unbounded pile of red-green loops, but a slice with many small criteria now
  pays the read many times. When that bites, the answer is the one `implement-feature` already
  gives about a crowded `src/`: the pile is probably two slices.
- **`claims` owes a document-order guarantee**, as a reported field rather than a sort — the
  order the spec was written in has to survive the join, not just the read.
- **`next` becomes the only place that answers "is this slice done?"** Nothing else asserts
  slice completeness any more. That is the same consolidation ADR-0052 wanted for the
  stage mapping, extended by one question.
- **A slice's history reads as its spec** — one commit per criterion, in document order, each
  with a green suite. That is a bisect surface the single-commit run never offered.
- **Intermediate commits reach review together.** `review`'s unit is the change set
  ([ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)), so a slice
  built across five sessions presents five commits to one review. The total under review is
  unchanged; what changes is that the human first sees them at review rather than at the end of
  a run. Acceptable — nothing was pushed.
