# 0048 — The tarball and the plugin share one version line

- Status: accepted
- Date: 2026-07-25
- Amends [ADR-0046](0046-the-speccle-tarball-carries-the-skills.md) — the tarball still
  carries the skills; this settles what number the two published artifacts carry

## Context

[ADR-0046](0046-the-speccle-tarball-carries-the-skills.md) put the skills inside the
`speccle` npm tarball so that `speccle@X` names one skill↔oracle pairing. It deliberately
kept the user-level marketplace path alive as a second install path, and left the two
version lines as a stated cost rather than a decision.

Those two lines then drifted, and the drift surfaced at release time.

`packages/plugin/.claude-plugin/plugin.json` walked 0.13.0 → 0.15.0 across three
skill-only commits, while `packages/oracle/package.json` sat at 0.13.0. Because the build
copies `packages/plugin/skills/` into the tarball, the **same skill files** were about to
ship under two different numbers: `speccle@0.13.0` on npm, `speccle@0.15.0` on the
marketplace.

The asymmetry that produces this is structural, not an oversight. A change under
`packages/plugin/` must bump the plugin **immediately** — the marketplace cache is keyed
by version, so unchanged numbers serve a stale tree. Nothing comparable forces the
oracle's version, because npm rejects a duplicate version outright: the failure is loud,
but it only arrives at publish, long after the number stopped meaning what it says.

Nothing is broken by the drift. `speccle doctor` stamps vendored skills with the **CLI's
own** version into `.speccle/config.json`, so the plugin's number is invisible on the
project-level path, exactly as ADR-0046 intended. The whole cost is comprehension: two
artifacts named `speccle`, carrying identical skills, numbered two minors apart, with
nothing telling a reader whether they are on the same skills as a colleague who installed
the other way.

Precedent already leaned lockstep without saying so. Both manifests read 0.11.0, and both
read 0.12.0. The oracle's missing 0.10.0 is this same drift-then-resync, unrecorded.

## Decision

The two published artifacts share one version line. At every npm release,
`packages/oracle/package.json`, `packages/plugin/.claude-plugin/plugin.json`, and the
`.claude-plugin/marketplace.json` mirror carry the same version.

- **Between releases the plugin may run ahead.** That is not drift; it is the marketplace
  cache doing its job. The oracle's version stays put until it publishes.
- **A release closes the gap in the oracle's direction only** — the tarball catches up to
  the plugin, never the reverse. Skipped npm versions cost nothing; a plugin version
  rolled backwards would serve a cached tree under a number that already means something
  else.
- **An oracle-only release bumps the plugin too.** Marketplace users re-download an
  unchanged skills tree, which is cheap and honest: the CLI those skills pair with did
  change.
- **Two guards enforce it.** Pre-commit, a commit that changes the oracle's version must
  land it equal to the plugin's — the release bump moves both, or it does not commit.
  At publish, `prepublishOnly` re-asserts that all three manifests agree in the working
  tree, catching a publish attempted from a tree where the plugin has since moved on.

This does not merge the artifacts. Two install paths remain
([ADR-0046](0046-the-speccle-tarball-carries-the-skills.md)), two registries, two caches.
What is shared is the number, so that `speccle@X` — from either — names one set of skills.

## Consequences

- 0.13.0 and 0.14.0 never publish to npm. The factory/review batch publishes as **0.15.0**,
  resyncing the lines the way 0.11.0 and 0.12.0 already did, and giving the CLI a version
  line that reflects six new commands and a CI driver rather than a single bump.
- npm's version history gains gaps. Acceptable: each gap is a plugin-only release, and
  the marketplace carries that history for anyone who wants it.
- A CLI-only patch now costs a plugin bump. If that ever turns noisy, the escape is to
  batch CLI patches into the next skill release — not to break the shared line.
- The guard grows a third invariant and a `--release` mode; `prepublishOnly` runs it
  before the build, so a mismatched tree fails before it can produce a tarball.
