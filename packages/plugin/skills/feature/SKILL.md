---
name: feature
description: Build or change a feature end to end — plan it with the human (settling the open decisions and capturing each one in the slice's docs), gate once on plan approval, then run spec and implement in their own subagent sessions, close with the deterministic checks-gate (lint, claims, tests), and commit on green without asking. Use when the user wants to build, implement, or spec a feature, extend or amend an existing one, hands over a ticket or prose description to turn into a slice, or says "speccle this", "implement this feature", "add this to the checkout feature".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# feature

The pipeline: **plan → gate → spec → implement → checks → commit**. Planning is a
dialogue in this session; spec and implement each run in their own subagent session;
the checks are deterministic oracle commands; the commit is automatic. The pipeline
has exactly **one human gate** — plan approval — and it sits before anything is
built. Everything after it runs unattended.

Invoke each sibling skill under whatever namespace this skill itself runs in —
`speccle:plan-feature` when installed as the plugin, bare `plan-feature` when the
skills live project-level.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "amend", not
"edit" or "update"; "checks-gate", not "review step"; "spec summary", not "approval
gate".

## 1. Plan — in this session, with the human

Invoke `plan-feature` with the Skill tool, in this session — never in a subagent:
planning is a dialogue, and a subagent cannot talk to the human. It explores, routes
(**new** / **amend** / **carve**), settles the open key decisions one question at a
time, captures each settled decision into the slice's docs the moment it lands, and
ends with the plan summary.

If the route is **carve**, stop here: hand the user to `carve-feature` — the
behaviour already runs, and governing it is a different job. A mixed request is a
carve followed by a `feature` run in amend mode, never one pass.

## 2. The gate — plan approval

The plan summary is the pipeline's one approval. Where plan mode is available, enter
plan mode and present the summary as the plan — approving it launches everything
after. Where it is not, show the summary in chat and wait for the go-ahead.

- **Approval starts the machine.** If any decision was captured only in the summary
  because writes were forbidden during planning (the session was already in plan
  mode), write those docs now, before the spec stage — the subagents read the folder,
  not this conversation.
- **An unattended run cannot approve.** Do not hang: continue with the plan as
  announced, every open decision defaulted to its recommendation and flagged — in the
  plan summary and again at the end. A defaulted decision is never silent.

## 3. Spec — a subagent, off the plan

Launch a subagent whose prompt carries the full hand-off: the route, the feature
folder, the key, the scope, each settled decision (agreed or defaulted), and any
per-behaviour choice the plan noted for a criterion body. Instruct it to invoke
`spec-feature` with that input and to return the criteria — ids and statements,
retirements included — once the folder lints clean.

The subagent never saw the planning dialogue. Everything it needs must be in the
prompt or on disk — that is the design, not a limitation: if the hand-off feels too
thin to spec from, the plan was too thin, and the fix is a better plan, not a fatter
prompt.

Show the returned criteria to the human as an FYI — reading five headings is cheap
insurance before implementation spends real effort on a wrong spec. Do not wait for
approval; an interjection is a change request (re-enter the stage it names), silence
is consent.

## 4. Implement — a subagent, off the spec

Launch a second subagent: the prompt names the feature folder, the route (tracer on
**new**, none on **amend**), and any retired ids whose tests must go. Instruct it to
invoke `implement-feature`. It works from the linted spec and the slice's docs — the
folder is the brief — and returns which criteria went green plus anything it changed
in the spec along the way.

## 5. The checks-gate — deterministic, no judgement

Run in this session, resolving the oracle as every Speccle skill does
(`speccle-oracle` on `PATH`, else `node <speccle-repo>/packages/oracle/src/cli.ts`):

1. `<oracle> lint <feature-folder>` — exit `0`.
2. `<oracle> claims <target-root>` — exit `0`: every criterion claimed by a test
   name, every claimed id real.
3. The project's test suite — green.

A failure returns to the implement subagent with the failing output — not to the
human. If the same failure comes back twice, stop and show the human what is stuck.
There is no judgement here and no oracle-strength measurement — the heatmap is
`strengthen`'s job, on its own cadence, and this gate stays seconds cheap.

## 6. Summary, then commit — no pause

Render one screen, in product voice: every criterion drafted, amended, or retired
(ids and statements), what claims it, the implement subagent's notes, and every
decision that was defaulted rather than agreed. This is the spec summary for the
whole run — the human rules by reading it, not by being asked.

Then commit, automatically: stage the feature folder and only the files this run
touched, and write the message the repo's conventions ask for, derived from the
route — a new slice is introduced, an amendment names the behaviour that changed. No
"commit? y/n": on a green gate the pause is ceremony, and a commit the summary makes
the human regret is one revert away.
