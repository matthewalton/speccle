# 0011 — Oracle strength credits a kill to every covering criterion

- Status: accepted
- Date: 2026-07-09

## Context

The oracle join reads Stryker's per-mutant `coveredBy` (the tests that executed the
mutant) and `killedBy` (the tests that detected it), and walks both back to criterion ids
via the `[KEY-n]` token in each test's full name ([ADR-0004](0004-tests-claim-criteria-in-the-full-test-name.md)).
Both denominators agree — a criterion covers the mutants its tests execute. The numerator
is the choice: does a criterion get credit for a kill its own tests did not make?

The strict reading — `killed(C) = coveredBy(C) ∩ killedBy(C)` — assumes a criterion's
tests execute only that criterion's code. They do not. **A test that exercises one
criterion walks through its siblings' code to get there.** Measured on the toy target:

- `[CHECKOUT-3]` ("rejects more than 100 line items") executes 17 mutants and strictly
  kills 6, scoring 35.3%. Nine of the eleven misses are the tax loop — `roundHalfUp`,
  `subtotal += linePence`, `tax += …` — every one killed by `[CHECKOUT-1]`, whose job
  they are. Only two misses are real: the `TooManyLineItems` message and `this.name`,
  executed by no other criterion and killed by nobody, because the tests assert
  `toThrow(TooManyLineItems)` and `instanceof` never reads either.
- `[CHECKOUT-2]` (`checkout([], 0.2)` → `{0, 0, 0}`) scores 4/7 = 57.1% strictly, and all
  three misses are _undetectable in principle_ by that test: an empty basket never trips
  the `> MAX_LINE_ITEMS` guard, and `subtotal + tax` → `subtotal - tax` is `0 - 0 === 0`.

Under strict attribution a criterion is routinely "weak" with nothing whatsoever to fix.
That is the number `strengthen` routes on.

## Decision

A mutant counts as killed for criterion `C` when `C`'s tests executed it and **any** test
in the suite killed it:

```
covered(C) = mutants executed by ≥ 1 test claiming C
killed(C)  = mutants in covered(C) whose status is Killed or Timeout
```

So a **weak criterion always has at least one surviving mutant** — the exact code change
no test noticed. Strict attribution measures how much sibling code a test walks through;
it does not measure whether the criterion is defended.

Mutants Stryker never ran (`NoCoverage`) or could not run (`CompileError`, `RuntimeError`,
`Ignored`, `Pending`) are excluded from both sides: oracle strength is the covered-code
measure, not Stryker's headline mutation score.

## Consequences

- `killedBy` is never read. The join needs only `coveredBy` and each mutant's status.
- Consequently `disableBail` is not required. Stryker stops a mutant's test run at the
  first kill, truncating `killedBy` to one test — which would have silently corrupted
  strict attribution, since the surviving criteria look like they missed a mutant they
  would have caught. `coverageAnalysis: "perTest"` remains a hard requirement, for
  `coveredBy`.
- Credit is generous where two criteria genuinely share code: both are marked defended
  when either one's tests kill the mutant. A criterion whose tests assert nothing at all
  still scores 100% if a sibling's tests cover the same lines and kill everything there.
  The survivor list, not the percentage, is the actionable output.
- `strengthen`'s machine path always has a mutant to write a test against; a criterion at
  100% has nothing to route on, by construction.
