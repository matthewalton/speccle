# checkout — toy target project

The proving ground for Speccle's tooling. Speccle does not dogfood its own convention
(ADR-0009) — toy projects like this one prove the tools instead. This is a fake shop
checkout following [the convention](../../docs/convention.md): `speccle-oracle lint`
must report it clean, and the oracle package's e2e tests use it as a regression
fixture.

It grows with each build step: feature specs (lint), code + token-tagged vitest tests
(`implement-feature`), and a Stryker config when the oracle-strength heatmap lands.

Not part of the pnpm workspace — it carries its own lockfile and `node_modules` so it
stands in for a real downstream project.

```sh
node packages/oracle/src/cli.ts lint targets/checkout   # from the repo root

# from targets/checkout
pnpm install --ignore-workspace
pnpm test
pnpm typecheck
```

Every criterion in both specs is claimed by at least one test: a test defends a
criterion when its `[KEY-n]` token appears in the full concatenated test name, which
here is always the enclosing `describe` title.
