# The Speccle convention

The written contract every skill and every Speccle tool implements. Terminology is
defined in [`CONTEXT.md`](../CONTEXT.md); decisions behind this shape are in
[`docs/adr`](adr).

## The feature folder

A feature is a directory subtree owning one vertical slice. At its root sit exactly:

- `SPEC.md` — the acceptance criteria
- `CONTEXT.md` — the feature's language and cross-criterion decisions
- the code and tests that satisfy them (in whatever layout the project prefers)

Everything about the feature lives inside the subtree. An agent landing in the folder
needs nothing else to understand it.

## SPEC.md

```markdown
---
key: CHECKOUT
---

# Checkout

Optional intro prose about the feature.

## [CHECKOUT-1] Tax rounds half-up per line item

Tax is computed per line item and rounded half-up to 2dp before summing.

Edge cases:

- three line items of £1.99 at 20% → £1.20 tax; taxing the £5.97 basket total would give
  £1.19

## [CHECKOUT-2] Empty basket totals zero
```

Rules:

1. **Frontmatter declares the feature key**: `key: <KEY>` where `<KEY>` matches
   `[A-Z][A-Z0-9]{1,9}`. Keys are unique across the repo.
2. **Each criterion is an H2**: `## [KEY-n] <statement>`. The statement is one testable
   clause — single behaviour, no weasel words, measurable.
3. **The body is free.** Rationale, edge cases, examples — anything about that one
   behaviour. A body may be empty.
4. **Ids are names, not order.** Document position carries order. A new criterion takes
   the next never-used number under its key. An id is never renumbered or reused —
   deleting `[CHECKOUT-2]` retires the number forever.
5. **H2s in a spec are criteria.** Non-criterion structure belongs in intro prose,
   criterion bodies, or `CONTEXT.md`.

## CONTEXT.md (per feature)

Glossary + decisions, in the style of this repo's own root `CONTEXT.md`:

- **Terms**: the feature's domain language — each term defined once, with an _Avoid_
  line naming the synonyms not to use.
- **Decisions**: choices that span criteria (mini-ADR entries: what was decided and why).

The boundary with `SPEC.md`: about a word or a cross-cutting choice → `CONTEXT.md`;
about one behaviour → that criterion's body.

## Test linking

A test defends a criterion when the `[KEY-n]` token appears anywhere in its **full
concatenated name** — enclosing `describe` titles included. One
`describe('[CHECKOUT-1] tax rounding', …)` claims every test inside it. Mutation and
coverage reports already carry full names, so the join is mechanical.

## Spec discovery

Tools find every `SPEC.md` under the target root. Directories named `node_modules`,
`dist`, `fixtures`, or `__fixtures__` — and dot-directories — are never entered. The
skip list is fixed, not configuration
([ADR-0016](adr/0016-spec-discovery-skips-fixture-directories.md)): a project that
fixtures deliberately dirty specs for its own tests still lints clean at its root,
and a feature directory may not take one of the skipped names.

## Lint

`oracle lint` enforces this contract deterministically. Fixed rules, one severity, no
configuration. The rule set:

| Rule                 | Judges                                                         |
| -------------------- | -------------------------------------------------------------- |
| `missing-key`        | Frontmatter `key` absent or malformed                          |
| `key-collision`      | Two specs declare the same key                                 |
| `key-mismatch`       | A criterion id's key differs from the spec's declared key      |
| `malformed-id`       | H2 without a well-formed `[KEY-n]` token                       |
| `duplicate-id`       | The same id appears twice                                      |
| `empty-statement`    | Criterion heading has a token but no statement                 |
| `weasel-wording`     | Statement hedges (`should`, `appropriately`, `as expected`, …) |
| `compound-criterion` | Statement contains more than one testable clause               |
| `unmeasurable`       | Statement asserts nothing observable                           |

Quality rules (`weasel-wording`, `compound-criterion`, `unmeasurable`) judge the heading
statement only — the body is never linted.

`compound-criterion` exempts one bare `and`/`or` — a compound noun phrase names one
thing (`restores stock and credit`). A second bare conjunction in the main clause flags:
it reads as a list of behaviours (`restores stock and credits the customer and emails
them`). Conjunctions inside a condition (`when the card is expired and the retry limit
is reached`) qualify one outcome and are not counted.

`unmeasurable` never allow-lists the verbs a statement may use. It flags a closed list of
predicates that name activity without an outcome (`is handled`, `works`, `supports`, …)
and main clauses that name a property (`The dashboard is beautiful`). Any other verb
passes, including a domain verb the rule has never seen (`a refund credits the
customer`). It under-flags by design
([ADR-0010](adr/0010-unmeasurable-flags-vacuous-shapes-not-unlisted-verbs.md)).

## v1 target stack

The convention is language-agnostic, but v1 tooling targets: TypeScript, vitest,
StrykerJS with `perTest` coverage analysis, Istanbul `json-summary` coverage.
