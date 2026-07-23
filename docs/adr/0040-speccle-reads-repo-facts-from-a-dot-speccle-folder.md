# 0040 — Repo facts live in `.speccle/`, judgement still has no knobs

- Status: accepted, amended by
  [ADR-0041](0041-risk-gates-fix-authority-deterministic-floor-lens-escalates.md) — risk
  policy is the one sanctioned exception to "no configurable judgement"
- Date: 2026-07-23
- Amends [ADR-0007](0007-lint-rules-are-fixed-heuristics.md) — "no configuration" narrows
  to no configurable judgement; repo facts are configuration

## Context

Named test dialects
([ADR-0038](0038-test-dialects-make-speccle-multi-language-not-agnostic.md)) need a repo
to say which dialect it is on, and the checks-gate
([ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md)) needs
to know how to run a suite Speccle did not provision — `xcodebuild test -scheme Ladder`
is not something any dialect can infer.

That is Speccle's first repo-level configuration, and
[ADR-0007](0007-lint-rules-are-fixed-heuristics.md) says there isn't any.

The two are reconcilable because they are different kinds of thing. A lint rule or a
claim regex **decides whether you pass** — configurable judgement is gameable judgement,
and a clean run would stop meaning the same thing in every repo. A dialect name or a
shell command is simply **true about the repo**; Speccle cannot know it and there is
nothing to game.

The alternatives were per-slice `SPEC.md` frontmatter, which handles mixed-language
monorepos for free but repeats itself in every slice and pushes tooling facts into a file
that is otherwise pure product contract; and pure auto-detection, which is silently wrong
in a mixed repo and offers no way to correct a wrong guess.

## Decision

`.speccle/` at the repo root is where Speccle reads repo facts:

- `.speccle/config.json` — the test dialect, the suite command, and per-path overrides
  for a mixed-language tree.
- `.speccle/lenses/` — the review lenses.

`init` auto-detects and then **writes the result down**; the written record is the source
of truth, never the detection. Same posture `strength init` already takes with package
managers and mutate globs.

Configuration covers facts about the repo. It never covers judgement: there is no way to
tune a lint rule, a claim regex, or a dialect's parsing.

## Consequences

- "Speccle has no configuration" becomes "Speccle has no configurable judgement", and
  the docs have to say the longer thing.
- One obvious home for everything Speccle needs from a repo, which the review work
  already wanted for lenses.
- A wrong dialect is visible in a committed file rather than hidden in a detection
  heuristic.
