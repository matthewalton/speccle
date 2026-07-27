# basket

A shopping basket: line items of SKU + quantity, merged on re-add.

**Edits into this folder** — the checkout feature imports this slice's types from
`src/basket.ts`, so a change to them lands there too.

**Traps**

- Part of the checkout toy target — a **regression fixture** proving Speccle's tooling,
  not example code to restyle.
- Its own commands, run from `targets/checkout` (installed with
  `pnpm install --ignore-workspace`):

  ```sh
  pnpm test features/basket
  node ../../packages/oracle/src/cli.ts lint features/basket
  ```

Criteria token: `[BASKET-n]`
