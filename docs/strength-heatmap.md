# The oracle-strength heatmap

`<oracle> strength <path>` prints a bar and `killed/covered` per criterion, with each
criterion's survivors listed beneath it:

```
features/checkout/SPEC.md
  CHECKOUT-1  ████████████████████  100.0%    14/14  When a line item is taxed, tax rounds half-up to 2dp
  CHECKOUT-3  ██████████████████░░   88.2%    15/17  When a basket exceeds 100 line items, checkout rejects it
      features/checkout/checkout.ts:13:11  StringLiteral → ``
      features/checkout/checkout.ts:14:17  StringLiteral → ""
```

Use `--json` for the routing work: `{ root, strength, lineCoverage, features[], unclaimed,
unknownClaims, unclaimedMutants, staticMutants }`, each criterion carrying `survivors[]`
with `file`, `line`, `column`, `mutator`, `replacement`. `strength` is a report, not a
gate: it exits `0` with survivors present, `2` on a bad or missing report. Never scrape
the human output.

## The four fields that are not routing work

Say these out loud before you start — none of them is a survivor to route.

- **`unclaimed`** — a criterion no test's name carries. It scores nothing rather than
  zero. It needs a test written against it before it can be weak; that is
  `implement-feature`'s job, not a survivor to route.
- **`unknownClaims`** — a test claims an id no spec declares. Someone renamed or deleted a
  criterion. Fix the test name or restore the criterion.
- **`unclaimedMutants`** — code the criteria do not reach at all, each entry naming its
  `file`, `line`, `column`, `mutator`, `replacement`. Not weak criteria; a map of the
  regions the spec is silent about. Do not route these as survivors — name the region to
  the human and let them decide whether a feature owes a spec there.
- **`staticMutants`** — mutants that run at module load (word lists, regex literals), so
  per-test coverage can attribute them to no criterion: `{ killed, survivors[] }`. The
  killed ones are fine — some test noticed. A survivor is a real gap, but it can never be
  claimed by a criterion id; name it to the human alongside the unclaimed mutants.
