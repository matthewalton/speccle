---
key: LINT
---

# Lint rules

The nine fixed rules behind `oracle lint`, plus the two behaviours they share: quality
rules judge only a criterion's statement, and violations come out in a stable order.
The rule set is a contract, not configuration ([ADR-0007](../../../../docs/adr/0007-lint-rules-are-fixed-heuristics.md)) —
extending any of its word lists means changing
[docs/convention.md](../../../../docs/convention.md).

## [LINT-1] `missing-key` flags a spec whose frontmatter key is absent or malformed

An absent key flags at line 1; a malformed key flags at its declaration line. A valid
key matches `[A-Z][A-Z0-9]{1,9}`.

## [LINT-2] `key-collision` flags every spec that declares an already-declared feature key

Each colliding spec gets its own violation naming the other files. Invalid keys are not
grouped — they are already `missing-key` violations.

## [LINT-3] `key-mismatch` flags a criterion id whose key differs from the spec's declared key

Does not run when the declared key is itself invalid.

## [LINT-4] `malformed-id` flags an H2 heading that lacks a well-formed criterion id token

`[KEY-0]` is malformed: `n` starts at 1.

## [LINT-5] `duplicate-id` flags every use of a criterion id after its first

The violation points at the first occurrence, across files as well as within one.

## [LINT-6] `empty-statement` flags a criterion token followed by no statement

## [LINT-7] `weasel-wording` flags a statement containing a hedging term

Edge cases:

- matching is case-insensitive and word-bounded, and multi-word terms (`as expected`)
  match across spaces or hyphens
- the message names the term
- a term inside a code span is a literal, not a hedge

## [LINT-8] `compound-criterion` flags a statement containing more than one testable clause

Signals, first match wins and yields the only violation: a semicolon, a comma before
`and`/`or`, `and also`/`as well as`, a second sentence, or a second bare conjunction in
the main clause. One bare `and`/`or` never flags; conjunctions inside a condition or a
code span are not counted; abbreviations (`e.g.`) are not sentence ends.

## [LINT-9] `unmeasurable` flags a statement that asserts no observable outcome

Flags only the vacuous-predicate list (`works`, `is handled`, …) and a main clause
ending in `is`/`are` plus a lowercase non-participle adjective. Quantities, comparators
(`never`, `at least`, …), literals, and any unlisted domain verb pass — the rule
under-flags by design ([ADR-0010](../../../../docs/adr/0010-unmeasurable-flags-vacuous-shapes-not-unlisted-verbs.md)).

## [LINT-10] A criterion body is never linted for quality

Weasel terms, compounds, and vague prose below the heading line are all fine — the
statement is the contract, the body is free.

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
predicate, or that a property was named.
