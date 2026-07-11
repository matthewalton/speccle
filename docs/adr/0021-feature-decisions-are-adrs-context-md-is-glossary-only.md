# 0021 — Feature decisions are ADRs; CONTEXT.md is glossary-only

- Status: accepted
- Date: 2026-07-11
- Amends: [ADR-0005](0005-each-feature-carries-its-own-context-md.md)

## Context

ADR-0005 gave each feature a `CONTEXT.md` holding its glossary _and_ a Decisions
section of mini-ADR bullets. In practice a bullet has no room for context or
consequences, so the "why" the section existed to record kept getting dropped — and the
repo itself records its decisions as full ADRs in `docs/adr/`, leaving features with a
second, weaker format for the same kind of content.

## Decision

Cross-criterion decisions live as numbered ADR files in the feature's `decisions/`
folder — `decisions/0001-<slug>.md`, same form as `docs/adr/`. The feature's
`CONTEXT.md` becomes a glossary only.

The routing rule: about a word → `CONTEXT.md`; about one behaviour → that criterion's
body; a choice spanning criteria → `decisions/`. One home per kind of content — no
judgement call about when a decision is "big enough" for a real record.

## Consequences

- Feature decisions get the full context/decision/consequences form, matching the
  repo's own ADRs.
- ADR-0005 stands except its Decisions section, which this supersedes.
- Existing features (the checkout target, the rules slice) migrate their Decisions
  bullets into `decisions/` files.
