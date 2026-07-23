# AGENTS.md

Speccle is a Claude Code plugin for building features as vertical slices — a colocated
`SPEC.md`, `CONTEXT.md`, and the tagged tests that defend it — plus deterministic
tooling that measures whether those tests would notice if the code broke. TypeScript,
pnpm workspace, Node ≥ 24.

## Where the truth lives

- **Vocabulary**: [CONTEXT.md](CONTEXT.md) — the canonical glossary, and its terms are
  mandatory: say "criterion id" not "tag", "lint violation" not "error/warning",
  "oracle strength" not "mutation score". Each entry lists the synonyms to avoid.
- **Spec format**: [docs/convention.md](docs/convention.md) — the written contract.
- **Decisions**: [docs/adr/](docs/adr/) — read the relevant ADR before re-litigating a
  design choice.
- **Commits**: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Commands

```sh
pnpm install
pnpm --filter speccle test    # oracle unit + e2e tests (vitest)
pnpm --filter speccle typecheck
pnpm --filter speccle build
pnpm lint                     # eslint, repo-wide
pnpm format:check             # prettier, repo-wide
node packages/oracle/src/cli.ts lint targets/checkout       # run the linter from source
node packages/oracle/src/cli.ts strength targets/checkout   # needs the reports below
```

The toy target installs separately — it is not a workspace package:

```sh
cd targets/checkout && pnpm install --ignore-workspace && pnpm test
pnpm coverage    # → coverage/coverage-summary.json   (gitignored)
pnpm mutation    # → reports/mutation/mutation.json   (gitignored)
```

Node ≥ 24 runs TypeScript directly — no build step needed to run the CLI from source.

## Map and boundaries

- `packages/oracle` — Speccle tools: deterministic, independently runnable, typed JSON
  output, and they **never call an LLM**.
- `packages/oracle/test/fixtures/dirty/` — specs that deliberately violate the
  convention; they are lint regression fixtures. Never "fix" them.
- `packages/oracle/test/fixtures/strength/` — a spec plus a hand-written mutation report
  and coverage summary, pinning the join's arithmetic. The toy target's own reports are
  gitignored, so the `strength` e2e runs against this instead.
- `packages/plugin` — the Claude Code plugin (the skills), one `skills/<name>/SKILL.md`
  each. Skills hold the judgement and shell out to the oracle for the deterministic parts.
  A skill may only _order_ the agent to read a doc that is bundled beside it under
  `skills/<name>/references/`. Those reference files are **generated** — edit the source
  under `docs/` and run `pnpm sync:plugin-refs`; `pnpm check:plugin-refs` guards them in
  pre-commit. Skill bodies carry **no links out of `packages/plugin`** — no ADR or doc
  citations ([ADR-0028](docs/adr/0028-shipped-skills-carry-no-repo-citations.md)): an
  installed plugin caches only that directory, and its readers don't have this repo.
  Which ADRs govern each skill is tracked in
  [docs/skill-provenance.md](docs/skill-provenance.md) — update it in the same commit as
  the skill change it explains.
- `targets/checkout` — toy target proving the tooling: it **must** follow
  [docs/convention.md](docs/convention.md), lint clean, and keep every criterion claimed
  by a tagged test. It is a regression fixture, not example code to freely restyle. Not
  part of the pnpm workspace.
- `packages/oracle/src/rules/` is the one **governed slice** of Speccle's own source
  ([ADR-0015](docs/adr/0015-dogfooding-starts-with-one-pilot-slice.md)): its `SPEC.md`
  (key `LINT`) must lint clean and every criterion stays claimed at 100% oracle
  strength. Run the oracle against `packages/oracle/src` (spec discovery skips
  `fixtures/` directories — [ADR-0016](docs/adr/0016-spec-discovery-skips-fixture-directories.md) —
  so the package root also works, but `src` keeps the report paths below correct):

  ```sh
  node packages/oracle/src/cli.ts lint packages/oracle/src
  pnpm --filter speccle coverage && pnpm --filter speccle mutation
  node packages/oracle/src/cli.ts strength packages/oracle/src \
    --mutation ../reports/mutation/mutation.json --coverage ../coverage/coverage-summary.json
  ```

  The rest of Speccle's source stays off the convention: don't add `SPEC.md`, criterion
  ids, or tagged tests anywhere else under `packages/`.

## Style

- Sparse comments: self-describing names; comment only non-obvious constraints.
- eslint + prettier run on staged files via husky — don't hand-format, don't bypass
  hooks.
