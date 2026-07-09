# Speccle

**Build features as vertical slices — a colocated spec, its context, and the tests that
defend it — then measure whether those tests would actually notice if the code broke.**

Speccle is a Claude Code plugin. Its unit of work is the **feature folder**: a directory
subtree owning everything one feature needs, side by side.

```
src/checkout/
  SPEC.md        ← acceptance criteria, each with a stable [CHECKOUT-n] id
  CONTEXT.md     ← the feature's language and cross-criterion decisions
  checkout.ts
  checkout.test.ts   ← tests claim criteria by carrying the [CHECKOUT-n] token
```

A criterion is a heading with a one-line testable statement; the body underneath is free —
rationale, edge cases, examples:

```markdown
---
key: CHECKOUT
---

# Checkout

## [CHECKOUT-1] Tax rounds half-up per line item

Tax is computed per line item and rounded half-up to 2dp before summing.

Edge cases:

- 3 × £1.99 at 20% → £1.20 tax, not £1.19
```

A test defends a criterion when the token appears anywhere in its full name — so one
`describe('[CHECKOUT-1] …')` block claims every test inside it.

The full format is a written contract: [`docs/convention.md`](docs/convention.md).

## The skills

| Skill               | What it does                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `implement-feature` | Takes a spec in any form — prose, a ticket, a file — drafts the conventioned `SPEC.md` + `CONTEXT.md`, lints them, then **pauses for you to ratify the criteria** before writing a single test or line of code. Done = spec lints clean, every criterion has at least one tagged test, all tests green.                                                                           |
| `strengthen`        | Runs mutation testing + coverage and renders the per-criterion heatmap — `oracle strength = killed mutants ÷ covered mutants`. Coverage says the code ran; oracle strength says the tests would _notice_. Each weak criterion is routed: **machine path** (a test gap — write the killing test) or **human path** (a vague spec — propose a sharper criterion for you to ratify). |

## Install

Speccle is used from a clone, not from a registry. The skills shell out to the
`speccle-oracle` binary for everything deterministic, so the oracle has to be on your
`PATH` before the plugin is useful — cloning is the supported path, not a workaround.

```sh
git clone https://github.com/matthewalton/speccle.git
cd speccle
pnpm install
pnpm --filter speccle-oracle build
cd packages/oracle && npm link          # puts `speccle-oracle` on your PATH
```

Check it:

```sh
speccle-oracle lint targets/checkout    # → "2 spec files, clean"
```

Then add the plugin to Claude Code from your clone — point the marketplace at the
repo root and install `speccle` from it. Requires Node ≥ 24.

If `speccle-oracle` is not on your `PATH`, the skills fall back to running it from the
clone's source (`node <speccle>/packages/oracle/src/cli.ts` — Node ≥ 24 runs TypeScript
directly, no build needed). If they can find neither, they stop rather than guess: a
spec that hasn't been linted hasn't been linted.

## Packages

| Package                              | Role                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [`packages/plugin`](packages/plugin) | The Claude Code plugin: the skills.                                                                               |
| [`packages/oracle`](packages/oracle) | The deterministic tooling the skills invoke: one bin, `lint` and the oracle-strength heatmap. Never calls an LLM. |

## Status

Early — freshly restarted from [`speccle-legacy`](https://github.com/matthewalton/speccle-legacy)
with a redesigned convention. Build order:

1. ~~Scaffold + docs (this)~~
2. `oracle lint`
3. `implement-feature` skill
4. Oracle-strength heatmap
5. `strengthen` skill

Deferred beyond v1: `carve-feature` (retrofit existing code into a slice) and `gate`
(judge a diff before merge). v1 targets TypeScript projects using vitest, StrykerJS
(perTest coverage analysis), and Istanbul `json-summary` coverage.

## Development

```sh
pnpm install
```

Project terminology lives in [`CONTEXT.md`](CONTEXT.md); design decisions in
[`docs/adr`](docs/adr). Agent instructions are in [`AGENTS.md`](AGENTS.md); commit
format in [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md).
