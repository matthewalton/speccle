# 0044 — The oracle resolution ladder prefers the repo's pinned oracle

- Status: accepted, amended by
  [ADR-0045](0045-the-published-cli-is-speccle-the-oracle-stays-the-concept.md) — the
  ladder's shape stands; its first two rungs are spelled `speccle`
- Date: 2026-07-23

## Context

Every skill that shells out to the oracle opens by resolving it, and until now the
ladder had two rungs: `speccle-oracle` on `PATH`, else `node
<clone>/packages/oracle/src/cli.ts`. That was a faithful reading of #67 (2026-07-09),
whose ruling was that cloning the repo is how you install Speccle — the `PATH` rung
described the `npm link` that ruling produced.

Two later decisions invalidated the premise without anyone revisiting the ladder.
[ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) published the
oracle to npm, so nobody needs a clone. [ADR-0031](0031-project-level-install-rides-the-skills-cli.md)
made `strength init` add `speccle-oracle` to the target's devDependencies, pinned with a
caret to the running oracle's version.

A devDependency lands in `node_modules/.bin`, which is on `PATH` only inside npm
scripts — never in a shell Claude Code spawns. So a consumer who followed the
project-level install exactly as documented had an oracle no skill could see: rung 1
missed, rung 2 missed, and every skill correctly refused to proceed. The documented
project-level install had never stood up on its own. It stayed invisible because every
cold test to date ran with the oracle `npm link`ed globally from the dev clone.

The obvious fix — `npx --no-install speccle-oracle` — was measured and rejected.
`--no-install` does stop npx downloading (`npx canceled due to missing packages and no
YES option`), but npx still makes a registry round-trip to resolve the version spec
before it refuses, so the rung is not offline-clean on the miss path and its failure
text is npm's rather than ours. Invoking the bin file directly is network-free on every
path and needs no flag to be safe.

## Decision

Three rungs, tried in order, resolved once per run and reused:

1. `<repo-root>/node_modules/.bin/speccle-oracle` — the repo's own pinned copy.
2. `speccle-oracle` on `PATH` — a global install.
3. `node <speccle-repo>/packages/oracle/src/cli.ts` — from a clone.

**A repo that pins its own oracle outranks a global one.** The pin is committed,
lockfile-backed and reviewed; a global install is ambient machine state. Lint rules
change between versions, so a team whose members resolve different oracles gets specs
that lint clean for one person and dirty for another — the quiet inconsistency ADR-0030
set out to avoid. This also matches how every other tool in the ecosystem resolves:
npm scripts, `npx` and yarn all prefer the local install.

Skills test for the bin **file** rather than trying the bare name, because the bare name
is exactly what does not work. Nothing is ever fetched from the registry to answer
"where is the oracle?"; if no rung resolves, the skill points at the README's install
steps and stops rather than guessing.

The ladder stays inline in each skill rather than moving to a bundled reference
([ADR-0014](0014-a-skill-bundles-the-docs-it-orders-you-to-read.md)). It is four lines,
and it is the step that must not fail — putting a file read in front of the agent's
ability to locate the oracle buys deduplication at the cost of the one instruction
everything else depends on. The six copies are kept word-for-word identical so drift is
greppable.

## Consequences

- The project-level install of ADR-0031 works unassisted for the first time; global is
  now a convenience, not a prerequisite.
- A machine with both a global oracle and a repo that pins one changes behaviour: the
  repo's version now runs. That is the point, but it is a behaviour change.
- Six `SKILL.md` files carry the same ladder, four in long form and two inline. Editing
  one means editing all six; nothing enforces that yet.
- Resolution never touches the network, so the skills work offline whenever the oracle
  is installed at all.
- `plan-feature` is the one skill with no ladder — it never shells out to the oracle.
