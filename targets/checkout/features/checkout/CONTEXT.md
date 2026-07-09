# Checkout

## Terms

**Line item**:
One SKU plus a quantity inside a basket.
_Avoid_: row, entry.

**Total**:
The sum of line-item prices after per-line tax rounding.
_Avoid_: amount, sum (unqualified).

## Decisions

- Tax is computed per line item, not on the basket total — the rounding difference is
  observable behaviour (see [CHECKOUT-1]).
