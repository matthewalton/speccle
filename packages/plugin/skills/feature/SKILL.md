---
name: feature
description: Build or change a feature end to end — plan the slice and route it (new folder, or amend the slice that already owns the behaviour), draft or amend its markdown contract, lint clean, implement with tagged tests, then measure oracle strength as the built-in review gate. Use when the user wants to build, implement, or spec a feature, extend or amend an existing one, hands over a ticket or prose description to turn into a slice, or says "speccle this", "implement this feature", "add this to the checkout feature".
---

# feature

The pipeline: **plan → spec → implement → strengthen**. Each stage is a child skill of
this plugin, invoked with the Skill tool, in order, with no stops between them
([ADR-0022](https://github.com/matthewalton/speccle/blob/main/docs/adr/0022-feature-orchestrates-plan-spec-implement-strengthen.md)).
This skill owns the sequencing and the state carried between stages — the judgement
lives in the children, and each child is also invocable on its own.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "amend", not
"edit" or "update"; "spec summary", not "approval gate". The canonical glossary is
[CONTEXT.md](https://github.com/matthewalton/speccle/blob/main/CONTEXT.md).

## The pipeline

1. **`speccle:plan-feature`** — takes the input as it comes, explores the repo, and
   announces the plan: the **route** (new / amend / carve), the feature folder, and
   the key
   ([ADR-0023](https://github.com/matthewalton/speccle/blob/main/docs/adr/0023-plan-feature-routes-new-amend-or-carve.md)).
   If the route is **carve**, stop here: hand the user to `carve-feature` — the
   behaviour already runs, and governing it is a different job. A mixed request is a
   carve followed by a `feature` run in amend mode, never one pass.
2. **`speccle:spec-feature`** — drafts (new) or amends (amend) the markdown contract,
   lints until clean, announces the criteria, and keeps going.
3. **`speccle:implement-feature`** — tagged tests first, then the code that makes
   them green, one criterion at a time. Tracer criterion first on the **new** route;
   no tracer on **amend** — the slice's path already runs.
4. **`speccle:strengthen`** — the built-in review gate: measure oracle strength on
   the slice just built and route every surviving mutant. If the target lacks the
   required stack, report the slice green-but-unmeasured and stop — never re-tool
   the target silently.

## Carrying state between stages

Each child is told, when invoked, what the earlier stages decided: the route, the
feature folder, and the key. Do not make a child re-derive them — and do not override
a child's own judgement with them either; if `spec-feature` finds the plan's shape
wrong while drafting, the plan was wrong, and saying so beats obeying it.

## No stops, one summary

Children announce as they go — the plan, then the criteria the moment they lint clean
([ADR-0018](https://github.com/matthewalton/speccle/blob/main/docs/adr/0018-skills-announce-criteria-and-end-with-a-spec-summary.md)).
The human interrupts at any point; the pipeline never waits. Treat "looks good, and
also…" at any stage as a change request: re-enter the stage it names and re-run the
stages after it.

The run ends with the **one spec summary for the whole pipeline**: every criterion
drafted, amended, or retired — by `spec-feature` and by `strengthen`'s human path
alike — plus the strengthen outcome (headline oracle strength, and each remaining
survivor's exit). An overruled criterion is reverted along with its tests.
