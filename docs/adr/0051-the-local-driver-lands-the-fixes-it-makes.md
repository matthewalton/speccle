# 0051 — The local driver lands the fixes it makes

- Status: accepted
- Date: 2026-07-28
- Completes the loop [ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)
  opened and [ADR-0047](0047-the-ci-driver-ships-in-the-tarball-and-is-the-one-llm-caller.md)
  handed to the local driver — "fixes come back through the local driver" now says where they stop

## Context

The outer loop reaches the human and then stalls. CI posts findings on a pull request
([ADR-0047](0047-the-ci-driver-ships-in-the-tarball-and-is-the-one-llm-caller.md)), the human
opens a session and asks for the `review` skill, the panel fixes what it finds and runs the
checks-gate — and stops, because the skill says `review` does not commit: the change set is
the human's or the inner loop's to land.

Run once against a real pull request, that ending costs three more round-trips for two `minor`
findings: ask for a commit, read the message the session had to invent, ask for a push. The
message is the tell. The skill knows the finding, the fix it applied, whether the checks-gate
stayed green, and the remedy it routed — everything a commit message needs — and it throws all
of it away, then asks a human to supply it again from memory.

Two further things go wrong at that boundary. The session re-derives the findings by running
its own lens panel, so it pays for a panel CI already paid for and can reach a different answer
on the same commit — two reviews of one change set, neither citing the other. And a fix landed
by hand after the fact escapes the record: `calibrate record` measures whatever tree it is
handed, so by the time a human commits and runs it, the entry describes the post-fix tree
rather than the change the panel reviewed —
the same mismeasurement `--floor` was added to refuse, arriving by a different route.

## Decision

**The local driver lands what it fixes.** `review` gains a closing step: one commit, and a push
when the human named a pull request.

- **CI's findings come back through the oracle, not a second panel.** A new deterministic
  command, `speccle review findings --pr <n>`, reads the review the CI driver posted —
  recognised by the marker it already stamps — and returns its findings as typed JSON, with the
  head sha they were written against so a stale review announces itself. When no such review
  exists the skill runs the panel as before. Reading a posted review calls no model, so this
  does not widen [ADR-0047](0047-the-ci-driver-ships-in-the-tarball-and-is-the-one-llm-caller.md)'s
  one-LLM-caller boundary; the code the two commands share moves into modules neither owns, so
  the boundary stays checkable rather than becoming a claim about intent.
- **One commit, not one per finding.** §5's per-fix revertibility is a property of how the
  fixes are applied and gated, not of how they are recorded; keeping it visible in history buys
  a log nobody reads at the cost of one that reads badly. The commit body lists every finding
  fixed, with its lens and its severity.
- **The skill writes the message from what it did**, in the repo's commit convention. It is the
  only party that knows which fixes survived the checks-gate and which were reverted, so asking
  anyone else to describe the commit is asking them to guess.
- **Calibration is recorded before the commit, never after.** The entry binds to the change set
  the panel reviewed via `--base` and `--floor`; commit first and the fixes are inside that
  range, so `calibrate record` re-measures a different change and correctly refuses. Ordering
  is the whole fix — there is no flag that makes the other order honest.
- **Push follows the pull request, not a flag.** A review invoked against a PR lands there: the
  change is already outward-facing, CI already ran on it, and the human asked for the loop to
  close. A review of a plain working tree commits and stops, because there is no named place
  for it to go. Neither path asks permission — the summary reports what landed, in keeping with
  **announce, never gate**.

## Consequences

- Pushing re-triggers metered CI on the branch, which is the cost of closing the loop rather
  than an accident of it. It is bounded by the same thing that bounds the review: a human ran
  the command.
- `review` is no longer read-only on the repository's history. The mitigation is the one
  [ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md) already
  accepted for the inner loop's auto-commit — a bad commit is one revert away — plus the
  narrower blast radius that a fix only lands at all if it passed the checks-gate.
- A finding recovered from a review whose inline anchors GitHub rejected carries only its path,
  line, lens and severity, because that is all the summary body holds. It is returned marked
  partial rather than silently thinned, and the skill reads the remaining detail off the PR.
- The GitHub seam and the finding's comment format become shared surface, held by a round-trip
  test: the parser is the inverse of the writer, and drift in either fails that test rather
  than quietly returning findings with empty fields.
- `review findings` is the first command a human runs locally against the GitHub API, so repo
  and token resolution grow a local ladder — the `origin` remote, then `gh auth token` — which
  the CI driver inherits and never reaches, because Actions sets both.
