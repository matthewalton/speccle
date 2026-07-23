# 0039 — A criterion id has an identifier-safe spelling

- Status: accepted
- Date: 2026-07-23
- Amends [ADR-0004](0004-tests-claim-criteria-in-the-full-test-name.md) — the spelling a
  test name can carry varies; where the claim lives does not

## Context

[ADR-0004](0004-tests-claim-criteria-in-the-full-test-name.md) puts the claim in the
test's full concatenated name. That holds wherever a framework gives a test a string
name — vitest `it("…")`, Swift Testing `@Test("…")`, JUnit `@DisplayName`, RSpec
`describe "…"`. It fails where the name _is_ the identifier: XCTest's
`func testTaxRounds()`, bare pytest's `def test_tax_rounds()`. `[CHECKOUT-1]` cannot go
there — brackets and hyphens are illegal in identifiers.

The alternatives were to let the token sit in an adjacent comment or attribute, or to
support only frameworks with display names. A comment drifts from the test it labels far
more easily than a name does, and a stray token in a block comment phantom-claims a
criterion. Requiring a display-name framework makes Speccle dictate the test runner.

## Decision

Where a framework offers no string name, the criterion id takes an identifier-safe
spelling — `CHECKOUT_1` for `[CHECKOUT-1]` — so `func test_CHECKOUT_1_taxRounds()`
claims the criterion. Which spelling applies is the test dialect's business
([ADR-0038](0038-test-dialects-make-speccle-multi-language-not-agnostic.md)).

The two spellings are **one id**, not two. `SPEC.md` headings always use the bracketed
form; the identifier-safe form exists only in test names.

ADR-0004 stands: a claim still lives in the test's full name. What varies is the
spelling the name can carry, not where the claim lives.

## Consequences

- A criterion id acquires a second spelling, and the glossary now has to say so.
  Reports render the bracketed form so the human only ever reads one.
- No comment-scanning, so a stray token in prose can never claim a criterion.
- Speccle does not dictate a test framework to reach a supported language.
