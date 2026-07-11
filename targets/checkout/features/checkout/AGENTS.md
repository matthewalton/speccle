# checkout

Totals a basket: subtotal, per-line tax, and their sum, rejecting oversized baskets.
Part of the checkout toy target — a regression fixture proving Speccle's tooling, not
example code to restyle. Two of its surviving mutants are deliberate (see the target's
README) — don't kill them without replacing the gap.

## Working the slice

Run from `targets/checkout` (installed with `pnpm install --ignore-workspace`):

```sh
pnpm test features/checkout                                    # this slice's tests
node ../../packages/oracle/src/cli.ts lint features/checkout   # lint the spec
```

## The contract

- `SPEC.md` — the criteria (key `CHECKOUT`). A test claims one by carrying its
  `[CHECKOUT-n]` token in the full test name.
- `CONTEXT.md` — the language.
- `decisions/` — the cross-criterion choices.
- `src/` — the code and its tests. It imports the basket feature's types from
  `../../basket/src/basket.ts`.
