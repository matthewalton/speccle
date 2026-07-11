# 0003 — Code spans are stripped before quality judgement

- Status: accepted
- Date: 2026-07-11 (recorded)

## Context

A statement may quote a keyword the quality rules would otherwise flag — a criterion
about a `should` field, or an API named `works`. Judging the literal as prose produces
false violations no rewrite can fix honestly.

## Decision

Backtick code spans are stripped from a statement before any quality rule judges it. A
quoted keyword is a literal, not prose.

## Consequences

- Statements can name code exactly without tripping the word lists.
- Hiding actual hedging inside backticks is possible; the spec summary is the
  backstop, as everywhere else.
