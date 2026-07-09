---
key: ALPHA
---

# Alpha

A strength fixture, not a lint fixture: the numbers matter, the prose does not.

## [ALPHA-1] Adding an item increments its quantity by exactly 1

Its tests kill every mutant they cover.

## [ALPHA-2] Removing the last item leaves the basket empty

Covers a mutant only ALPHA-1's test kills. Suite-credit gives ALPHA-2 the kill
(ADR-0011); strict attribution would not. Also covers a timeout, and two survivors that
the report lists out of source order.

## [ALPHA-3] Clearing the basket removes every line item

No test carries this token, so it is unclaimed rather than weak.
