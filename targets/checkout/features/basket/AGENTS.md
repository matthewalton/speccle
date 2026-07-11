# basket

A shopping basket: line items of SKU + quantity, merged on re-add. Part of the
checkout toy target — a regression fixture proving Speccle's tooling, not example code
to restyle.

## Working the slice

Run from `targets/checkout` (installed with `pnpm install --ignore-workspace`):

```sh
pnpm test features/basket                                    # this slice's tests
node ../../packages/oracle/src/cli.ts lint features/basket   # lint the spec
```

## The contract

- `SPEC.md` — the criteria (key `BASKET`). A test claims one by carrying its
  `[BASKET-n]` token in the full test name.
- `CONTEXT.md` — the language.
- `decisions/` — the cross-criterion choices.
- `src/` — the code and its tests.
