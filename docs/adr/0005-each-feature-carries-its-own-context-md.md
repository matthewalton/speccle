# 0005 — Each feature carries its own CONTEXT.md

- Status: accepted
- Date: 2026-07-09

## Context

A spec's criteria can't express everything: domain terms, entities, and decisions that
span criteria need a home. A single project-level CONTEXT.md (the grill-with-docs
pattern) piles feature-specific language into one global file — part of what makes
projects feel messy. And with criterion bodies now free-form (ADR-0003), content could
smear across spec.md and any companion file without a crisp boundary.

## Decision

Every feature folder holds a `CONTEXT.md` beside its `spec.md`: the feature's glossary
(terms with _Avoid_ lines) plus decisions that span criteria. The boundary rule: about
a word or a cross-cutting choice → `CONTEXT.md`; about one behaviour → that criterion's
body in `spec.md`.

## Consequences

- The slice is self-describing: an agent landing in the folder needs nothing else.
- Two files per feature is the floor, even for tiny features.
- A project may still keep a root CONTEXT.md for genuinely cross-feature language —
  the per-feature file doesn't forbid it.
