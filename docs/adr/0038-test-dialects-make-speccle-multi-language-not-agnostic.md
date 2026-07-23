# 0038 — Test dialects make Speccle multi-language, not language-agnostic

- Status: accepted
- Date: 2026-07-23
- Amends [ADR-0008](0008-v1-targets-ts-vitest-stryker-only.md) — the convention reaches a
  supported set of languages, not every language

## Context

[ADR-0008](0008-v1-targets-ts-vitest-stryker-only.md) called the convention
language-agnostic and only `strengthen` stack-constrained. `oracle claims` did not exist
then, and it is stack-bound in exactly two places: the test-file pattern in
`discover.ts` and the `describe/it/test("…")` title extractor in `claims.ts`. Everything
else in the join — spec parsing, the token match, the report shape — is neutral.

Two ways to unbind it. Expose the two patterns as repo configuration, so any framework
works on day one and nobody waits on a release. Or name the stacks Speccle knows and own
the parsing. Configuration is cheaper for us and worse for the user: a slightly wrong
regex yields phantom claims or false `unclaimed` verdicts inside the checks-gate,
corrupting the one thing the oracle exists to provide, and it cuts against
[ADR-0007](0007-lint-rules-are-fixed-heuristics.md) — no knobs on judgement.

## Decision

A **test dialect** is per-language knowledge Speccle ships: which files are tests, and
how a test's full name is read. Dialects are named and owned by Speccle. A repo declares
which dialect it is on; it never declares how that dialect works. There is no regex
override.

Speccle is therefore **multi-language across a supported set, not language-agnostic**.
An unsupported stack is unsupported, and says so.

`strength` remains TypeScript-first regardless: it needs a mutation tool with per-test
coverage attribution, which barely exists elsewhere. Under
[ADR-0033](0033-strengthen-leaves-the-feature-loop-and-evaluates-human-run-reports.md)
that degrades on its own — the reports are simply missing.

## Consequences

- A clean `claims` run means the same thing in every repo, which is what makes it
  trustworthy inside the checks-gate.
- Adding a language is a Speccle change with tests behind it, not a user's afternoon.
  Demand for a stack shows up as an issue, not as a broken join nobody can see.
- The contract, the lint, and the claim join reach every supported language; the heatmap
  reaches TypeScript. Those are now two different frontiers and the docs must not blur
  them.
