# AGENTS.md

Speccle is a Claude Code plugin for building features as vertical slices — a colocated
`spec.md`, `CONTEXT.md`, and the tagged tests that defend it — plus deterministic
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
pnpm --filter speccle-oracle test        # oracle unit + e2e tests (vitest)
pnpm --filter speccle-oracle typecheck
pnpm --filter speccle-oracle build
pnpm lint                                # eslint, repo-wide
pnpm format:check                        # prettier, repo-wide
node packages/oracle/src/cli.ts lint targets/checkout   # run the linter from source
```

Node ≥ 24 runs TypeScript directly — no build step needed to run the CLI from source.

## Map and boundaries

- `packages/oracle` — Speccle tools: deterministic, independently runnable, typed JSON
  output, and they **never call an LLM**.
- `packages/oracle/test/fixtures/dirty/` — specs that deliberately violate the
  convention; they are lint regression fixtures. Never "fix" them.
- `packages/plugin` — the Claude Code plugin (the skills). Currently a stub.
- `targets/checkout` — toy target proving the tooling: it **must** follow
  [docs/convention.md](docs/convention.md) and lint clean. It is a regression fixture,
  not example code to freely restyle. Not part of the pnpm workspace.
- Speccle's own source does **not** follow the Speccle convention
  ([ADR-0009](docs/adr/0009-speccle-does-not-dogfood-its-own-convention.md)): don't add
  `spec.md`, criterion ids, or tagged tests to `packages/`.

## Style

- Sparse comments: self-describing names; comment only non-obvious constraints.
- eslint + prettier run on staged files via husky — don't hand-format, don't bypass
  hooks.
