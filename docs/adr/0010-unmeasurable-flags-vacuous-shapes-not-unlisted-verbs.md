# 0010 — `unmeasurable` flags vacuous shapes, not unlisted verbs

- Status: accepted
- Date: 2026-07-09

## Context

`unmeasurable` first passed a statement only if it contained one of ~70 enumerated
outcome verbs, a comparator, or a quantity. Under that shape the same sentence lints
differently on one word: "a refund **credits** the customer the full line-item total" is
flagged, "a refund **records** …" is clean. Their measurability is identical; only the
oracle's vocabulary differs. Real domain verbs it had never heard of — credits, debits,
settles, ships, voids, novates — all failed.

`implement-feature` drafts a spec and lints until clean, and [ADR-0007](0007-lint-rules-are-fixed-heuristics.md)
guarantees no escape hatch. So the agent's only recourse was to reword domain language
into the linter's vocabulary: a heuristic meant to catch vagueness was quietly dictating
each spec's verbs. Our toy target never exposed this because it was written to the list.

A rule with no escape hatch has to choose which way it fails.

## Decision

Invert it. `unmeasurable` no longer allow-lists the verbs a statement may use. It flags
two shapes that assert nothing:

- a **vacuous predicate** — a closed list of verbs that name activity without an outcome
  (`is handled`, `works`, `supports`, `behaves`, `takes care of`, …);
- a **property** — a main clause ending in `is <adjective>` with no literal, comparator,
  or quantity ("The dashboard is beautiful"). Only the main clause is judged, so a copula
  inside a condition ("Payment fails when the card is expired") qualifies an outcome
  asserted elsewhere.

Every other verb passes, enumerated or not.

## Consequences

- The rule under-flags. A vague-but-verby statement now reaches the oracle-strength run,
  where a weak test exposes it expensively — the cost ADR-0007 hoped to avoid at
  drafting. We accept it: a false positive on a valid domain verb has no escape hatch and
  corrupts the spec's language, while a false negative costs one mutation run.
- The closed list is now a list of things to reject, not of things to permit. Growing it
  tightens the rule; failing to grow it never blocks a valid statement.
- `unmeasurable` no longer justifies the "rephrase around the observable outcome" advice
  in `implement-feature` — a statement it flags is genuinely empty, not merely unusual.
