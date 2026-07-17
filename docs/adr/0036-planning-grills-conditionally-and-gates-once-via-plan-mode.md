# 0036 — planning grills conditionally and gates once via plan mode

- Status: accepted
- Date: 2026-07-17
- Extends [ADR-0027](0027-plan-feature-settles-key-decisions-with-the-human.md)

## Context

The old flow planned without flagging anything: decisions the input left open were
silently resolved by the agent, and what the human did decide lived only in the
session. Over time that knowledge is lost — the exact complaint the vertical-slice
docs exist to prevent. Meanwhile the redesigned pipeline
([ADR-0034](0034-feature-runs-spec-and-implement-in-subagents-with-the-slice-as-hand-off.md),
[ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md))
concentrates all human judgement at the front, so the plan step must carry it.

## Decision

`plan-feature` becomes a grilling step, and the pipeline's one human gate:

1. **Explore, route, check the language.** Explore the repo, route the work
   ([ADR-0023](0023-plan-feature-routes-new-amend-or-carve.md)), and check the request
   against the feature's `CONTEXT.md` and the root glossary.
2. **Grill conditionally, not ceremonially.** Ask only the questions whose answers
   change the plan — one at a time, each with a recommended answer. If nothing is
   genuinely open, say so and move on; never manufacture questions.
3. **Capture decisions inline, the moment they land.** Feature-level decisions go to
   `<feature>/decisions/` and the feature's `CONTEXT.md`; repo-wide ones to
   `docs/adr/` and the root `CONTEXT.md` — written during the dialogue, before any
   pipeline step runs, so they are on disk for the subagents and for every future
   session.
4. **End with an easy-to-read summary, then gate via plan mode.** With decisions
   already captured, the orchestrator enters plan mode and presents the plan summary
   as the approval prompt. Approving it launches the autonomous pipeline: spec
   subagent → implement subagent → checks-gate → auto-commit. If the session is
   already in plan mode when the run starts, decision capture defers to just after
   approval — same flow, capture slides one step later.

## Consequences

- The single gate carries real weight: everything after approval is autonomous, so
  plan quality bounds run quality.
- Knowledge loss is attacked at the source — a decision is written when made, not
  remembered by a session that dies.
- Planning gets slower for genuinely open requests and stays fast for closed ones;
  the conditional rule is what keeps the gate from becoming ceremony.
