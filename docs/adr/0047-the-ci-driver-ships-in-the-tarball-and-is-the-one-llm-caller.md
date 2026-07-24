# 0047 — The CI driver ships in the tarball, and is the package's one LLM caller

- Status: accepted
- Date: 2026-07-24
- Implements the CI driver [ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)
  left unbuilt
- Amends [ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) and
  [ADR-0046](0046-the-speccle-tarball-carries-the-skills.md) — "the bin never calls an LLM"
  becomes a statement about every command but one

## Context

[ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md) placed
`review` as the outer loop and gave it two drivers: a local session driver, which ships as a
skill, and a CI driver, which it did not build. The CI driver has to do something no skill
can — fan the lenses over a pull request unattended and post what they find — and something
no existing command does: call a model.

That collides with a boundary stated in three places. `packages/oracle` tools are
"deterministic, independently runnable, typed JSON output, and they **never call an LLM**".
Both [ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) and
[ADR-0046](0046-the-speccle-tarball-carries-the-skills.md) restate it.

The obvious way to keep the boundary intact is to keep the model call out of the package: a
runner **vendored** into each consumer repo, the way `.speccle/lenses/` already are, invoked
as `node .speccle/ci/review.mjs`. That is the shape this ticket was planned around, and it
does not survive contact with the rest of the repo's standards:

- eslint covers `**/*.ts` and `tsc` covers `src/`, so a vendored `.mjs` would be the one
  shipped file that is neither typed nor linted, and its tests could only import it as
  untyped JavaScript.
- It is a third thing that goes stale in a consumer repo, needing its own `config.json`
  stamp and its own `doctor`/`update` handling — the machinery
  [ADR-0046](0046-the-speccle-tarball-carries-the-skills.md) had just finished arguing is
  never free, only deferred.
- It is **attacker-reachable**. The runner would live in the branch under review, so the
  code doing the reviewing is code the pull request can edit — the thing "separate trusted
  workflow code from the reviewed head" exists to prevent.

Vendoring a script is cheap because a template is cheap. This is not a template; it is a
program that talks to two APIs, parses untrusted JSON, and holds a security boundary.

## Decision

**The CI driver ships inside the tarball as `speccle review run`, and is the one command in
this package that calls a model.** The scaffolded workflow pins `speccle@<version>` and npm
serves it.

- `speccle review init` writes one file, `.github/workflows/speccle-review.yml`, with the
  running CLI's version interpolated as the pin. Nothing else is vendored. Re-running is how
  a repo moves the pin, which is also its update path — no fourth staleness anchor.
- **The pin is what separates trusted code from the reviewed head.** The reviewing code
  comes from a published, immutable version; the head is data. This is a stronger property
  than the vendored shape could offer, and it is free.
- **The boundary becomes per-command, not per-package.** Every command but `review run` is
  deterministic and calls no model. `review run` is isolated in its own module, which nothing
  else imports, so the claim stays checkable rather than aspirational.
- **The deterministic verdict does not depend on the model.** `risk` is its own workflow step
  and its own exit code, so the status check survives a bad API day, and a lens that fails
  costs its own findings and nothing else.
- `review run` **finds and comments only**. It never edits the tree, commits, or pushes. A
  fix has to re-run the checks-gate and be revertible when it goes red
  ([ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)), and CI
  is the wrong place for that — fixes come back through the local driver.

The driver stays **opt-in**, written only on explicit command, because it needs a metered
`ANTHROPIC_API_KEY` and the local driver needs no key at all. That asymmetry is the whole
reason the local driver is the on-ramp.

## Consequences

- The tarball gains a module that makes network calls to two APIs. Its parsing treats both
  responses as untrusted input, and its network seams are injected, so it is unit-tested
  without a network.
- "The oracle never calls an LLM" is no longer true of the package as a whole, and every
  place that states it needs the narrower wording. That is a real loss of a simple sentence,
  accepted because the alternative buys the sentence with an unlinted, untyped,
  attacker-reachable script in every consumer repo.
- Two diff sources now exist for one change set, deliberately: the lenses read the patches
  the GitHub API reports, because those are the hunks GitHub validates an inline comment's
  line against, and `risk` reads the local git range, because its signals need the spec
  files' content. Anchoring off a locally-computed diff would invite rejected reviews.
- `risk` and `verify` grow `--base <ref>`, reading the change set from a committed range
  measured at the merge base. Without it a CI run sees a clean working tree, scores zero, and
  the status check means nothing. The same flag moves the criterion baseline off `HEAD`,
  which on a branch already contains the change.
- Whether a failing risk gate blocks a merge is **branch protection** — GitHub's setting and
  the repo's call, not something Speccle configures, exactly as
  [ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md) anticipated.
