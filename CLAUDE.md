# Speccle

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
  output. Every command **calls no LLM**, with one named exception: `review run`, the CI
  review driver, which is the whole reason it lives in `reviewrun.ts` and nothing else
  imports it ([ADR-0047](docs/adr/0047-the-ci-driver-ships-in-the-tarball-and-is-the-one-llm-caller.md)).
  Keep it that way — a second caller makes the boundary unverifiable.
- `packages/oracle/lenses/` — the baseline review lenses (one markdown prompt each), the
  dimensions the `review` skill fans out over. Unlike the skills — copied in from the
  plugin at build time — these are committed source that ships in the tarball (`files`) and
  `speccle init`/`update` vendor into a consumer's `.speccle/lenses/`. `house-conventions.md`
  is a template the consumer owns; a refresh never overwrites it. Vendored into arbitrary
  repos, so they carry **no citations out of this package**, same as the skills.
- `packages/oracle/templates/` — scaffolds `init` places once and never overwrites, for the
  surfaces a consumer owns outright. `checks-README.md` documents the `verify` check schema
  into `.speccle/checks/`; `plan-lenses-README.md` documents the plan lens into
  `.speccle/lenses/plan/`, whose every other `*.md` is a lens `plan-feature` runs
  ([ADR-0057](docs/adr/0057-a-plan-lens-lives-in-a-subdirectory-and-joins-the-plan-summary.md)).
  Shipped in the tarball (`files`) and vendored into arbitrary repos,
  so the same no-citations rule applies.
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
  pre-commit. Any change here is shipped content, so it moves **both** version lines — see
  [Versioning](#versioning). Skill bodies
  carry **no links out of `packages/plugin`** — no ADR or doc
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

## Versioning

Two artifacts publish — the `speccle` npm tarball and the marketplace plugin — and they
carry **one version line, equal at every commit**
([ADR-0048](docs/adr/0048-the-tarball-and-the-plugin-share-one-version-line.md),
[ADR-0050](docs/adr/0050-shipped-content-moves-both-version-lines-in-the-same-commit.md)).

**Any commit that changes shipped content bumps all three manifests together**, in that same
commit:

| Manifest                                     | What it numbers         |
| -------------------------------------------- | ----------------------- |
| `packages/oracle/package.json`               | the npm tarball         |
| `packages/plugin/.claude-plugin/plugin.json` | the marketplace plugin  |
| `.claude-plugin/marketplace.json`            | the mirror of the above |

**Shipped content** is what reaches a consumer: `packages/plugin/` (its skills are copied
into the tarball at build time), `packages/oracle/lenses/`, `packages/oracle/templates/`, and
`packages/oracle/src/` — except `*.test.ts`, which the build excludes. Tests, fixtures,
`docs/`, `scripts/`, and repo-level prose ship to no one and bump nothing.

Bumping only one line is the mistake this rule exists to stop: the marketplace cache is
keyed by version, so unchanged numbers serve a stale tree, while npm's duplicate rejection
only ever complains at publish — long after the number stopped meaning what it says. `pnpm
check:plugin-version` enforces it pre-commit and names the shipped files that triggered it;
`prepublishOnly` re-asserts it on the working tree before a tarball can be built. A
`chore(release)` commit is not a catch-up — the lines are already equal when it is written.

## Style

- Sparse comments: self-describing names; comment only non-obvious constraints.
- eslint + prettier run on staged files via husky — don't hand-format, don't bypass
  hooks.
