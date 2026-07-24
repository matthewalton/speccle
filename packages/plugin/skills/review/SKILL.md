---
name: review
description: Review a change set the way the outer loop does — fan a panel of lenses over the working diff, let `oracle risk` decide whether a human is needed, then below that threshold fix what the lenses find (re-running the checks-gate after each fix and reverting any that goes red) and above it report findings and stop, closing with an overruleable summary that proposes a remedy for each finding. Use when the user wants to review a branch or the pending change, asks to "review this", "review my changes", "run the lenses", find-and-fix issues before a PR, or check a change set for correctness, security, accessibility, architecture, performance, test-quality, or house-convention problems.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# review

The outer loop. Its unit is the **change set** — the branch or PR's pending change,
not a slice — which is why it is separate from `feature`. It fans a panel of **lenses**
over the working diff, and — gated by the change's **risk score** — either fixes what it
finds or reports and stops for a human. It generates feedback; it does not itself change
the inner loop.

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

Everything here runs over the same change set: the working tree's pending change against
its last commit. Read it once — `git status --porcelain --untracked-files=all` for the
files, `git diff HEAD` for the lines — and hand the changed files and their diff to every
lens. A finding must anchor to a **changed line**; a lens does not audit the whole repo.

If the working tree is clean, there is nothing to review — say so and stop.

## 3. Risk — the authority gate, before any fixing

Fix authority is not a global setting; it depends on the change. Decide it first, because
it decides whether the panel may fix at all.

```sh
<oracle> risk <path> --json
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
with no visible reasoning is not auditable.

## 4. The lens panel — fan out over the diff

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

## 5. Fix — only with authority, and never without the checks-gate

If §3 said a human is required, **fix nothing**; go to §6 and report.

Otherwise fix each finding, smallest change first, and guard every one:

1. Apply the fix the finding names.
2. **Re-run the checks-gate** — resolve the same oracle and run `<oracle> lint` on any
   governed slice the fix touched, `<oracle> claims <root>`, `<oracle> verify <root>` (the
   cross-file invariants), and the project's own test suite.
3. **Green** — keep the fix. **Red** — **revert it, do not salvage**: restore the file to its
   pre-fix state and carry the finding forward as unfixed. A fix that cannot pass the gate is
   the human's call, not a thing to patch around.

Batch sensibly, but keep each fix independently revertible — a fix you cannot back out on
its own is one you cannot safely apply. The fixes join the working change set; `review` does
**not** commit — the change set is the human's or the inner loop's to land.

## 6. Route each finding to a remedy

For every finding — fixed, reverted, or left for the human — propose the durable artefact
that stops the class recurring, routed on **what the finding is**, never on a count, the
same posture `strengthen` takes to a surviving mutant:

- a deterministic, cross-file invariant → an `oracle verify` check in `.speccle/checks/`.
- behaviour a criterion should own → a new acceptance criterion, and its tagged test, in the
  owning `SPEC.md`.
- a dimension a lens missed or stated too weakly → sharpen the lens in `.speccle/lenses/`,
  the house-conventions lens above all.
- a genuine one-off → none.

This run **proposes** the remedy in the summary; recording it durably and consulting it to
answer a repeat finding the same way is the meta loop's job, not this skill's.

## 7. Summary — announce, never gate

Render one screen, in product voice. The human rules by reading it, not by being asked:

1. **The risk verdict** — `score` against `threshold`, the floor's fired signals with their
   evidence, any risk-lens escalation with its reason, and whether a human was required.
2. **Every finding** — its lens, `path:line`, severity, what and why, and its outcome:
   **fixed**, **reverted** (the checks-gate went red — say what failed), or **left for the
   human** (a human was required, so nothing was fixed).
3. **The proposed remedy** per finding (§6).
4. **The checks-gate now** — green or red, named.

There is no approval gate. Below the threshold the fixes already landed and the human
reverts what the summary makes them regret; at or above it nothing was fixed and the findings
await the human. Either way the summary is the whole interaction — overruleable, never a
"proceed? y/n".
