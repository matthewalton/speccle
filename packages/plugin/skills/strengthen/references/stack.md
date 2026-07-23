<!-- Generated from docs/strength-stack.md by scripts/sync-plugin-references.mjs — do not edit.
     Edit the source and run `pnpm sync:plugin-refs`. -->

# The oracle-strength stack

Oracle strength needs to know which tests covered each mutant, and that constrains the
target to TypeScript + vitest + StrykerJS. When `--check` says missing and the stack
itself is absent, check for all four before asking anyone to run anything:

| Requirement                       | Where                                |
| --------------------------------- | ------------------------------------ |
| `@stryker-mutator/core` + runner  | `package.json` devDependencies       |
| `coverageAnalysis: "perTest"`     | `stryker.config.json`                |
| the `json` reporter, and its path | `stryker.config.json` `jsonReporter` |
| istanbul provider, `json-summary` | `vitest.config.ts` `test.coverage`   |

`perTest` is the hard one: without it Stryker never records `coveredBy`, the join has
nothing to walk back to criterion ids, and `oracle strength` exits `2` saying so.

`speccle strength init <path>` provisions all of it — it installs the missing
devDependencies and writes the preset configs, keeping any that already exist. It runs
only on the user's explicit go-ahead; this skill measures someone else's project, it does
not quietly re-tool it.
