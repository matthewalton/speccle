---
name: address
description: Act on the review CI already posted on a pull request — read its findings with `speccle review findings`, let `oracle risk` decide whether a human is needed, then below that threshold fix them (re-running the checks-gate after each fix and reverting any that goes red) and above it report and stop, recording the change to the calibration record, landing the fixes in one commit and pushing it to the pull request's branch, and closing with an overruleable summary that proposes a remedy for each finding, recalled from and recorded to the remedy record. Use when the user wants to act on a posted review — "address the review", "fix the review findings", "fix what CI found", "apply the PR review", "deal with the review comments" — or names a pull request to clear. To derive findings locally instead, before a pull request exists, use `review`.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# address

The outer loop's other half, after the pull request. `review` derives findings; `address` acts on
the ones CI already posted. Its unit is the same **change set** — the pull request's pending
change — and the same **risk score** gates whether it may fix at all. What it adds is the last
step: the commit is **pushed to the pull request's branch**, because that is a named place for it
to go and closing that loop is the whole reason this was called.

**With no posted review, this skill stops.** It does not quietly run a local panel instead — the
human asked to act on a review, and paying for a fresh one on the same commit can reach a
different answer than the one they read. `review` is the skill for that, and it says so by name.

## 1. Read the mechanics first

The risk gate, the guarded fix loop, remedy routing, calibration, landing and the summary are
shared with `review` and are written once, in `${CLAUDE_SKILL_DIR}/references/mechanics.md`. Read
it before running anything — this skill covers only what is specific to a posted review and
assumes the rest.

Resolve the oracle now, the way that doc's ladder says. `<oracle>` below means what it resolved to.

## 2. Which pull request

Do not make the human look this up — they are standing on the branch, and the branch knows.

1. **They named a number** — use it. A number they typed beats one you derived.
2. **Otherwise, derive it from the branch**: `gh pr view --json number,url`. That is the pull
   request for the current branch.
3. **Neither** — `gh` reports no pull request for this branch. **Stop and say so**: the branch has
   no pull request, so there is no posted review to act on. Offer the two real moves — push and
   open one, or run `review` for a local panel — and leave the tree alone.

## 3. The posted review

```sh
<oracle> review findings <path> --pr <number> --json
```

This calls no model. It returns the findings of the **latest** review the CI driver posted — each
with its lens, `path:line`, severity, and the fix and remedy the lens proposed — plus the `base`
ref, the pull request's `headSha`, and a `stale` flag.

Read `outcome` first:

- **`no-review`** — nothing posted. **Stop and say so**: "no review posted on #42 — wait for CI, or
  run `review` for a local panel." Do not fan a panel. This is the one branch that most looks like
  a shortcut and is not one: it is the behaviour this skill exists to remove.
- **`no-findings`** — CI reviewed it and found nothing. There is nothing to fix, but this is still
  a change worth remembering: skip to step 5 and record it with `--found-real false`. A clean
  review is exactly the evidence a threshold moves on, and CI could not record it — the honest
  verdict is the human's, which is why it was left for here.
- **`found`** — carry on below.

Then settle three things before touching any code:

- **The base ref** — take it from the report, never guess it. Every step that measures the change
  set uses this one, the risk gate and the calibration record alike.
- **Staleness** — when `stale` is true the head moved after that review, so a finding may name a
  line that is gone. Check each against the code before fixing it, and say so, loudly, in the
  close.
- **That you are standing on the reviewed code** — compare `git rev-parse HEAD` with the report's
  `headSha`. If they differ you are on a different branch, behind the pull request, or holding
  commits it has never seen; either way the tree in front of you is not the one that was reviewed,
  and pushing from it would carry work no lens saw. **Stop and say which way it diverged** — pull,
  push, or switch branch is the human's call.

A finding marked **`partial`** carries only its anchor, lens, severity and what: it could not
anchor to a line, so the review's summary is the whole record of it and there was never a fix or
remedy to read. Derive those yourself.

## 4. The risk gate

Run it now, before fixing anything. Follow the risk gate in `references/mechanics.md`, passing
`--base <ref>` from step 3, and keep the `score` it computes — calibration is recorded against it.

CI's review does not carry fix authority: it reported findings, and whether they may be fixed
unasked is a property of the change, decided here, now.

## 5. Close the loop

The rest is the shared machinery, in `references/mechanics.md`, in this order:

1. **Fix** what the risk gate allows, guarding every fix with the checks-gate and reverting any
   that goes red. On a stale review, re-check each finding against the code first.
2. **Route** every finding to a remedy — recall before deriving, record what you applied.
3. **Calibrate** — record this change against the floor step 4 computed, and the base ref step 3
   settled, **before** anything commits. CI could not write this entry: `--needed-human` is the
   human's answer and no CI run has one to give.
4. **Land** the survivors in one commit, then **push it to the pull request's branch**. That is
   what closing the loop means here. If the branch has diverged, stop and say so rather than
   forcing, rebasing, or merging.
5. **Summarize** — announce, never gate. Where the findings came from is CI's posted review; give
   its age, and say loudly if it was stale.
