---
name: review
description: Review a change set the way the outer loop does — take the findings CI already posted on a pull request, or fan a panel of lenses over the working diff, let `oracle risk` decide whether a human is needed, then below that threshold fix what was found (re-running the checks-gate after each fix and reverting any that goes red) and above it report and stop, recording the change to the calibration record, landing the fixes in one commit — pushed when a pull request was named — and closing with an overruleable summary that proposes a remedy for each finding, recalled from and recorded to the remedy record. Use when the user wants to review a branch, a pull request, or the pending change, asks to "review this", "review my changes", "fix the review findings", "run the lenses", find-and-fix issues before a PR, or check a change set for correctness, security, accessibility, architecture, performance, test-quality, or house-convention problems.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# review

The outer loop. Its unit is the **change set** — the branch or PR's pending change,
not a slice — which is why it is separate from `feature`. It fans a panel of **lenses**
over the working diff, and — gated by the change's **risk score** — either fixes what it
finds or reports and stops for a human. Below the threshold it also **lands** what it fixed:
one commit, pushed when a pull request was named. It generates feedback; it does not itself
change the inner loop.

Speccle's words are fixed and mandatory: "change set", not "diff" or "PR"; "lens", not
"reviewer" or "rule"; "finding", not "issue" or "comment"; "remedy", not "fix" alone;
"risk score" / "review threshold" / "floor"; "escalate", never "de-escalate". Speccle's
posture is **announce, never gate**: below the threshold the fixes just land and the
summary reports them; there is no "apply? y/n".

## 1. Resolve the oracle

Once, in this order, and reuse what works:

1. `<repo-root>/node_modules/.bin/speccle` — the repo's own pinned copy. A devDependency
   is never on `PATH` in this shell, so test for the file; in a monorepo check the package
   you are working in as well as the root. It wins over a global install: the pin is a
   committed choice, and rules change between versions.
2. `speccle` on `PATH` — a global install.
3. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24 executes
   TypeScript directly: `node <speccle-repo>/packages/oracle/src/cli.ts`.

If none resolves, point the user at the install steps in Speccle's README and stop. If
`.speccle/lenses/` is missing, the repo was never initialized for review — offer
`speccle init` and stop.

## 2. The change set

Everything here runs over the same change set — by default the working tree's pending change
against its last commit. Read it once — `git status --porcelain --untracked-files=all` for the
files, `git diff HEAD` for the lines — and hand the changed files and their diff to every
lens. A finding must anchor to a **changed line**; a lens does not audit the whole repo.

When the change under review is already **committed** — a branch, or a PR — the working tree
is clean and holds none of it. Name it with a base ref instead: `git diff --name-only
<base>...HEAD` for the files, `git diff <base>...HEAD` for the lines. **Settle that ref now**
and use the same one everywhere below, §3 and §7 alike. Two sections that measure different
change sets are how a review ends up recording a change nobody reviewed.

When the human named a **pull request**, do not guess its base: §4 reads it off the pull
request itself and reports it, so settle the ref from there. Note the PR number too — it is
what decides whether §8 pushes.

If neither yields a change set, there is nothing to review — say so and stop.

## 3. Risk — the authority gate, before any fixing

Fix authority is not a global setting; it depends on the change. Decide it first, because
it decides whether the panel may fix at all.

```sh
<oracle> risk <path> --json [--base <ref>]     # --base only for a committed change set (§2)
```

This returns the deterministic **floor**: `score`, `threshold`, `humanRequired`, and the
spec-aware `signals` that fired, each with its evidence. Then apply the **risk lens**
(`.speccle/lenses/risk.md`) yourself: read the diff for the consequential change no signal
could see, and emit its one escalation decision. The lens may **raise** the floor or
require a human outright; it may **never lower** either. A concern that the floor is too
high goes in the summary for the human — you do not act on it.

The verdict a human is required when **any** of these holds: `risk.humanRequired` is true,
the risk lens set `requireHuman`, or `score + raiseFloorBy ≥ threshold`.

- **Below the threshold, no escalation** → `review` may fix unasked (§5).
- **At or above, or the lens escalated** → `review` still runs the panel to report, but
  **fixes nothing**; a human is required.

Both the computed floor and any escalation must be legible in the summary — a risk verdict
with no visible reasoning is not auditable. Keep the `score` this returns: §7 records against
it, and it is the only moment the floor is measured on the change as it was reviewed.

## 4. The findings — CI's if it has them, the panel's if not

When the human named a pull request, CI has usually already run the panel on it. Take what it
posted rather than paying for a second panel that can reach a different answer on the same
commit:

```sh
<oracle> review findings <path> --pr <number> --json
```

This calls no model. It returns the findings of the **latest** review the CI driver posted —
each with its lens, `path:line`, severity, and the fix and remedy the lens proposed — plus the
`base` ref §2 needs and a `stale` flag.

- **`stale` is true** — the head moved after that review, so a finding may name a line that is
  gone. Check each against the code before fixing it, and say so in the close.
- **A finding marked `partial`** carries only its anchor, lens, severity and what: it could not
  anchor to a line, so the review's summary is the whole record of it and there was never a fix
  or remedy to read. Derive those yourself.
- **`outcome` is `no-review`** — nothing posted, so run the panel below.

### The lens panel — when there is no posted review to read

Whenever there is no pull request, or none of CI's findings on it, derive them here instead.

Fan out one subagent per lens in `.speccle/lenses/*.md`, in parallel — this is the local
driver, so the panel runs as subagents in this session, no API key. Skip two:

- `risk.md` — already applied in §3; it escalates authority, it is not a finding lens.
- `house-conventions.md` **when it still reads as the shipped template** — its body carries
  the `speccle:lens-template` marker until a repo authors it. An unauthored lens is inert;
  skip it and note that the repo has not written its house-conventions lens yet.

Each subagent's prompt carries the lens file verbatim (its stance, what to look for, how to
report), the changed files and their diff, and the instruction to return findings anchored
to changed lines only, in the shape the lens describes: `path:line`, severity, what, why,
the fix, and a remedy route. A lens that finds nothing returns an empty list — the common,
valid result. Collect every finding across the panel.

Every lens carries the same bar for the prose it returns, and hold each subagent to it: the
reader did not write this change. **Verify the claim against the code path before writing it** —
name the input that reaches the line and what actually happens there. Then **lead with the
consequence in plain words**, mechanism in the sentence after, and keep the length proportional
to the severity. A finding that mis-describes the failure is worse than no finding: it is
confidently wrong, and it spends the reader's attention to return nothing. Send a finding back
rather than passing on a claim you cannot trace to a line and an input.

## 5. Fix — only with authority, and never without the checks-gate

If §3 said a human is required, **fix nothing**: carry every finding on to §6, and report it
unfixed in §9.

Otherwise fix each finding, smallest change first, and guard every one:

1. Apply the fix the finding names.
2. **Re-run the checks-gate** — resolve the same oracle and run `<oracle> lint` on any
   governed slice the fix touched, `<oracle> claims <root>`, `<oracle> verify <root>` (the
   cross-file invariants), and the project's own test suite.
3. **Green** — keep the fix. **Red** — **revert it, do not salvage**: restore the file to its
   pre-fix state and carry the finding forward as unfixed. A fix that cannot pass the gate is
   the human's call, not a thing to patch around.

Batch sensibly, but keep each fix independently revertible — a fix you cannot back out on
its own is one you cannot safely apply. Revertibility is a property of how you apply and gate
them, not of how they are recorded: §8 lands the survivors as **one** commit.

Keep, per fix, what it was and what happened to it. §8 writes the commit message from that,
and nothing else knows which fixes survived the gate.

## 6. Route each finding to a remedy

For every finding — fixed, reverted, or left for the human — name the durable artefact that
stops the class recurring, routed on **what the finding is**, never on a count, the same
posture `strengthen` takes to a surviving mutant. The **remedy record** is the meta loop's
memory of that routing: consult it before deriving, add to it after applying.

**Recall first — answer a repeat the way you answered it before.** Give the finding a short,
stable class handle (kebab-case, e.g. `missing-model-roundtrip-test`) and ask the record:

```sh
<oracle> remedy recall <path> --class <handle>
```

A hit is the known-correct remedy — reuse its route and artefact rather than re-deriving, so
the same finding gets the same answer. A miss means route it fresh:

- a deterministic, cross-file invariant → an `oracle verify` check in `.speccle/checks/`.
- behaviour a criterion should own → a new acceptance criterion, and its tagged test, in the
  owning `SPEC.md`.
- a dimension a lens missed or stated too weakly → sharpen the lens in `.speccle/lenses/`,
  the house-conventions lens above all.
- a genuine one-off → none.

**Then record what you applied**, so the next review recalls it:

```sh
<oracle> remedy record <path> --class <handle> --finding <what> --fix <what you did> \
  --route <check|criterion|lens|none> [--artefact <ref>]
```

`--artefact` names the prevention home — the `.speccle/checks/` or `.speccle/lenses/` path, or
the `SPEC.md` criterion id — and is required for every route but `none`. Record the remedies you
**applied** this run; a finding left for the human (§3 required one, so nothing was fixed) is
proposed in the summary, never recorded — the record holds enacted remedies, not intentions, the
same honesty §7 keeps for the verdict.

## 7. Calibrate — record the change **before** anything moves it

The review is the outer loop's eyes; the **calibration record** is its memory — one entry per
reviewed change, the evidence a **review threshold** earns a move on. Add this change to it now,
while the tree still holds the change set the panel reviewed. **§8 commits, and a commit moves
it** — record after that and the entry describes a change nobody reviewed.

The floor is known (§3) and the findings' outcome is known (§4). The one thing neither can
answer is the honest verdict — _did this change actually need a human?_ That answer is the
human's, and the record is worthless without it, so never invent it:

```sh
<oracle> calibrate record <path> --found-real <true|false> --needed-human <true|false> \
  --floor <the score §3 computed> [--base <the ref §2 settled>] [--escalated]
```

- `--found-real` — true when any lens returned a real finding this run; you know this.
- `--escalated` — include it only if the risk lens escalated the floor in §3.
- `--needed-human` — the human's honest call, whatever the floor said. With a human here to
  answer, ask once and record it; with none, print the command for them to run and stop. A
  threshold that rose on a guessed verdict is worse than one that never rose.
- `--base` / `--floor` — **the two that bind the entry to the change you actually reviewed.**
  `calibrate record` measures the floor itself, here, now — it has no memory of §3. By now the
  tree has moved: §5's fixes are in it, and a committed change set was never in it at all. So
  pass the same `--base` §2 settled on, so it measures the same change set, and `--floor` so it
  refuses if it did not.

**If it refuses, it is right and you are wrong.** The message names both scores: the change set
in front of it is not the one the panel reviewed. Do not retry without `--floor`, do not relax it
to the new score, and do not edit the record by hand — every one of those writes an entry whose
signals never fired on the change its verdict describes, and `calibrate report` cannot tell the
difference afterwards. Say so in the close, hand the human the command, and leave the record
short one honest entry rather than long one false one.

Then read the record back and fold its proposals into the close:

```sh
<oracle> calibrate report <path>
```

It names the signals that have never fired on a change that mattered, the signals that fired
on every change that needed a human, and the threshold the record would support. These are
**evidence, not instructions**: escalation is free, but only a human moves a weight or the
review threshold, and only on this evidence. Surface them so ignoring them is a choice — never
act on them here.

## 8. Land — commit what survived, push where it was asked for

Fixes that stay in the working tree are not fixed; they are a chore handed back to the human who
ran this. Land them.

**Nothing to land** — §3 required a human (so nothing was fixed), or every fix was reverted, or
the checks-gate is red now. Leave the tree alone and say so in §9. A red gate is never committed
around.

**Otherwise, one commit.** Not one per finding: §5 already bought revertibility where it counts,
and a commit per `nit` buys a log nobody reads. Stage only what the fixes touched — never `git
add -A`, which would sweep in work the panel never saw — and follow the repo's commit convention.
Write the message from what you did:

- a subject naming the change set fixed, not the tool that fixed it;
- a body listing each finding fixed, one line each: severity, `path:line`, and what it was;
- any finding **reverted** or **left for the human**, named as still open.

You are the only party that knows which fixes survived the gate, so do not ask the human to
supply a message you already have.

**Push only when the human named a pull request** (§2). That change is already on a branch, CI
already ran on it, and closing the loop is what they asked for — so push to the PR's branch and
say so. With no pull request there is no named place for the commit to go: commit and stop.

Push what you committed and nothing else: if the branch has diverged, **stop and say so** rather
than forcing, rebasing, or merging. That is the human's call, and their unpushed work is on the
other side of it.

Neither step asks permission. §9 reports what landed, and a commit is one revert away.

## 9. Summary — announce, never gate

Render one screen, in product voice. The human rules by reading it, not by being asked:

1. **The risk verdict** — `score` against `threshold`, the floor's fired signals with their
   evidence, any risk-lens escalation with its reason, and whether a human was required.
2. **Where the findings came from** — CI's posted review (with its age, and loudly if it was
   stale) or the local panel.
3. **Every finding** — its lens, `path:line`, severity, what and why, and its outcome:
   **fixed**, **reverted** (the checks-gate went red — say what failed), or **left for the
   human** (a human was required, so nothing was fixed).
4. **The proposed remedy** per finding (§6).
5. **The checks-gate now** — green or red, named.
6. **What landed** — the commit, and whether it was pushed and where; or why nothing was.

The summary is the only view most readers get, so it holds the same bar §4 set: each finding
opens with what breaks in plain words, and the mechanism follows. A `nit` or `minor` gets a
sentence or two — length here reads as importance, and prose that outruns its severity tells the
reader the wrong thing. Rewrite a lens's prose that misses this rather than passing it through:
the panel's job is finished only when a reader who did not write the change can act on it.

There is no approval gate. Below the threshold the fixes already landed and the human
reverts what the summary makes them regret; at or above it nothing was fixed and the findings
await the human. Either way the summary is the whole interaction — overruleable, never a
"proceed? y/n".
