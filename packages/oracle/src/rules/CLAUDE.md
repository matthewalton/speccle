# lint rules

The ten fixed rules `oracle lint` runs against a spec — structural rules judging the
contract's shape, quality rules judging criterion statements.

**Edits outside this folder** — a change here usually touches:

- `../lint.ts` — consumes the slice, and only through `src/index.ts`
- `../spec.ts` — parsing lives here, outside the slice; a rule never re-parses

**Traps**

- This is Speccle's one governed slice
  ([ADR-0015](../../../../docs/adr/0015-dogfooding-starts-with-one-pilot-slice.md)): it
  must lint clean and hold every criterion claimed at 100% oracle strength. A surviving
  mutant here blocks the release rather than joining a backlog.
- Its own commands, run from the repo root:

  ```sh
  pnpm --filter speccle test
  node packages/oracle/src/cli.ts lint packages/oracle/src
  pnpm --filter speccle coverage && pnpm --filter speccle mutation
  node packages/oracle/src/cli.ts strength packages/oracle/src \
    --mutation ../reports/mutation/mutation.json --coverage ../coverage/coverage-summary.json
  ```

Criteria token: `[LINT-n]`
