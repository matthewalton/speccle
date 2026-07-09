# checkout — toy target project

The proving ground for Speccle's tooling. Speccle does not dogfood its own convention
(ADR-0009) — toy projects like this one prove the tools instead. This is a fake shop
checkout following [the convention](../../docs/convention.md): `speccle-oracle lint`
must report it clean, and the oracle package's e2e tests use it as a regression
fixture.

It grows with each build step: feature specs (lint), code + token-tagged vitest tests
(`implement-feature`), and Stryker + Istanbul coverage (the oracle-strength heatmap).

Not part of the pnpm workspace — it carries its own lockfile and `node_modules` so it
stands in for a real downstream project.

```sh
# from targets/checkout
pnpm install --ignore-workspace
pnpm test
pnpm typecheck
pnpm coverage    # → coverage/coverage-summary.json
pnpm mutation    # → reports/mutation/mutation.json

# from the repo root, once those two reports exist
node packages/oracle/src/cli.ts lint targets/checkout
node packages/oracle/src/cli.ts strength targets/checkout
```

Every criterion in both specs is claimed by at least one test: a test defends a
criterion when its `[KEY-n]` token appears in the full concatenated test name, which
here is always the enclosing `describe` title.

`stryker.config.json` sets `coverageAnalysis: "perTest"`, which the oracle needs to know
which tests covered each mutant. Both report directories are gitignored — regenerate them
before running `strength`.

## The two surviving mutants are deliberate

The target lints clean and every line is covered, yet `[CHECKOUT-3]` scores 88.2%. Its
tests assert `toThrow(TooManyLineItems)`, which checks `instanceof` and so never reads the
error's `message` or its `name`. Mutating either survives.

That gap is the point: 100% line coverage, 95.7% oracle strength. It is what makes this a
useful fixture for `strengthen`, so don't close it without replacing it with another.
