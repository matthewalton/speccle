# Lint rules

## Terms

**Structural rule**:
A rule judging the contract's shape — keys, ids, statements present and unique — across
whole specs (`missing-key` through `empty-statement`).
_Avoid_: syntax rule, format rule.

**Quality rule**:
A rule judging one well-formed criterion's statement — never its body
(`weasel-wording`, `compound-criterion`, `unmeasurable`).
_Avoid_: style rule, prose rule.

**Weasel term**:
A hedging word or phrase on the fixed `weasel-wording` list (`should`, `as expected`).
_Avoid_: vague word, banned word.

**Vacuous predicate**:
A predicate on the fixed `unmeasurable` list that names activity without an outcome
(`works`, `is handled`).
_Avoid_: weak verb, forbidden verb.

**Bare conjunction**:
An `and`/`or` with no comma before it. One is a compound noun phrase; a second in the
main clause is a list of behaviours ([LINT-8]).
_Avoid_: plain conjunction.

## Decisions

- The word lists are contract, not config: extending `WEASEL_TERMS` or
  `VACUOUS_PREDICATES` means changing `docs/convention.md`
  ([ADR-0007](../../../../docs/adr/0007-lint-rules-are-fixed-heuristics.md)).
- `unmeasurable` under-flags rather than gatekeeping a spec's vocabulary: unlisted
  domain verbs pass
  ([ADR-0010](../../../../docs/adr/0010-unmeasurable-flags-vacuous-shapes-not-unlisted-verbs.md)).
- Code spans are stripped before any quality judgement — a quoted keyword is a literal,
  not prose.
