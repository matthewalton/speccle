# 0024 — `conform` updates governed slices to the current convention

- Status: accepted
- Date: 2026-07-11

## Context

The convention moves. ADR-0019 (fixed folder shape), ADR-0020 (every feature carries
an `AGENTS.md`), and ADR-0021 (decisions are ADRs, `CONTEXT.md` is glossary-only)
landed in one day, and any feature scaffolded before them is nonconforming by
definition. ADR-0021's consequences already mandate a migration — existing features
move their Decisions bullets into `decisions/` files — but no skill owns that work.
Every future convention change has the same shape: correctly-built slices drift
silently, and the only remedies are hand-work or nothing.

Carve does not cover this: a carve brings _ungoverned_ code under the convention,
while these slices are already governed — their contract exists and their criteria
are owned. Amend does not cover it either: an amend changes what criteria _mean_,
and here the meaning must survive untouched.

## Decision

A standalone maintenance skill, **`conform`**, brings already-governed slices up to
the current convention. Like `strengthen`, it is not a pipeline stage.

- **Sweep by default.** Given a project root, it finds every `SPEC.md` by the
  convention's spec-discovery rules and conforms each; given one feature folder, it
  conforms just that one.
- **Form changes only, behaviour never.** The finished diff shows markdown, file
  moves (with their import and runner-config fixes), and criterion-id tags in test
  names — no source-semantic change. Criterion ids are never renumbered or reused.
- **The drift checklist is judgement, in the skill.** `oracle lint` stays the only
  deterministic check ([ADR-0001](0001-plugin-first-tools-serve-skills.md),
  [ADR-0007](0007-lint-rules-are-fixed-heuristics.md)); folder-shape diagnosis —
  catch-all names, missing contract files, code loose at the root, decisions content
  in `CONTEXT.md` — is the skill reading the folder against the bundled convention.
- **A statement reworded to satisfy lint is a contract change** and is announced in
  the spec summary like any other
  ([ADR-0018](0018-skills-announce-criteria-and-end-with-a-spec-summary.md)) —
  old and new statement side by side, same id.
- **Unclaimed criteria are findings, not fixes.** Writing tests is carve and
  strengthen territory; conform reports the gap and names the next skill.

## Consequences

- Convention updates now ship with a way to apply them; ADR-0021's mandated migration
  has an owner.
- The skill list grows by one, and the glossary gains **conform** — "migrate",
  "retrofit", and "backfill" stay reserved as avoided synonyms of _carve_.
- Shape diagnosis is judgement, so it can misread a folder where a deterministic
  check could not. Accepted for now; a deterministic oracle `shape` check is the
  natural follow-up once the drift kinds stabilise.
- A conform run can end with reworded statements the human then overrules in the
  spec summary — the same after-the-fact ownership every other skill uses.
