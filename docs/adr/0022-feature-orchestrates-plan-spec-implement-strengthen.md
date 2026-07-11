# 0022 — `feature` orchestrates plan → spec → implement → strengthen

- Status: accepted
- Date: 2026-07-11
- Amends [ADR-0013](0013-implement-feature-traces-one-criterion-end-to-end-first.md):
  the tracer rule now lives in the narrowed `implement-feature` and applies to the
  **new** route only (see [ADR-0023](0023-plan-feature-routes-new-amend-or-carve.md))

## Context

`implement-feature` is already a pipeline wearing one skill's clothes: take the input
as it comes → draft the markdown contract → lint clean → announce → trace one
criterion end to end → thicken → confirm done. One `SKILL.md` owns input-shaping,
spec drafting, and implementation, which has three costs:

- No phase is invocable on its own. A user with a hand-written spec cannot enter at
  implementation without the skill re-walking the drafting phases; a user who wants
  only a drafted spec cannot stop before code.
- The phases cannot vary by situation. Extending an existing slice needs a different
  spec phase (amend, don't scaffold) and a different implementation phase (no tracer)
  — undefined behaviour in the monolith.
- Oracle strength is measured never, or by a separate manual `strengthen` run. The
  natural cadence — measure the slice you just built — has no home.

## Decision

`feature` is an **orchestrator skill**: it runs the pipeline by invoking four child
skills in order, each of which is also independently invocable.

1. **`plan-feature`** — take the input as it comes, explore the repo, shape the slice,
   and route it ([ADR-0023](0023-plan-feature-routes-new-amend-or-carve.md)).
2. **`spec-feature`** — draft or amend the markdown contract, lint until clean,
   announce the criteria.
3. **`implement-feature`** — narrowed to its name: criterion-driven red-green — tagged
   tests first, then the code that makes them green, one criterion at a time.
4. **`strengthen`** — unchanged, invoked as the pipeline's built-in review gate; it
   also remains the standalone skill it already is.

Rules of the decomposition:

- **The orchestrator owns sequencing and carried state** (route, feature folder,
  key), never judgement that belongs to a child.
- **Children announce as they go** ([ADR-0018](0018-skills-announce-criteria-and-end-with-a-spec-summary.md));
  the orchestrator ends with the single spec summary for the whole run.
- **Each child's entry contract is honest standalone.** `spec-feature` accepts a plan
  or raw input; `implement-feature` requires a linted spec and says so rather than
  drafting one.
- **The plugin stays self-contained.** The red-green discipline is written into
  `implement-feature` itself — the pipeline never depends on a skill outside the
  plugin, in the spirit of [ADR-0014](0014-a-skill-bundles-the-docs-it-orders-you-to-read.md).

## Consequences

- `implement-feature`'s meaning narrows from "the whole pipeline" to "tests + code for
  an already-specced slice". The broad triggers ("implement this feature", "speccle
  this") move to `feature`'s description.
- A hand-written conventioned spec enters the pipeline at `implement-feature` without
  ceremony; a spec-only request stops after `spec-feature`.
- The skill list grows by three. Accepted: each child is a real entry point, not an
  internal detail promoted by accident.
- A `strengthen` gate at the end of every `feature` run makes mutation time part of
  building a feature. Where the target lacks the v1 stack, the gate reports the slice
  green-but-unmeasured and stops, exactly as standalone `strengthen` does — it never
  re-tools the target silently.
