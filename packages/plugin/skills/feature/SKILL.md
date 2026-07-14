---
name: feature
description: Build or change a feature end to end — plan the slice and route it (new folder, or amend the slice that already owns the behaviour), draft or amend its markdown contract, lint clean, implement with tagged tests, then measure oracle strength as the built-in review gate. Use when the user wants to build, implement, or spec a feature, extend or amend an existing one, hands over a ticket or prose description to turn into a slice, or says "speccle this", "implement this feature", "add this to the checkout feature".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# feature

The pipeline: **plan → spec → implement → strengthen**. Each stage is a sibling skill
of this one, invoked with the Skill tool, in order, with one permitted stop: key
decisions the input leaves open are settled with the user at the plan stage. Invoke
each child under whatever namespace this skill itself runs in — `speccle:plan-feature`
when installed as the plugin, bare `plan-feature` when the skills live project-level.
This skill owns the sequencing and the state carried between stages — the judgement
lives in the children, and each child is also invocable on its own.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "amend", not
"edit" or "update"; "spec summary", not "approval gate".

## The pipeline

1. **`plan-feature`** — takes the input as it comes, explores the repo,
   settles any key decisions the input leaves open with the user — the pipeline's one
   blocking stop — and announces the plan: the **route** (new / amend / carve), the
   feature folder, the key, and each key decision with how it was settled.
   If the route is **carve**, stop here: hand the user to `carve-feature` — the
   behaviour already runs, and governing it is a different job. A mixed request is a
   carve followed by a `feature` run in amend mode, never one pass.
2. **`spec-feature`** — drafts (new) or amends (amend) the markdown contract,
   lints until clean, announces the criteria, and keeps going.
3. **`implement-feature`** — tagged tests first, then the code that makes
   them green, one criterion at a time. Tracer criterion first on the **new** route;
   no tracer on **amend** — the slice's path already runs.
4. **`strengthen`** — the built-in review gate: measure oracle strength on
   the slice just built and route every surviving mutant. If the target lacks the
   required stack, report the slice green-but-unmeasured and stop — never re-tool
   the target silently.

## Carrying state between stages

Each child is told, when invoked, what the earlier stages decided: the route, the
feature folder, the key, and the key decisions settled at the plan stage — each marked
agreed or defaulted. Do not make a child re-derive them — and do not override
a child's own judgement with them either; if `spec-feature` finds the plan's shape
wrong while drafting, the plan was wrong, and saying so beats obeying it.

## One stop, one summary

Children announce as they go — the plan, then the criteria the moment they lint
clean.
The human interrupts at any point; past the plan stage's key decisions, the pipeline
never waits. Treat "looks good, and also…" at any stage as a change request: re-enter
the stage it names and re-run the stages after it.

The run ends with the **one spec summary for the whole pipeline**: every criterion
drafted, amended, or retired — by `spec-feature` and by `strengthen`'s human path
alike — every key decision that was defaulted rather than agreed — plus the strengthen
outcome (headline oracle strength, and each remaining survivor's exit). An overruled
criterion is reverted along with its tests; an overruled decision re-enters the spec
stage.
