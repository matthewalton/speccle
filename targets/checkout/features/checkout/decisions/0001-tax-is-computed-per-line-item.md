# 0001 — Tax is computed per line item

- Status: accepted
- Date: 2026-07-11

## Context

Tax could be computed on the basket total or per line item. With half-up rounding to
2dp the two differ observably: three line items of £1.99 at 20% give £1.20 per-line but
£1.19 on the £5.97 total.

## Decision

Tax is computed per line item, not on the basket total — the rounding difference is
observable behaviour (see [CHECKOUT-1]).

## Consequences

- Tests can pin the rounding boundary with a worked example.
- The subtotal is never taxed directly, so changing the rounding function changes
  observable totals.
