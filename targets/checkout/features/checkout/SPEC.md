---
key: CHECKOUT
---

# Checkout

Turning a basket into an order: totals, tax, and limits.

## [CHECKOUT-1] Tax rounds half-up to 2dp per line item

Tax is computed per line item and rounded before summing.

Edge cases:

- 3 × £1.99 at 20% → £1.20 tax, not £1.19

## [CHECKOUT-2] An empty basket totals zero

Weasel words in a body are fine — lint should never judge this line, and it would
flag "should" if it did.

## [CHECKOUT-3] Checkout rejects a basket of more than 100 line items
