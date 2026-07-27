# checkout

Totals a basket: subtotal, per-line tax, and their sum, rejecting oversized baskets.

**Edits outside this folder** — a change here usually touches:

- `../basket/src/basket.ts` — this slice imports the basket feature's types from there

**Traps**

- Part of the checkout toy target — a **regression fixture** proving Speccle's tooling,
  not example code to restyle.
- **Two of its surviving mutants are deliberate** (see the target's README). Don't kill
  them without replacing the gap they demonstrate.
- Its own commands, run from `targets/checkout` (installed with
  `pnpm install --ignore-workspace`):

  ```sh
  pnpm test features/checkout
  node ../../packages/oracle/src/cli.ts lint features/checkout
  ```

Criteria token: `[CHECKOUT-n]`
