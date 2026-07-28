# 0050 — Shipped content moves both version lines in the same commit

- Status: accepted
- Date: 2026-07-28
- Amends [ADR-0048](0048-the-tarball-and-the-plugin-share-one-version-line.md) — the two
  artifacts still share one version line; this closes the window where they may differ

## Context

[ADR-0048](0048-the-tarball-and-the-plugin-share-one-version-line.md) put the tarball and
the plugin on one version line and allowed one exception: between releases the plugin may
run ahead, because the marketplace cache forces its bump immediately and nothing comparable
forces the oracle's. The release commit closed the gap in the oracle's direction.

That window has not survived contact. Every time it opened, it was closed by the very next
commit — `04c31ac` left the plugin at 0.18.0 against an oracle at 0.17.0, and the next
commit was the 0.18.0 release. The window is a state the repo passes through, never one it
rests in, so what it actually buys is nothing.

What it costs is a recurring miss. ADR-0048 names the mechanism itself: "Nothing comparable
forces the oracle's version, because npm rejects a duplicate version outright: the failure
is loud, but it only arrives at publish." A rule enforced only at publish is not enforced
while the work is being done. The author bumps the number the guard asks for and leaves the
number nothing asks for, every time — the failure is structural, not carelessness, and it
recurs because the guard's silence reads as approval.

There is a second cost the window hid. Content that ships in the tarball is not only the
skills: `packages/oracle/src/` compiles to `dist/`, and `packages/oracle/lenses/` is vendored
verbatim into consumers. Six oracle commits once sat under 0.15.0 — six shipped changes
under a number that already meant something else. npm's duplicate-version rejection catches
the last of those at publish and says nothing about the five before it.

## Decision

The oracle's version and the plugin's version are **equal at every commit**, and any commit
that changes content reaching a consumer bumps both.

- **Shipped content** is what the published artifacts carry: `packages/oracle/src/` (minus
  its `*.test.ts`, which the build excludes), `packages/oracle/lenses/`, and
  `packages/plugin/` — whose skills the build copies into the tarball
  ([ADR-0046](0046-the-speccle-tarball-carries-the-skills.md)). Tests, fixtures, `docs/`,
  `scripts/`, and repo-level prose ship to no one and bump nothing.
- **The plugin-runs-ahead window is closed.** ADR-0048's asymmetry — plugin bumps now, oracle
  bumps at release — is replaced by one rule that fires on both lines at the same moment.
- **`chore(release)` stops being a catch-up.** The lines are already equal when a release
  commit is written; it publishes the number the tree has been carrying, rather than
  reconciling two.
- **The pre-commit guard enforces it**, and names the shipped files that triggered it, so the
  demand arrives with its reason attached. `prepublishOnly`'s `--release` assertion is
  unchanged: it was always right, only too late to be the thing that teaches.

## Consequences

- npm version history gains more gaps, and larger ones. ADR-0048 already accepted gaps as
  costless; this makes more of them. Each gap is a commit whose content shipped to nobody
  because no release followed it.
- A one-line CLI fix now costs a version bump on both manifests. That was already true of a
  one-line skill fix. The rule is now the same in both directions, which is the point — an
  asymmetry is what produced the drift.
- A commit touching only tests, fixtures, or docs bumps nothing, so the common
  non-shipping commit is unaffected.
- The number in `packages/oracle/package.json` becomes true continuously rather than at
  release: at any commit, it names the content that tree would ship.
