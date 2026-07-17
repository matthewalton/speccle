---
key: CHECKOUT
---

# Checkout

Turning a basket into an order: totals, tax, and limits.

## [CHECKOUT-1] When a line item is taxed, tax rounds half-up to 2dp

Tax is computed per line item and rounded before summing.

Edge cases:

- three line items of £1.99 at 20% → £1.20 tax; taxing the £5.97 basket total would give
  £1.19

## [CHECKOUT-2] An empty basket totals zero

Weasel words in a body are fine — lint should never judge this line, and it would
flag "should" if it did.

## [CHECKOUT-3] When a basket exceeds 100 line items, checkout rejects it
