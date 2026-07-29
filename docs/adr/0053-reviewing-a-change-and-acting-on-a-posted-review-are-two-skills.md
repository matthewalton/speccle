# 0053 — Reviewing a change and acting on a posted review are two skills

- Status: accepted
- Date: 2026-07-29
- Refines [ADR-0051](0051-the-local-driver-lands-the-fixes-it-makes.md): its "land what you
  fix" decision stands, and splits across the two skills below
- Both remain outer-loop skills under
  [ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)

## Context

`review` does two jobs behind one branch in its §4 — "CI's findings if it has them, the
panel's if not". The branch makes them look like one job with a shortcut. They are not:

|               | Review the pending change | Act on a pull request's review           |
| ------------- | ------------------------- | ---------------------------------------- |
| Input         | the working diff          | a posted review, and a PR number         |
| Findings from | the lens panel runs       | `review findings --pr` reads them        |
| Must handle   | —                         | staleness, partial findings, the PR base |
| Lands         | one commit, stops         | one commit, **pushed to the PR branch**  |
| When          | before the pull request   | after CI reviewed it                     |

Two costs follow from the conflation. The visible one: asking for a pull request's findings
when CI has not posted falls through to running a whole local panel. The human asked to read
a review and silently paid for a new one — which can also reach a different answer on the
same commit, the exact duplication
[ADR-0051](0051-the-local-driver-lands-the-fixes-it-makes.md) removed from the other
direction. The quieter one: every reader of the skill carries staleness handling, partial
findings, base-ref settling and push logic through a working-tree review where none of it
applies.

## Decision

**Two skills.**

- **`review`** — the local lens panel over the pending change. Fans the lenses, applies the
  risk gate, fixes what it may, commits. It does not push, because there is no named place
  for the commit to go.
- **`address`** — acts on the findings CI already posted on a pull request. Reads them via
  `speccle review findings --pr <n>`, fixes what the risk gate allows, commits, and pushes to
  the pull request's branch.

**`address` with no posted review stops and says so** — "no review posted on #42; wait for CI,
or run `review` for a local panel". The silent fallback to a panel is the behaviour being
removed, not a feature being relocated.

**The name is not `remedy`.** A remedy is the durable prevention artefact in Speccle's
glossary; spending the word on a skill that applies fixes would break the vocabulary rule that
makes the glossary worth having.

**The shared mechanics live in one doc, bundled twice.** The risk gate, the
fix-then-gate-then-revert loop, remedy routing, calibration, landing and the summary bar are
common to both. They go in a doc under `docs/`, synced into both skills' `references/` by
`scripts/sync-plugin-references.mjs` — the mechanism `docs/convention.md` already uses across
five skills, and the only one available given shipped skills carry no citations out of the
plugin ([ADR-0028](0028-shipped-skills-carry-no-repo-citations.md),
[ADR-0014](0014-a-skill-bundles-the-docs-it-orders-you-to-read.md)). One source, two copies,
`check:plugin-refs` guarding the drift.

## Consequences

- The skill list grows by one, and the shared reference ships twice in the tarball. Accepted:
  duplicated prose in two `SKILL.md` bodies would drift, and a generated copy cannot.
- **ADR-0051's push rule becomes structural instead of conditional.** "Push only when the human
  named a pull request" was a branch inside one skill; now `address` always pushes and `review`
  never does. The rule is the same; it is no longer something the reader has to evaluate.
- Both skills are shipped content, so landing them moves all three version lines
  ([ADR-0050](0050-shipped-content-moves-both-version-lines-in-the-same-commit.md)).
- `docs/skill-provenance.md` gains a row for `address` in the commit that adds the skill.
- The lifecycle reads in one line: `feature` builds the slice
  ([ADR-0052](0052-the-feature-pipeline-runs-one-stage-per-session-and-derives-the-stage.md)),
  `review` checks the change before it goes out, CI posts a review on the pull request, and
  `address` closes it. The meta loop's `criterion` remedies come back as a `feature` amend
  rather than being hand-applied inside a review session.
