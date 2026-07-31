---
name: review
description: Review the pending change the way the outer loop does — fan a panel of lenses over the working diff, let `oracle risk` decide whether a human is needed, then below that threshold fix what was found (re-running the checks-gate after each fix and reverting any that goes red) and above it report and stop, recording the change to the calibration record, landing the fixes in one commit, and closing with an overruleable summary that proposes a remedy for each finding, recalled from and recorded to the remedy record. Use when the user wants to review a branch or the pending change, asks to "review this", "review my changes", "run the lenses", find-and-fix issues before opening a pull request, or check a change set for correctness, security, accessibility, architecture, performance, test-quality, or house-convention problems. For findings CI has already posted on a pull request, use `address` instead.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# review

The outer loop, before the pull request. Its unit is the **change set** — the branch's or the
working tree's pending change, not a slice — which is why it is separate from `feature`. It fans a
panel of **lenses** over the diff, and — gated by the change's **risk score** — either fixes what
it finds or reports and stops for a human. Below the threshold it also **lands** what it fixed, in
one commit. It generates feedback; it does not itself change the inner loop.

**It never pushes**, and it takes no pull request. Once CI has posted a review on a pull request,
acting on it is `address`'s job — reading findings someone already paid for is a different job
from deriving them, and running a second panel on the same commit can reach a different answer.

## 1. Read the mechanics first

The risk gate, the guarded fix loop, remedy routing, calibration, landing and the summary are
shared with `address` and are written once, in `${CLAUDE_SKILL_DIR}/references/mechanics.md`. Read
it before running anything — this skill covers only what is specific to a local panel and assumes
the rest.

Resolve the oracle now, the way that doc's ladder says. `<oracle>` below means what it resolved to.

## 2. The change set

By default the working tree's pending change against its last commit. Read it once — `git status
--porcelain --untracked-files=all` for the files, `git diff HEAD` for the lines — and hand the
changed files and their diff to every lens. A finding must anchor to a **changed line**; a lens
does not audit the whole repo.

When the change under review is already **committed** — a branch about to become a pull request —
the working tree is clean and holds none of it. Name it with a base ref instead: `git diff
--name-only <base>...HEAD` for the files, `git diff <base>...HEAD` for the lines. **Settle that ref
now** and use the same one everywhere below — the risk gate and the calibration record alike. Two
steps that measure different change sets are how a review ends up recording a change nobody
reviewed.

If neither yields a change set, there is nothing to review — say so and stop.

## 3. The risk gate

Run it now, before the panel: it decides whether the panel may fix anything at all. Follow the
risk gate in `references/mechanics.md`, passing `--base <ref>` if step 2 settled one, and keep the
`score` it computes — calibration is recorded against it.

## 4. The lens panel

Fan out one subagent per lens in `.speccle/lenses/*.md`, in parallel — this is the local driver,
so the panel runs as subagents in this session, no API key. That glob is flat on purpose: the
`plan/` subdirectory holds lenses aimed at a slice being planned, not at a change set, and the
panel never reaches into it. Skip two of the files it does match:

- `risk.md` — already applied in step 3; it escalates authority, it is not a finding lens.
- `house-conventions.md` **when it still reads as the shipped template** — its body carries the
  `speccle:lens-template` marker until a repo authors it. An unauthored lens is inert; skip it and
  note that the repo has not written its house-conventions lens yet.

Each subagent's prompt carries the lens file verbatim (its stance, what to look for, how to
report), the changed files and their diff, and the instruction to return findings anchored to
changed lines only, in the shape the lens describes: `path:line`, severity, what, why, the fix, and
a remedy route. A lens that finds nothing returns an empty list — the common, valid result. Collect
every finding across the panel.

Every lens carries the same bar for the prose it returns, and hold each subagent to it: the reader
did not write this change. **Verify the claim against the code path before writing it** — name the
input that reaches the line and what actually happens there. Then **lead with the consequence in
plain words**, mechanism in the sentence after, and keep the length proportional to the severity. A
finding that mis-describes the failure is worse than no finding: it is confidently wrong, and it
spends the reader's attention to return nothing. Send a finding back rather than passing on a claim
you cannot trace to a line and an input.

## 5. Close the loop

The rest is the shared machinery, in `references/mechanics.md`, in this order:

1. **Fix** what the risk gate allows, guarding every fix with the checks-gate and reverting any
   that goes red.
2. **Route** every finding to a remedy — recall before deriving, record what you applied.
3. **Calibrate** — record this change against the floor step 3 computed, and the base ref step 2
   settled, **before** anything commits.
4. **Land** the survivors in one commit. **Do not push**: nothing here named a branch to push to,
   and a local review that pushes is `address` doing its job badly.
5. **Summarize** — announce, never gate. Where the findings came from is this panel; say so, and
   name the lenses that ran.
