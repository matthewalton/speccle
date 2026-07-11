# 0002 — unmeasurable under-flags: unlisted verbs pass

- Status: accepted
- Date: 2026-07-11 (recorded; decided with ADR-0010)

## Context

An allow-list of measurable verbs would make the rule gatekeep every domain's
vocabulary — a verb the list has never seen would flag even when the statement asserts
a real outcome
([ADR-0010](../../../../../docs/adr/0010-unmeasurable-flags-vacuous-shapes-not-unlisted-verbs.md)).

## Decision

`unmeasurable` flags only vacuous shapes — a predicate on the fixed list that names
activity without an outcome, or a main clause naming a bare property. Any other verb
passes, including ones the rule has never seen.

## Consequences

- Domain verbs never need registering; the rule under-flags by design.
- Some untestable statements pass — the human at the spec summary is the backstop.
