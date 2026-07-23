# 0045 — The published CLI is `speccle`; the oracle stays the concept

- Status: accepted
- Date: 2026-07-24
- Amends [ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) — the
  package it named `speccle-oracle` publishes as `speccle`

## Context

`speccle-oracle` was a reasonable package name when
[ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) chose it: the
repo has two packages, and the name said which one you were installing. Read from
outside, it says something else. It implies a second Speccle binary that the oracle
sits beside, and a reader has to learn what an oracle is before they can type a
command.

The oracle is a real and load-bearing concept —
[ADR-0002](0002-two-packages-oracle-owns-lint.md)'s deterministic measuring
instrument, the thing that never calls an LLM. It earns its keep in
[CONTEXT.md](../../CONTEXT.md)'s glossary, in `oracle strength` the metric, and every
time someone asks why judgement lives in the skills instead. None of that requires it
to be the word on the command line.

The plugin has been named `speccle` in both `plugin.json` and `marketplace.json` since
it shipped. The npm package was the one artifact carrying a different name.

## Decision

The published package and its bin are `speccle`. `speccle-oracle` is deprecated on
npm, pointing at the new name.

- **The concept is not renamed.** `packages/oracle/` keeps its folder name, CONTEXT.md
  keeps its glossary entry, `oracle strength` is still the metric, and skill prose
  still says "resolve the oracle". This is a delivery name, not a vocabulary change,
  and the distinction is the reason the rename is safe to make mechanically.
- The resolution ladder keeps the shape
  [ADR-0044](0044-the-oracle-ladder-prefers-the-repos-pinned-oracle.md) gave it; only
  the spelling of its first two rungs changes — `<repo-root>/node_modules/.bin/speccle`,
  then `speccle` on `PATH`.
- All three manifests move to 0.11.0 together. The skills name the binary they shell
  out to, so skills and CLI cannot be paired across the rename: one version line, as
  ADR-0030 already required, now also closing the 0.9.0/0.10.0 drift that had opened
  between them.

## Consequences

- Breaking for anyone with a global `speccle-oracle`, which the npm deprecation notice
  carries over. The pinned-devDependency path re-resolves on the next `strength init`;
  a target holding the old dependency keeps working until then, because it pins a
  package that still exists at its published versions.
- ADR-0030's package name is now historical. Everything it decided about _substance_ —
  ships `dist/` only, no runtime dependencies, no new surface, publishing stays a
  manual maintainer act — is untouched.
- `speccle init` becomes available for the repo-facts surface
  ([ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md)), which reads
  better than `speccle-oracle init` for a command that writes down facts rather than
  measuring anything.
