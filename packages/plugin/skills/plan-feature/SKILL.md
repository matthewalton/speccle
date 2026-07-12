---
name: plan-feature
description: Shape a feature request into a plan — take prose, a ticket, or a conversation as it comes, explore the repo, and route the work — a new slice, an amendment to the slice that already owns the behaviour, or a carve — announcing the route, feature folder, and key. Use when the user wants to plan or scope a feature before building it, asks where a behaviour should live, or asks whether something is a new feature or a change to an existing one.
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/references/**)
---

# plan-feature

Turn a feature request — in whatever form it arrives — into a plan the rest of the
pipeline can execute: the **route**, the **feature folder**, and the **feature key**.
This is stage 1 of the `feature` pipeline
([ADR-0022](https://github.com/matthewalton/speccle/blob/main/docs/adr/0022-feature-orchestrates-plan-spec-implement-strengthen.md)),
and it is also useful alone: a plan is a cheap thing to be wrong about out loud.

The folder shape and key rules this skill plans against are fixed by the convention,
bundled beside this skill. Read `${CLAUDE_SKILL_DIR}/references/convention.md` before
shaping anything.

Speccle's words are fixed and mandatory: "amend", not "edit" or "update"; "feature
key", not "prefix"; "criterion id", not "tag". The canonical glossary is
[CONTEXT.md](https://github.com/matthewalton/speccle/blob/main/CONTEXT.md).

## 1. Take the input as it comes

Prose, a ticket, a scratch file, a conversation, or a `SPEC.md` someone already wrote
to the convention. Never send the user away to reformat something first. If the input
is already a conventioned `SPEC.md`, the criteria are owned — the plan adopts them
as-is and routes on where that spec should live.

## 2. Explore before routing

The route is decided by **where the behaviour lives**, and finding that out means
looking
([ADR-0023](https://github.com/matthewalton/speccle/blob/main/docs/adr/0023-plan-feature-routes-new-amend-or-carve.md)):

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

## 4. Announce the plan — and keep going

Show the route, the feature folder, the key, and the scope, then proceed — as part of
the `feature` pipeline that means invoking `spec-feature`; standalone it means handing
the plan back. Do not wait for approval
([ADR-0018](https://github.com/matthewalton/speccle/blob/main/docs/adr/0018-skills-announce-criteria-and-end-with-a-spec-summary.md));
a misrouted plan is corrected by interrupt, like any other announcement.

This skill drafts no criteria and writes no files — a plan that turns out wrong at
the spec or implement stage is revised there, not defended here.
