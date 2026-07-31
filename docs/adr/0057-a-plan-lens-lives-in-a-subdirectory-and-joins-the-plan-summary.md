# 0057 — a plan lens lives in a subdirectory and joins the plan summary

- Status: accepted
- Date: 2026-07-31
- Implements the one new surface
  [ADR-0056](0056-a-repo-extends-speccle-with-checks-that-gate-and-lenses-that-advise.md)
  allows, and inherits its two rules unchanged.

## Context

ADR-0056 settled that a repo extends Speccle through two surfaces, that only the deterministic
one may gate, and that advisory judgement is allowed exactly where something reads it. It
named a **plan lens** as the one surface still missing: the existing fan-out aimed at a slice's
markdown instead of a change set, at the one stage with an attended reader.

That leaves three mechanical questions the ADR did not answer, each with a wrong answer that is
easy to reach.

## Decision

### A plan lens lives in `.speccle/lenses/plan/`, not behind a flag in the file

The alternative was a discriminator inside the lens — frontmatter naming the stage — with every
lens flat in `.speccle/lenses/`. It fails on the reader that already exists: `panel()` lists that
directory and keeps every `*.md`, so a flat plan lens is run by the review panel from the moment
it is written, over a change set it was never aimed at. Fixing that means every reader parses
each lens before it can know whether to run it, and a lens whose frontmatter is missing or
misspelled silently joins the wrong panel.

A subdirectory needs no parsing and no new rule: the listing is not recursive and keeps only
`*.md`, so `plan/` is already invisible to it. The glob stays as literal as it reads.

The cost is one asymmetry with `.speccle/checks/`, where the scaffold's README is inert for free
because the loader reads only `*.json`. Here documentation and content share an extension, so
**`README.md` is excluded by name** — stated in the fan-out instruction and in the template's own
last line.

### It runs in `plan-feature`, before the summary is written

Not in the `feature` router between the plan and the gate. Both put the findings on the screen
the human approves, but only one also covers `plan-feature` run standalone, which is a supported
way to use it — a plan is a cheap thing to be wrong about out loud. Running it inside the skill
makes the findings part of the summary rather than an appendix to it, and leaves the router with
a single clause: a finding it carries is advice, never a red.

It runs after the key decisions are captured, because a lens judging a plan with half its
decisions unsettled is judging a draft. It never reopens the questioning — a lens is a comment
on the answers, not a new question — and it may not revise the plan silently: an obviously
correct finding is applied and announced with the lens named, and everything else goes to the
human.

### No oracle command runs it

The fan-out is subagents in the skill's own session, the way the local review driver works.
`speccle review run` remains the package's one LLM caller
([ADR-0047](0047-the-ci-driver-ships-in-the-tarball-and-is-the-one-llm-caller.md)); a second
caller makes that boundary unverifiable, and this one would buy nothing — there is no CI stage
that plans a slice.

## Consequences

- `init` and `update` scaffold the directory with a README, written once and never overwritten,
  and `doctor` reports it: scaffolded, and how many lenses the repo has authored. ADR-0056's
  closing obligation — a surface `init` does not scaffold does not exist — applies to the surface
  that ADR created.
- Like `checks`, the arm sits outside `doctor`'s `ok`. Speccle ships no plan lens, so there is
  no version to be stale against, and an unauthored surface is a choice rather than a defect.
- A repo pays one model call per plan lens per feature, only if it wrote one, on the stage that
  already spends real tokens on dialogue.
- The empty quadrant ADR-0056 left empty stays empty. This adds judgement that advises at a
  stage with a reader; it adds nothing that can fail a stage.
