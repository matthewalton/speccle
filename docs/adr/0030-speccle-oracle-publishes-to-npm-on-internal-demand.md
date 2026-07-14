# 0030 — `speccle-oracle` publishes to npm, on internal demand

- Status: accepted
- Date: 2026-07-14

## Context

ADR-0001 deferred npm publishing beyond v1, and ticket #57 sharpened that into a
condition: publish only when the tools earn standalone demand. The demand arrived, but
from inside the house rather than from non-Claude users. #125's project-level install
wants `speccle-oracle` as a lockfile-pinned devDependency of the target repo — that is
the mechanism that kills the skill↔oracle contract-drift class of bugs (#67 was one) —
and ADR-0029 explicitly waits on the publish to add `speccle-oracle` as a devDependency
from `strength init` and to revisit the import-based preset. Every remaining step of
#125 is gated on the package being installable.

## Decision

`speccle-oracle` publishes to the public npm registry. The package stays exactly what
ADR-0002 made it — the deterministic bin, no LLM calls, no new surface grows for the
occasion. A standalone CLI for non-Claude users remains deferred; this publish serves
the skills.

- The tarball ships `dist/` only (plus README and LICENSE): the bin is self-contained,
  `strength init`'s presets live in code, and there are no runtime dependencies.
- The version joins the plugin's release line — first publish is 0.7.1, matching the
  plugin release it accompanies, and the two bump together from here. #125 is heading
  toward the npm package being the thing a repo installs, so one version line names one
  Speccle release; independent numbering would reintroduce in version space the drift
  the lockfile just killed.
- The README's repo-relative links become absolute GitHub URLs — npmjs readers don't
  have the repo checked out (ADR-0028's reasoning, applied to the package page).
- Publishing is an explicit `npm publish` by the maintainer. No CI pipeline, no
  automation, consistent with the #60 stance that nothing ships silently.

## Consequences

- `strength init` can add `speccle-oracle` itself as a devDependency, and target repos
  pin the skills↔oracle pairing in their lockfile (#125).
- Version-bump discipline now spans three manifests: `plugin.json`,
  `marketplace.json`, and the oracle's `package.json`. The guard proposed in #129 must
  cover all three.
- ADR-0001's "nothing speculative" principle survives narrowed, not broken: the publish
  has a consuming skill workflow; the standalone-CLI ambition stays parked (#57's
  original external-demand condition still applies to that).
