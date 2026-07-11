# 0019 — A feature folder is named and has a fixed shape

- Status: accepted
- Date: 2026-07-11

## Context

The convention defined a feature as "a directory subtree" with `SPEC.md` and
`CONTEXT.md` at its root and code "in whatever layout the project prefers". The Wield
carve (cold-test of `carve-feature`) showed both freedoms failing in practice: an
unnamed catch-all (`src/`) qualified as the carve boundary, so the contract landed on a
folder that announces nothing; and with layout free, the markdown sat mixed in with
source files, which reads worse with every file added. Two Speccle projects could
follow the convention and still look nothing alike.

## Decision

A feature folder is **named for the feature**, even when the project has only one. An
unnamed catch-all (`src/`, `lib/`) is never a feature folder.

Every feature folder has one fixed shape: the markdown contract at the root —
`SPEC.md`, `CONTEXT.md`, `AGENTS.md` (ADR-0020), and `decisions/` (ADR-0021) — and all
code and tests one level down in a subfolder always named `src/`, tests beside the code
they defend.

`src/` was chosen over `code/` and `impl/` because it is the name every tool and agent
already understands; uniformity across features and projects is the requirement the
shape exists to meet.

## Consequences

- Every slice is self-announcing, and a second feature has an obvious home beside the
  first.
- The feature root stays pure markdown regardless of how many source files the feature
  grows.
- `carve-feature` must treat an unnamed boundary directory as the pre-carve refactor
  case rather than a valid boundary.
- Speccle's own governed slice inherits the wart
  `packages/oracle/src/rules/src/` — accepted as the cost of the standard name.
