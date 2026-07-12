# 0027 — `plan-feature` settles key decisions with the human

- Status: accepted; amends the no-blocking rule in
  [ADR-0018](0018-skills-announce-criteria-and-end-with-a-spec-summary.md)
- Date: 2026-07-12

## Context

[ADR-0018](0018-skills-announce-criteria-and-end-with-a-spec-summary.md) removed every
blocking stop: skills announce and keep going, and human ownership is exercised in the
spec summary or by interrupt. That trade was made for criteria, which are cheap to
amend after the fact — everything sits in git, and the skills support incremental
amendment.

Some choices a feature request leaves open are not criteria. A policy (rounding,
retention, who may retry), a data shape, an external contract — choices with more than
one viable answer where the input does not say which, and where the answer shapes the
slice across criteria. Guessing one of these wrong is not a reworded statement; it is
a revert of spec, tests, and code together. And unlike a wrong criterion, a wrong guess
here does not look wrong in the announcement — the plan reads fine either way, so the
interrupt that ADR-0018 relies on never fires. In an unattended run there is no one to
interrupt at all: the guess sails through all four stages before anyone rules on it.

Planning is the stage that exists to be wrong out loud, before anything is written.
That makes it the natural — and cheapest — place to settle these choices together.

## Decision

A **key decision** is a choice the input leaves open, with more than one viable
answer, that materially shapes the slice across criteria. `plan-feature` identifies
them while shaping the slice and **puts each one to the human before announcing the
plan**: the options, a recommendation, and why. This is the one place the pipeline
blocks — a scoped amendment to ADR-0018, whose announce-and-keep-going rule is
unchanged everywhere else.

The boundary is deliberately narrow:

- **A choice the input already settles is not open.** Read the PRD, ticket, or
  conversation first; adopt what it says.
- **Routing is never a key decision.** It is decided by where the behaviour lives and
  announced, not asked ([ADR-0023](0023-plan-feature-routes-new-amend-or-carve.md)).
- **Naming, statement wording, and single-behaviour details are not key decisions.**
  They belong to `spec-feature` and the criterion body.

When no human can answer — an unattended run — `plan-feature` takes its recommended
option and flags the decision as **defaulted**, in the plan announcement and again in
the spec summary. A defaulted decision is never silent.

Settled decisions travel with the plan. `plan-feature` still writes no files:
`spec-feature` records each decision by the existing routing rule — a choice spanning
criteria becomes an ADR in the feature's `decisions/`
([ADR-0021](0021-feature-decisions-are-adrs-context-md-is-glossary-only.md)), a choice
about one behaviour lands in that criterion's body.

## Consequences

- The pipeline is no longer strictly stop-free: one stop, at the cheapest stage, and
  only when the input leaves a key decision open. A request whose PRD settles
  everything still runs end to end without waiting.
- Wrong-guess reverts of spec-plus-tests-plus-code become rarer; the human buys that
  with a question at plan time instead of a discovery at review time.
- Unattended runs still complete — defaults are taken and flagged rather than blocking
  forever, and the spec summary is where they get overruled.
- Every key decision ends up documented in the feature's contract, whether agreed or
  defaulted — none live only in the conversation.
- "Key decision" and "defaulted" enter the glossary.
