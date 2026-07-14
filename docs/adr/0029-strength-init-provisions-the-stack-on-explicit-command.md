# 0029 — `strength init` provisions the stack on explicit command

- Status: accepted
- Date: 2026-07-14

## Context

ADR-0008 constrains `strength` to one stack — TypeScript + vitest + StrykerJS with
`perTest` coverage analysis — and the `strengthen` skill "politely requires" it: when a
piece is missing it stops, shows what is absent, and waits. Field evidence (Wield,
2026-07-12, its ADR-0006) showed what that costs: every slice shipped green-but-unmeasured
for days because closing the gap meant hand-writing `stryker.config.json` and picking
excludes from scratch. The fix-it instructions the skill prints are exactly the thing a
tool could do.

The standing stance (ticket #60) is "offer to configure, never silently install" — and
postinstall hooks that write outside `node_modules` are both blocked by modern npm
configs and a violation of that stance.

## Decision

The oracle grows `strength init` — an explicit, user-run command that provisions the
stack `strength` measures against:

- installs the missing devDependencies, pinned to the majors the join is proven on
  (`vitest@^4`, `@vitest/coverage-istanbul@^4`, `@stryker-mutator/core@^9`,
  `@stryker-mutator/vitest-runner@^9`), via the package manager the lockfile names;
- writes `stryker.config.json` from the preset the oracle carries in code
  (`coverageAnalysis: "perTest"`, the `json` reporter at
  `reports/mutation/mutation.json`), with mutate globs derived from the discovered
  `SPEC.md` folders;
- writes a `vitest.config.ts` with the istanbul provider and `json-summary` reporter.

An existing config of either kind is **kept, never overwritten** — init reports it and
names the fields it must carry. The command is idempotent; `--skip-install` reports the
install command instead of running it. Running init _is_ the consent: no postinstall
hook, no implicit trigger.

The written config is materialized JSON, not a one-line import of a shared preset. Two
reasons: Stryker's JSON config has no `extends`, and an import would require
`speccle-oracle` as an installable devDependency of the target — the package is still
private. The preset lives once, in `src/init.ts`; the file it writes is a copy the
target owns, including its repo-specific mutate globs (which stay the target's decision,
e.g. excluding spawn-tested entry files).

## Consequences

- `strengthen`'s refusal message now offers one command instead of a hand-assembled
  config recipe.
- Targets get the known-good stack; the preset's load-bearing fields (`perTest`, json
  reporter) stop being copy-paste folklore.
- When the package publishes (tickets #57/#107), init can add `speccle-oracle` itself as
  a devDependency and revisit the import-based preset — that is ticket #125's
  project-level install, of which this command is the first step.
