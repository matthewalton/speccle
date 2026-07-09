# 0004 — Tests claim criteria via the token in the full test name

- Status: accepted
- Date: 2026-07-09

## Context

The oracle join needs a deterministic link from a test to the criterion it defends.
The old rule was "token in the it() title" — simple, but repetitive when several tests
defend one criterion. Alternatives: source-level annotations (requires parsing test
files) or runner tag APIs (runner-specific).

## Decision

A test defends a criterion when the `[KEY-n]` token appears anywhere in its full
concatenated name, enclosing `describe` titles included. A
`describe('[CHECKOUT-1] …')` block claims every test inside it.

## Consequences

- One criterion with five edge-case tests reads naturally as a describe block.
- Works with any runner whose reports carry full test names — mutation and coverage
  reports already do.
- A carelessly broad describe can over-claim; lint or the heatmap can surface
  suspiciously wide claims later if this bites.
