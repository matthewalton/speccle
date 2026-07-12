---
name: plan-feature
description: Shape a feature request into a plan — take prose, a ticket, or a conversation as it comes, explore the repo, route the work — a new slice, an amendment to the slice that already owns the behaviour, or a carve — and settle any key decisions the input leaves open with the user before announcing the route, feature folder, and key. Use when the user wants to plan or scope a feature before building it, asks where a behaviour should live, wants to agree open decisions about a feature, or asks whether something is a new feature or a change to an existing one.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# plan-feature

Turn a feature request — in whatever form it arrives — into a plan the rest of the
pipeline can execute: the **route**, the **feature folder**, and the **feature key**.
This is stage 1 of the `feature` pipeline, and it is also useful alone: a plan is a
cheap thing to be wrong about out loud.

The folder shape and key rules this skill plans against are fixed by the convention,
bundled beside this skill. Read `${CLAUDE_SKILL_DIR}/references/convention.md` before
shaping anything.

Speccle's words are fixed and mandatory: "amend", not "edit" or "update"; "feature
key", not "prefix"; "criterion id", not "tag".

## 1. Take the input as it comes

Prose, a ticket, a scratch file, a conversation, or a `SPEC.md` someone already wrote
to the convention. Never send the user away to reformat something first. If the input
is already a conventioned `SPEC.md`, the criteria are owned — the plan adopts them
as-is and routes on where that spec should live.

## 2. Explore before routing

The route is decided by **where the behaviour lives**, and finding that out means
looking:

- Find every existing feature folder — every `SPEC.md` — and read each one's key and
  criteria statements. This is also the key-collision check, so it is never wasted.
- Read the project's layout: where feature folders sit, what the test runner is, how
  the slice would be reached from the outside.

Then route:

- **New** — no governed slice owns the behaviour. The plan names a new feature folder
  and key.
- **Amend** — a governed slice already owns it. Extending (new criteria) and changing
  (rewording or retiring criteria) are the same route: the plan names the owning
  folder and its existing key. Never plan a second folder for behaviour that has an
  owner.
- **Carve** — the behaviour already runs but is ungoverned. Stop and hand to
  `carve-feature`; a request that mixes governing and changing is a carve followed by
  an amend, never one pass.

When the call is genuinely close — the behaviour half-belongs to an existing slice —
route **amend** and say why: two slices owning one behaviour is the expensive mistake,
and a wrongly-amended slice is cheap to split later.

## 3. Shape the slice

- **Where the feature folder goes** (new route). Match the project's existing layout;
  if other feature folders exist, sit beside them. The folder is **named for the
  feature** — never an unnamed catch-all like `src/` or `lib/` — even when it is the
  project's first.
- **The feature key.** New route: `[A-Z][A-Z0-9]{1,9}`, unique across the repo — you
  already read every other spec's frontmatter in phase 2. Amend route: the slice's
  existing key, never a new one.
- **The slice's scope.** Name the behaviours the spec will cover, in a sentence or
  two each — what is in, and what is deliberately out. These are raw material for
  `spec-feature`, not criteria: leave the statements to the drafting.

## 4. Settle key decisions — together

Planning is where open choices get agreed, not guessed. A **key decision** is a choice
the input leaves open, with more than one viable answer, that materially shapes the
slice across criteria — a policy (rounding, retention, who may retry), a data shape,
an external contract.

- **Check the input first.** A choice the PRD, ticket, or conversation already settles
  is not open — adopt it. Routing is never a key decision: it is decided by where the
  behaviour lives and announced.
  Naming, statement wording, and single-behaviour details belong to `spec-feature` and
  the criterion body.
- **Put each open key decision to the user** before announcing the plan: the options,
  a recommendation, and why — as one round of questions, not a drip
  (AskUserQuestion where available). This is the one place the pipeline blocks: a
  wrong guess here is baked into spec, tests, and code before the summary would
  surface it.
- **If no one can answer** — an unattended run — take the recommendation and flag the
  decision as **defaulted**, in the plan announcement and again in the spec summary.
  A defaulted decision is never silent.
- **Settled decisions travel with the plan.** This skill still writes no files:
  `spec-feature` records each one — a choice spanning criteria becomes an ADR in the
  feature's `decisions/`, a choice about one behaviour lands in that criterion's body.

## 5. Announce the plan — and keep going

Show the route, the feature folder, the key, the scope, and each key decision with how
it was settled — from the input, agreed, or defaulted. Then proceed — as part of the
`feature` pipeline that means invoking `spec-feature`; standalone it means handing the
plan back. The plan itself is not pre-approved;
open key decisions were the one thing worth waiting for, and they were settled in
phase 4 — a misrouted plan is corrected by interrupt, like any other announcement.

This skill drafts no criteria and writes no files — a plan that turns out wrong at
the spec or implement stage is revised there, not defended here.
