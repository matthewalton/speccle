# lint rules

The nine fixed rules `oracle lint` runs against a spec — structural rules judging the
contract's shape, quality rules judging criterion statements. This is Speccle's one
governed slice
([ADR-0015](../../../../docs/adr/0015-dogfooding-starts-with-one-pilot-slice.md)): it
must lint clean and keep every criterion claimed at 100% oracle strength.

## Working the slice

Run from the repo root:

```sh
pnpm --filter speccle-oracle test                     # runs this slice's tests with the package's
node packages/oracle/src/cli.ts lint packages/oracle/src
pnpm --filter speccle-oracle coverage && pnpm --filter speccle-oracle mutation
node packages/oracle/src/cli.ts strength packages/oracle/src \
  --mutation ../reports/mutation/mutation.json --coverage ../coverage/coverage-summary.json
```

## The contract

- `SPEC.md` — the criteria (key `LINT`). A test claims one by carrying its `[LINT-n]`
  token in the full test name.
- `CONTEXT.md` — the language.
- `decisions/` — the cross-criterion choices.
- `src/` — the rules and their tests. `lint.ts` consumes the slice through
  `src/index.ts`; parsing lives outside the slice in `../spec.ts`.
