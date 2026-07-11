# 0001 — A basket is keyed by SKU

- Status: accepted
- Date: 2026-07-11

## Context

Re-adding a SKU the basket already holds could append a second line or merge into the
existing one. The two readings give observably different baskets, and more than one
criterion depends on which is true.

## Decision

A basket is keyed by SKU: re-adding merges into the existing line rather than
appending (see [BASKET-1]).

## Consequences

- Two lines never share a SKU.
- Re-adding changes a line's quantity, never the line count.
