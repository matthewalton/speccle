# 0023 — `plan-feature` routes a request: new, amend, or carve

- Status: accepted
- Date: 2026-07-11

## Context

"Build a feature" hides three different jobs, and the old monolithic
`implement-feature` only defined one of them:

- The behaviour has **no home yet** — a new slice is scaffolded.
- The behaviour **belongs to a slice that already exists**: new criteria are added
  (extending), or existing criteria are reworded or retired (amending). The monolith
  left this undefined — it only knew how to scaffold, so extending a slice risked a
  second folder for behaviour that already had an owner.
- The behaviour **already runs but is ungoverned** — that is a carve, owned by
  `carve-feature` ([ADR-0017](0017-carve-feature-specs-observed-behaviour-and-changes-no-code.md)).

Asking the user to pick the mode up front pushes a routing question onto someone who
just wants the behaviour to exist. The repo already answers it: either a governed
slice owns this behaviour or it does not.

## Decision

Routing is `plan-feature`'s job, decided by **where the behaviour lives**, and
announced rather than asked:

- **New** — no existing slice owns the behaviour. The pipeline scaffolds a named
  feature folder and the implementation fires a tracer criterion first
  ([ADR-0013](0013-implement-feature-traces-one-criterion-end-to-end-first.md)).
- **Amend** — a governed slice already owns it. One route covers extending and
  changing: `spec-feature` amends the existing `SPEC.md` in place — new criteria take
  the next never-used numbers, a retired behaviour retires its id, and the slice's
  existing `CONTEXT.md` vocabulary is adopted, never re-invented. `implement-feature`
  fires **no tracer**: the slice's path already runs, so there is nothing to prove —
  the same reason a carve has none.
- **Carve** — the behaviour already runs ungoverned. `plan-feature` stops and hands
  to `carve-feature`; a request that mixes the two ("govern this and add X") is a
  carve followed by an amend, never one pass.

The route is announced with the rest of the plan and the pipeline keeps going
([ADR-0018](0018-skills-announce-criteria-and-end-with-a-spec-summary.md)); a
misrouted request is corrected by interrupt, like any other announcement.

## Consequences

- Extending or amending an existing slice becomes first-class instead of undefined —
  no second folder, no renumbered ids, no re-drafted glossary.
- The user never picks a mode; describing the behaviour is enough. The cost is that
  `plan-feature` must actually look — reading existing `SPEC.md`s is part of its job,
  not an optimisation.
- "Amend" enters the glossary as the umbrella for extend-and-change, matching the
  spec summary's existing language of criteria drafted, amended, or retired.
