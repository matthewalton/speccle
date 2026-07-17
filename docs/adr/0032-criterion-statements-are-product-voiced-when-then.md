# 0032 — criterion statements are product-voiced When/Then; bodies carry the mechanics

- Status: accepted
- Date: 2026-07-17

## Context

Specs written under the convention read badly in practice. Two distinct causes, both
visible in the dogfooded `LINT` spec: statements pack condition and outcome into dense
noun phrases ("`weasel-wording` flags a statement containing a hedging term"), and
code-level detail — rule ids, regexes, message wording — leaks into the heading line a
human is supposed to skim.

Full Gherkin was considered: it maximises readability for multi-step scenarios but
costs the most-tested code in the repo — the `## [KEY-n] <statement>` heading is what
the token join, the quality lint rules, and the strength join all hang off — and
Given/When/Then scaffolding on a one-line invariant ("an empty basket totals zero") is
worse, not better.

## Decision

The heading stays the contract; two rules change what goes in it:

1. **"When X, Y" is the canonical statement shape.** A criterion statement defaults to
   a When-clause naming the trigger and a main clause naming the outcome. Simple
   invariants may stay plain declarative — the grammar is the default, not a
   straitjacket.
2. **Statements speak product.** A human must understand every heading without seeing
   code. Code-level precision that is genuinely contractual — exact messages,
   ordering, rounding, regexes — moves to the criterion body, which was always free
   and is never quality-linted.

A new lint rule flags code voice in a heading statement (code spans, file paths,
identifiers), under-flagging by design in the spirit of
[ADR-0010](0010-unmeasurable-flags-vacuous-shapes-not-unlisted-verbs.md).

## Consequences

- The oracle survives ~untouched: token join, strength join, and existing quality
  rules are unchanged; the format change is a statement-grammar convention plus one
  new rule.
- Every existing spec (toy target, `LINT` slice) needs a conform pass to the new
  grammar; `conform` is the migration tool.
- Nothing is lost from the contract: evicted detail lands in the body, still pinned
  in markdown, still readable by the implementing agent.
- Dev-tool features whose domain vocabulary is code will trip the product-voice rule
  occasionally; under-flagging keeps that rare, and the body absorbs the rest.
