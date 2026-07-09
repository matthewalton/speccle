# Basket

## Terms

**SKU**:
The identity of an item; two lines never share one.
_Avoid_: product id, item id.

**Quantity**:
How many of a SKU a single line item holds.
_Avoid_: count, amount.

## Decisions

- A basket is keyed by SKU: re-adding merges into the existing line rather than
  appending (see [BASKET-1]).
