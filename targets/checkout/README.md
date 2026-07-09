# checkout — toy target project

The proving ground for Speccle's tooling. Speccle does not dogfood its own convention
(ADR-0009) — toy projects like this one prove the tools instead. This is a fake shop
checkout following [the convention](../../docs/convention.md): `speccle-oracle lint`
must report it clean, and the oracle package's e2e tests use it as a regression
fixture.

It grows with each build step: feature specs now (lint), code + vitest tests + Stryker
config when the oracle-strength heatmap lands.

```sh
node packages/oracle/src/cli.ts lint targets/checkout
```
