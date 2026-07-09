# 0003 — Criteria are H2 headings with stable [KEY-n] ids

- Status: accepted
- Date: 2026-07-09

## Context

The old format made each criterion a single tagged line — scannable, but with nowhere
to put rationale, edge cases, or examples, specs stayed checklists rather than
documents. The redesign question: how rich can a criterion get while keeping a
deterministic join to the tests defending it?

## Decision

Each criterion is an H2: `## [KEY-n] <statement>`. The heading carries the stable id
and the one testable clause; the body below is free-form prose. Ids keep the old
discipline — feature key from frontmatter (`key: CHECKOUT`, `[A-Z][A-Z0-9]{1,9}`,
repo-unique), numbers never renumbered or reused, position carries order.

Considered and rejected: readable slugs (renames silently orphan defending tests),
Gherkin scenarios (forces every criterion into a behaviour mould), structured
frontmatter criteria (machine-friendly, human-hostile).

## Consequences

- Specs read as documents and degrade gracefully to the old checklist style when a
  body is empty.
- Lint quality rules get a crisp target: the heading statement only.
- The full contract lives in [docs/convention.md](../convention.md).
