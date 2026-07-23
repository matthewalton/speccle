<!-- Generated from docs/convention.md by scripts/sync-plugin-references.mjs — do not edit.
     Edit the source and run `pnpm sync:plugin-refs`. -->

# The Speccle convention

The written contract every skill and every Speccle tool implements. Terminology is
defined in `CONTEXT.md`; decisions behind this shape are in
`docs/adr`.

## The feature folder

A feature is a directory **named for the feature**, owning one vertical slice. The name
announces the slice — `scanner/`, never an unnamed catch-all like `src/` or `lib/` —
and holds even when a project has only one feature: the slice is self-announcing, and a
second feature has an obvious home beside it.

Every feature folder has the same shape:

```
scanner/
├── SPEC.md          ← the acceptance criteria
├── CONTEXT.md       ← the feature's language (a glossary, nothing else)
├── AGENTS.md        ← how an agent works the slice
├── decisions/       ← the feature's ADRs, one file per decision
│   └── 0001-<slug>.md
└── src/
    ├── scanner.ts
    └── scanner.test.ts
```

The root holds the markdown contract and nothing else. All code and tests sit in
`src/`, tests beside the code they defend, and the code subfolder is always named
`src` — every feature folder in every project opens the same way. `decisions/` appears
with the feature's first decision; the other four entries are the floor, even for a
tiny feature.

Inside `src/`, subfolders are allowed but not the default
(ADR-0037). Keep
`src/` flat while it holds **ten files or fewer** directly — count the code and test
files sitting in it, subfolders excluded. The file that would make it eleven triggers
grouping: gather the code into shallow (prefer one level), purpose-named subfolders,
and the same ten-file limit applies within each subfolder. A `src/` that has grown into
a pile is often a signal to split the slice into siblings instead; nest when it is
genuinely one cohesive feature that simply carries many files. Tests stay beside the
code they defend at whatever depth it sits.

Everything about the feature lives inside the subtree. An agent landing in the folder
needs nothing else to understand it — and `AGENTS.md` is where it starts reading.

## SPEC.md

```markdown
---
key: CHECKOUT
---

# Checkout

Optional intro prose about the feature.

## [CHECKOUT-1] When a line item is taxed, tax rounds half-up

Tax is computed per line item and rounded half-up to 2dp before summing.

Edge cases:

- three line items of £1.99 at 20% → £1.20 tax; taxing the £5.97 basket total would give
  £1.19

## [CHECKOUT-2] An empty basket totals zero
```

Rules:

1. **Frontmatter declares the feature key**: `key: <KEY>` where `<KEY>` matches
   `[A-Z][A-Z0-9]{1,9}`. Keys are unique across the repo.
2. **Each criterion is an H2**: `## [KEY-n] <statement>`. The statement is one testable
   clause — single behaviour, no weasel words, measurable.
3. **Statements speak product, defaulting to a When/Then shape**
   (ADR-0032):
   "When X, Y" — the trigger, then the outcome, readable without seeing code. A simple
   invariant may stay plain declarative (`An empty basket totals zero`). Code-level
   precision that is contractual — exact messages, ordering, regexes — lives in the
   body, never the statement.
4. **The body is free.** Rationale, edge cases, examples — anything about that one
   behaviour. A body may be empty.
5. **Ids are names, not order.** Document position carries order. A new criterion takes
   the next never-used number under its key. An id is never renumbered or reused —
   deleting `[CHECKOUT-2]` retires the number forever.
6. **H2s in a spec are criteria.** Non-criterion structure belongs in intro prose,
   criterion bodies, or `CONTEXT.md`.

## CONTEXT.md (per feature)

The feature's glossary, in the style of this repo's own root `CONTEXT.md`: the domain
language — each term defined once, with an _Avoid_ line naming the synonyms not to use.

A glossary only. Decisions never live here — they are ADRs in `decisions/`
(ADR-0021). The
boundary: about a word → `CONTEXT.md`; about one behaviour → that criterion's body in
`SPEC.md`; a choice spanning criteria → `decisions/`.

## AGENTS.md (per feature)

The slice's agent-facing entry point, following the cross-tool convention of the same
name. It orients in one screenful, stating only what the folder cannot show:

- what the slice does — a sentence or two
- how to run its tests (and any other commands the slice needs)
- where the contract lives: `SPEC.md` for the criteria, `CONTEXT.md` for the language,
  `decisions/` for the choices — and that tests claim criteria by `[KEY-n]` token

Facts about _working_ the slice belong here; facts about the feature's _behaviour_
belong in `SPEC.md`. Duplicating either in the other is drift waiting to happen.

## decisions/ (per feature)

The feature's architecture decision records: choices that span criteria, one numbered
file per decision — `decisions/0001-<slug>.md`, in the same form as any ADR (status,
context, decision, consequences). The folder appears with the first decision. A choice
about one behaviour is not a decision record — it is that criterion's body.

## Test linking

A test defends a criterion when the criterion id appears anywhere in its **full
concatenated name** — enclosing group titles included. One
`describe('[CHECKOUT-1] tax rounding', …)` claims every test inside it. Mutation and
coverage reports already carry full names, so the join is mechanical.

What counts as a test file, and what counts as its name, is the **test dialect**'s
business (ADR-0038).
Where a framework gives a test a string name, the id is claimed bracketed —
`[CHECKOUT-1]`. Where the name _is_ an identifier, the id takes its identifier-safe
spelling: `func test_CHECKOUT_1_taxRounds()` claims `CHECKOUT-1`. The two spellings are
one id, not two — `SPEC.md` headings and every report use the bracketed form
(ADR-0039).

## Spec discovery

Tools find every `SPEC.md` under the target root. Directories named `node_modules`,
`dist`, `fixtures`, or `__fixtures__` — and dot-directories — are never entered. The
skip list is fixed, not configuration
(ADR-0016): a project that
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
| `code-voice`         | Statement reads as code rather than product language           |

Quality rules (`weasel-wording`, `compound-criterion`, `unmeasurable`, `code-voice`)
judge the heading statement only — the body is never linted.

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
(ADR-0010).

`code-voice` judges the raw statement — here a code span is the strongest signal, not a
stripped literal. Signals, first match wins: a code span; a file path, recognised by a
closed extension list (`cjs`, `css`, `html`, `js`, `json`, `jsx`, `md`, `mjs`, `sh`,
`toml`, `ts`, `tsx`, `txt`, `yaml`, `yml`); an identifier — camelCase with at least two
leading lowercase letters (brand names like iPhone pass), snake_case, or call
parentheses. Plain acronyms (JSON, HTTP) and unlisted extensions pass — the rule
under-flags by design
(ADR-0032).

## Supported stacks

Speccle is **multi-language across a supported set, not language-agnostic**. A repo
declares which test dialect it is on; it never declares how that dialect works, so a
clean `claims` run means the same thing in every repo
(ADR-0038). An
unsupported stack is unsupported, and says so.

Two frontiers, and they are not the same:

- **The contract, the lint, and the claim join** reach every supported dialect.
  `ts-vitest` reads `describe`/`it`/`test` titles out of `*.test.*` and `*.spec.*`
  files. `swift` reads Swift Testing `@Test("…")` and `@Suite("…")` display names, and
  XCTest `func test…()` identifiers, out of `*Tests.swift` files and anything under a
  `Tests` directory.
- **The oracle-strength heatmap** reaches TypeScript. It needs a mutation tool that
  attributes coverage per test: StrykerJS with `perTest` coverage analysis, plus
  Istanbul `json-summary` coverage. Elsewhere the reports are simply missing, and the
  heatmap degrades on its own.

Adding a language is a Speccle change with tests behind it, never a regex a repo
supplies.
