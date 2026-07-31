---
name: feature
description: Build or change a feature one session at a time — ask the slice's folder what stage the work is at, then run that one stage: plan and spec it with the human, or implement exactly one criterion and commit it on a green gate. Use when the user wants to build, implement, or spec a feature, extend or amend an existing one, hands over a ticket or prose description to turn into a slice, wants to carry on with a slice already underway, or says "speccle this", "implement this feature", "add this to the checkout feature", "carry on with the basket slice".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# feature

**One invocation runs one stage.** This skill is a router, not a pipeline: it asks the
feature folder what stage the work is at, runs that one stage, and ends by naming the
command for the next session. It carries no state between sessions and stores none —
the folder is the record, and a fresh session reads it cold.

Invoke each sibling skill under whatever namespace this skill itself runs in —
`speccle:plan-feature` when installed as the plugin, bare `plan-feature` when the
skills live project-level.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "amend", not
"edit" or "update"; "checks-gate", not "review step"; "spec summary", not "approval
gate".

## 1. Ask the folder where the work is

**Step 1 on every invocation, before anything else.** Resolve the oracle as every
Speccle skill does — the repo's own `<repo-root>/node_modules/.bin/speccle` first (a
devDependency is never on `PATH`, so test for the file), else `speccle` on `PATH`, else
`node <speccle-repo>/packages/oracle/src/cli.ts`; if none resolves, point at the
README's install steps and stop. Then:

```sh
<oracle> next <project-root> --json
```

It derives the stage from the folder and never guesses: `stage` and `slice` name the one
thing to do when exactly one slice is in flight, `criterion` names which criterion an
implement session takes, `tracerOwed` says whether anything is built yet, `inFlight`
lists the slices with work left, and `done` says every slice is finished. It calls no
model, runs no test suite, and never routes to plan or to review — those two calls are
this skill's, below.

Do not derive the stage by reading the folder yourself, and never write a progress file.
A file claiming `spec: done` about a spec that does not lint is worse than no file: the
folder already answers the question, and it cannot go stale.

## 2. Route on what it said

| `next` reports                         | The human named                     | This session                                                      |
| -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| no slice at all, or every slice `done` | a feature or a change               | §3 — plan and spec it                                             |
| no slice at all, or every slice `done` | nothing                             | ask what to build, then §3. If slices just finished, say so first |
| one slice in flight                    | nothing, or that slice              | §4 — resume it at the stage `next` named                          |
| one slice in flight                    | behaviour its spec does not promise | name what is in flight and ask: finish it, or plan the new work   |
| several in flight                      | one of them                         | §4 on that one                                                    |
| several in flight                      | nothing                             | ask which — list them with the stage `next` gave each             |

**Finish before starting.** A slice in flight is the default answer. Two slices half-built
cost more than one built twice, so route to new work only when the human says so.

## 3. Plan and spec — this session, with the human

Plan and spec share one session, and it is the pipeline's **one human gate**. They share
it because planning settles choices about a single behaviour that get no file of their
own — they are carried in the plan for a criterion's body, so they must be spent before
the session ends.

1. **Plan.** Invoke `plan-feature` with the Skill tool, here in this session — never in a
   subagent: planning is a dialogue and a subagent cannot talk to the human. It explores,
   routes (**new** / **amend** / **carve**), settles the open key decisions one question at
   a time, captures each into the slice's docs as it lands, and ends with the plan summary.

2. **The gate.** The plan summary is the one approval. Where plan mode is available, enter
   plan mode and present the summary as the plan. Where it is not, show it in chat and wait.
   - **A plan-lens finding in the summary is advice, not a blocker.** Where the repo keeps
     plan lenses, the summary may carry what they found. Present it with the rest and let
     the human decide; never hold the gate open for one, and never treat it as a red.
   - **Approval starts the machine.** Any decision captured only in the summary because
     writes were forbidden gets written now, before the spec — later sessions read the
     folder, not this conversation.
   - **An unattended run cannot approve.** Do not hang: continue with the plan as announced,
     every open decision defaulted to its recommendation and flagged, in the summary and
     again at the end. A defaulted decision is never silent.

3. **Spec.** Invoke `spec-feature`, in this session too. It drafts or amends the contract
   and lints it clean. Show the returned criteria to the human as an FYI — reading five
   headings is cheap insurance before implementation spends real effort on a wrong spec. Do
   not wait for approval; an interjection is a change request, silence is consent.

4. **Commit the contract.** On a clean lint, stage the feature folder's markdown and commit
   it — this commit introduces the slice, so it names the slice rather than a criterion. No
   "commit? y/n": the human just approved the plan and read the criteria.

**If the route is carve, this session ends here.** The behaviour already runs, and
governing it is a different job with its own skill. Name `carve-feature` and stop — **do
not invoke it**, and do not spec the slice yourself. A request that mixes governing and
changing is a carve, then a separate `feature` session in amend mode; never one pass.

## 4. Implement — one criterion, unattended

Invoke `implement-feature` with the Skill tool, in this session, naming the feature folder
and the one criterion `next` gave. It writes that criterion's tests, makes them green, runs
the per-criterion checks-gate, and commits on green. When `tracerOwed` is true nothing is
built yet, so tell it to pick the tracer — the criterion whose passing test traces the
thinnest complete path through every layer — instead of taking `criterion` as given.

When the stage is `stale-claims` there is no criterion to implement yet: a test claims an id
no criterion declares. Delete those tests, confirm the code they defended is either still
promised by a live criterion or gone too, commit that, and stop. `next` names the criterion
in the following session.

When the stage is `spec` on a slice that already has a contract, the spec is unfinished —
`next` carries the lint violations that say why. Fix them with `spec-feature`, commit, stop.

## 5. End by naming the next command

Every session closes the same way, whatever stage it ran: re-run `<oracle> next` and tell
the human, in one or two lines, what it now says — the criterion the next session takes, or
that the slice is done. The cost of one session per stage is typing, not remembering, and
that only holds if the next command is on screen.

When `done` is true, say the slice is implemented and point at `review`. Do not route there:
review's unit is the change set, not the slice, and a slice green for a month looks
identical to one green for a minute. That hand-off is a loop boundary, not a gap.
