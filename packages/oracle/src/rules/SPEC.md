---
key: LINT
---

# Lint rules

The ten fixed rules behind `oracle lint`, plus the two behaviours they share: quality
rules judge only a criterion's statement, and violations come out in a stable order.
The rule set is a contract, not configuration ([ADR-0007](../../../../docs/adr/0007-lint-rules-are-fixed-heuristics.md)) —
extending any of its word lists means changing
[docs/convention.md](../../../../docs/convention.md).

## [LINT-1] When a spec declares no valid feature key, the linter flags it

Rule id: `missing-key`. An absent key flags at line 1; a malformed key flags at its
declaration line. A valid key matches `[A-Z][A-Z0-9]{1,9}`.

## [LINT-2] When two specs declare the same feature key, every colliding spec is flagged

Rule id: `key-collision`. Each colliding spec gets its own violation naming the other
files. Invalid keys are not grouped — they are already `missing-key` violations.

## [LINT-3] When a criterion id carries a different key from its spec, the linter flags it

Rule id: `key-mismatch`. Does not run when the declared key is itself invalid.

## [LINT-4] When a section heading lacks a well-formed criterion id, the linter flags it

Rule id: `malformed-id`. `[KEY-0]` is malformed: `n` starts at 1.

## [LINT-5] When a criterion id appears a second time, every later use is flagged

Rule id: `duplicate-id`. The violation points at the first occurrence, across files as
well as within one.

## [LINT-6] When a criterion heading carries an id but no statement, the linter flags it

Rule id: `empty-statement`.

## [LINT-7] When a criterion statement hedges, the linter flags it

Rule id: `weasel-wording`. Edge cases:

- matching is case-insensitive and word-bounded, and multi-word terms (`as expected`)
  match across spaces or hyphens
- the message names the term
- a term inside a code span is a literal, not a hedge

## [LINT-8] When a criterion statement packs more than one testable clause, the linter flags it

Rule id: `compound-criterion`. Signals, first match wins and yields the only violation:
a semicolon, a comma before `and`/`or`, `and also`/`as well as`, a second sentence, or
a second bare conjunction in the main clause. One bare `and`/`or` never flags;
conjunctions inside a condition or a code span are not counted; abbreviations (`e.g.`)
are not sentence ends.

## [LINT-9] When a criterion statement asserts nothing observable, the linter flags it

Rule id: `unmeasurable`. Flags only the vacuous-predicate list (`works`, `is handled`,
…) and a main clause ending in `is`/`are` plus a lowercase non-participle adjective.
Quantities, comparators (`never`, `at least`, …), literals, and any unlisted domain
verb pass — the rule under-flags by design ([ADR-0010](../../../../docs/adr/0010-unmeasurable-flags-vacuous-shapes-not-unlisted-verbs.md)).

## [LINT-10] A criterion body is never linted for quality

Weasel terms, compounds, code voice, and vague prose below the heading line are all
fine — the statement is the contract, the body is free.

## [LINT-11] Violations are ordered by file, then line, then rule, then message

Rule order is the convention table's order. Rules run in whatever order suits them; a
Speccle tool's output must not depend on it.

## [LINT-12] Every violation message quotes its evidence

What each rule quotes: `missing-key` the raw key and the expected pattern (an absent
key has nothing to quote; the fixed text names `key`); `key-collision` the other
colliding files, comma-separated, never its own; `key-mismatch` the criterion id and
the declared key; `malformed-id` the heading; `duplicate-id` the first occurrence as
`file:line`; `empty-statement` the criterion id; `weasel-wording` the term;
`compound-criterion` the signal, conjunctions lowercased; `unmeasurable` the vacuous
predicate, or that a property was named; `code-voice` the signal and its fragment.

## [LINT-13] When a criterion statement reads as code rather than product language, the linter flags it

Rule id: `code-voice` ([ADR-0032](../../../../docs/adr/0032-criterion-statements-are-product-voiced-when-then.md)).
Judged on the raw statement — here a code span is the strongest signal, not a stripped
literal. Signals, first match wins and yields the only violation:

- a code span
- a file path, recognised by a closed extension list (`cjs`, `css`, `html`, `js`,
  `json`, `jsx`, `md`, `mjs`, `sh`, `toml`, `ts`, `tsx`, `txt`, `yaml`, `yml`)
- an identifier: camelCase with at least two leading lowercase letters (brand names
  like iPhone pass), snake_case, or call parentheses

Plain acronyms (JSON, HTTP) and unlisted extensions pass — the rule under-flags by
design, like `unmeasurable`.
