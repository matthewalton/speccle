# 0052 — The `feature` pipeline runs one stage per session, and the stage is derived

- Status: accepted
- Date: 2026-07-29
- Supersedes the subagent mechanism of
  [ADR-0034](0034-feature-runs-spec-and-implement-in-subagents-with-the-slice-as-hand-off.md) —
  its hand-off decision is what makes this possible and stands unchanged
- Amends [ADR-0022](0022-feature-orchestrates-plan-spec-implement-strengthen.md): the
  orchestrator no longer owns carried state; it re-derives it

## Context

[ADR-0034](0034-feature-runs-spec-and-implement-in-subagents-with-the-slice-as-hand-off.md)
moved spec and implement into subagents to keep the orchestrator's context small. It
half-works. A subagent frees its own context, but the orchestrator still holds the
planning dialogue, the repo exploration that fed it, the criteria the spec subagent
returned, the implement subagent's report, and the checks-gate output — in one session,
growing with the size of the work. The stages that were supposed to be insulated from
each other are all still resident in the session that sequences them.

The fix is a real session boundary rather than a subagent one. That raises the question
a subagent never had to answer: a fresh session remembers nothing, so **how does it know
what stage the work is at?**

The reflex is a plan file — a written record of the run's progress, kept somewhere under
`.speccle/`. That reflex is wrong for the same reason ADR-0034 rejected a per-feature
PRD, and for a sharper one besides: a file that says `spec: done` when the spec does not
lint is worse than no file at all. It is a second source of truth for something the first
source already answers.

## Decision

**The pipeline runs one stage per session, and the stage is derived from the folder, never
stored.**

### The sessions

| Session | Stage                            | Attended?                                      |
| ------- | -------------------------------- | ---------------------------------------------- |
| A       | plan + spec                      | yes — the pipeline's one human gate lives here |
| B       | implement + checks-gate + commit | no                                             |
| —       | review                           | a different loop; see below                    |

**Plan and spec share a session** because they are the one seam the feature folder does
not bridge. `plan-feature` settles decisions "about one behaviour" that get no file of
their own — they are carried in the plan for `spec-feature` to land in a criterion's body.
Keeping the two together consumes them before the boundary. It also puts the human gate
and the criteria they are ratifying in the same session, which is where a human can act on
them.

### `speccle next` — the derivation

A new oracle command. Deterministic, no LLM, `--json` like the rest:

| What it observes                            | The stage         |
| ------------------------------------------- | ----------------- |
| no `SPEC.md`                                | spec              |
| `SPEC.md` present, `lint` fails             | spec, unfinished  |
| lints clean, `claims` reports unclaimed ids | implement         |
| lints clean, every criterion claimed        | the slice is done |

Everything the subagent prompts used to carry falls out of those same two checks:

- **The route** — `SPEC.md` exists means amend.
- **Tracer or not** ([ADR-0013](0013-implement-feature-traces-one-criterion-end-to-end-first.md))
  — any criterion already claimed means something is built, so no tracer. This is what the
  tracer rule actually cares about; the route was only ever a proxy for it.
- **Retired ids whose tests must go** — `claims` already fails a test claiming an id that
  does not exist. That is the check, not a note to pass along.

**`next` is step 1 of `feature`, on every invocation.** The human never types it; they type
`/feature`, exactly as before. It branches:

- nothing in flight, a description given → plan
- nothing in flight, nothing given → ask what to build
- one slice in flight → resume it at its stage
- several in flight → ask which, or match what was typed

**`next` never routes to plan, and never asks new-versus-amend.** Before session A there is
no folder to look at; by the time `next` is ever called the folder exists and the spec is
written, so the route is already settled and no longer interesting. Routing stays where it
belongs — `plan-feature`, deciding by where the behaviour lives
([ADR-0023](0023-plan-feature-routes-new-amend-or-carve.md)).

**`next` stops at `claims` and never runs the test suite.** "Every criterion claimed" is
enough to say implementation is done. Whether the tests pass is the checks-gate's question,
and the implement session runs that anyway. Running a suite to answer "where am I" would
make orientation cost more than the work.

**`next` stops at green.** A slice that is green may have been finished an hour ago or a
month ago, and the folder cannot tell those apart — because review's unit is the change set,
not the slice ([ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)).
`feature` closes by pointing at review rather than routing to it. That is the one seam where
the human is handed off instead of resumed, and it is a loop boundary, not a gap.

### `feature` becomes a router

It no longer orchestrates a run it holds in memory. It asks `next` where the slice is, runs
that one stage, and ends by printing the command for the next session. ADR-0022's four-skill
decomposition stands; what changes is that the orchestrator re-derives its state instead of
carrying it.

## Consequences

- **Deriving is cheaper than storing.** Measured against a real Swift target of 11 features,
  350 criteria and 50 test files: `lint` 108ms, `claims` 111ms — against 100ms and 97ms on
  this repo's 13 criteria. Node's own startup (33ms) costs more than the work. The checks
  parse markdown headings and scan test names; they scale with the slice, not the repo, and
  `claims` scopes test discovery to the feature folder. A large slice does not wait.
- **Each session reads the folder cold** — `SPEC.md`, `CONTEXT.md`, `CLAUDE.md`, `decisions/`.
  That is the real cost, and it is bounded by the slice's markdown, against today's unbounded
  accumulation of red-green loops and test output.
- **ADR-0034's hand-off claim becomes load-bearing rather than aspirational.** A subagent
  could still be handed context in its prompt; a session cannot. What is not written into the
  slice now genuinely does not survive.
- The human invokes `/feature` two or three times per feature instead of once. Every session
  ends naming the next command, so the cost is typing, not remembering.
- Two slices genuinely in flight makes `next` ask which. Rare, and one question.
- `next` is new oracle surface to build and the first command whose answer is a _stage_ rather
  than a violation — so it owns the mapping from check results to stage, and that mapping has
  exactly one home.
