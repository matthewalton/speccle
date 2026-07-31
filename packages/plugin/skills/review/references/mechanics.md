<!-- Generated from docs/review-mechanics.md by scripts/sync-plugin-references.mjs — do not edit.
     Edit the source and run `pnpm sync:plugin-refs`. -->

# Review mechanics

The machinery the two outer-loop skills share. `review` fans a panel of lenses over the pending
change; `address` acts on the findings CI already posted on a pull request. Where they differ is
where the findings come from and whether the commit gets pushed — everything they do with a
finding in between is identical, and it lives here.

The skill that sent you here settles three things before any of this runs, and everything below
assumes them:

- **the change set** — the files and the diff, and the base ref if there is one;
- **where the findings came from** — its own lens panel, or a review CI posted;
- **whether landing pushes** — `review` never does, `address` always does.

## Vocabulary and posture

Speccle's words are fixed and mandatory: "change set", not "diff" or "PR"; "lens", not "reviewer"
or "rule"; "finding", not "issue" or "comment"; "remedy", not "fix" alone; "risk score", "review
threshold", "floor"; "escalate", never "de-escalate".

The posture is **announce, never gate**. Below the threshold the fixes just land and the summary
reports them. There is no "apply? y/n" anywhere in either skill.

## Resolving the oracle

Once, in this order, and reuse what works:

1. `<repo-root>/node_modules/.bin/speccle` — the repo's own pinned copy. A devDependency is never
   on `PATH` in this shell, so test for the file; in a monorepo check the package you are working
   in as well as the root. It wins over a global install: the pin is a committed choice, and rules
   change between versions.
2. `speccle` on `PATH` — a global install.
3. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24 executes TypeScript
   directly: `node <speccle-repo>/packages/oracle/src/cli.ts`.

If none resolves, point the user at the install steps in Speccle's README and stop. If
`.speccle/lenses/` is missing, the repo was never initialized for review — offer `speccle init`
and stop.

`<oracle>` below means whatever this resolved to.

## The risk gate — authority, before any fixing

Fix authority is not a global setting; it depends on the change. Decide it first, because it
decides whether anything may be fixed at all.

```sh
<oracle> risk <path> --json [--base <ref>]     # --base whenever the change set is committed
```

This returns the deterministic **floor**: `score`, `threshold`, `humanRequired`, and the
spec-aware `signals` that fired, each with its evidence. Then apply the **risk lens**
(`.speccle/lenses/risk.md`) yourself: read the diff for the consequential change no signal could
see, and emit its one escalation decision. The lens may **raise** the floor or require a human
outright; it may **never lower** either. A concern that the floor is too high goes in the summary
for the human — you do not act on it.

The verdict a human is required when **any** of these holds: `risk.humanRequired` is true, the
risk lens set `requireHuman`, or `score + raiseFloorBy ≥ threshold`.

- **Below the threshold, no escalation** → you may fix unasked.
- **At or above, or the lens escalated** → still report every finding, but **fix nothing**; a
  human is required.

Both the computed floor and any escalation must be legible in the summary — a risk verdict with
no visible reasoning is not auditable. Keep the `score` this returns: the calibration record is
written against it, and this is the only moment the floor is measured on the change as it was
reviewed.

## Fixing — only with authority, and never without the checks-gate

If the risk gate said a human is required, **fix nothing**: carry every finding through to
remedy routing, and report it unfixed in the summary.

Otherwise fix each finding, smallest change first, and guard every one:

1. Apply the fix the finding names.
2. **Re-run the checks-gate** — resolve the same oracle and run `<oracle> lint` on any governed
   slice the fix touched, `<oracle> claims <root> --json`, `<oracle> verify <root>` (the
   cross-file invariants), and the project's own test suite.
3. **Green** — keep the fix. **Red because of this fix** — **revert it, do not salvage**: restore
   the file to its pre-fix state and carry the finding forward as unfixed. A fix that cannot pass
   the gate is the human's call, not a thing to patch around. Which reds are this fix's is the
   paragraph below, and it is not "all of them".

**A fix is judged by what it touched.** A red the fix did not cause is not the fix's red. That
only ever bites on `claims`, so read its report rather than its exit code: a change set is
routinely mid-slice — criteria specced and not yet built — and `claims` goes red on that before
you have fixed anything, which would revert every fix for a reason that has nothing to do with
any of them. Of the fix just applied, ask only:

- every criterion whose defending tests the fix touched is still `claimed`;
- no `unknownClaims` entry names a test the fix touched.

A fix that leaves a criterion it was defending undefended, or that renames a test into a claim on
an id no spec declares, has broken something it was holding. Everything else the report holds
describes the change set you arrived at — carry it to the summary, never to the revert decision.

The other three checks stay absolute: `lint` is already scoped to the slice the fix touched,
`verify` to the change set, and a red suite is worth stopping on whoever caused it. Red on any of
them means revert.

Batch sensibly, but keep each fix independently revertible — a fix you cannot back out on its own
is one you cannot safely apply. Revertibility is a property of how you apply and gate them, not of
how they are recorded: landing writes the survivors as **one** commit.

Keep, per fix, what it was and what happened to it. The commit message is written from that, and
nothing else knows which fixes survived the gate.

## Routing each finding to a remedy

For every finding — fixed, reverted, or left for the human — name the durable artefact that stops
the class recurring, routed on **what the finding is**, never on a count, the same posture
`strengthen` takes to a surviving mutant. The **remedy record** is the meta loop's memory of that
routing: consult it before deriving, add to it after applying.

**Recall first — answer a repeat the way you answered it before.** Give the finding a short,
stable class handle (kebab-case, e.g. `missing-model-roundtrip-test`) and ask the record:

```sh
<oracle> remedy recall <path> --class <handle>
```

A hit is the known-correct remedy — reuse its route and artefact rather than re-deriving, so the
same finding gets the same answer. A miss means route it fresh:

- a deterministic, cross-file invariant → an `oracle verify` check in `.speccle/checks/`.
- behaviour a criterion should own → a new acceptance criterion, and its tagged test, in the
  owning `SPEC.md`.
- a dimension a lens missed or stated too weakly → sharpen the lens in `.speccle/lenses/`, the
  house-conventions lens above all.
- a genuine one-off → none.

**Then record what you applied**, so the next review recalls it:

```sh
<oracle> remedy record <path> --class <handle> --finding <what> --fix <what you did> \
  --route <check|criterion|lens|none> [--artefact <ref>]
```

`--artefact` names the prevention home — the `.speccle/checks/` or `.speccle/lenses/` path, or the
`SPEC.md` criterion id — and is required for every route but `none`. Record the remedies you
**applied** this run; a finding left for the human (the risk gate required one, so nothing was
fixed) is proposed in the summary, never recorded — the record holds enacted remedies, not
intentions, the same honesty the calibration verdict keeps.

## Calibration — record the change **before** anything moves it

The review is the outer loop's eyes; the **calibration record** is its memory — one entry per
reviewed change, the evidence a **review threshold** earns a move on. Add this change to it now,
while the tree still holds the change set that was reviewed. **Landing commits, and a commit moves
it** — record after that and the entry describes a change nobody reviewed.

The floor is known (the risk gate) and the findings' outcome is known. The one thing neither can
answer is the honest verdict — _did this change actually need a human?_ That answer is the
human's, and the record is worthless without it, so never invent it:

```sh
<oracle> calibrate record <path> --found-real <true|false> --needed-human <true|false> \
  --floor <the score the risk gate computed> [--base <the settled ref>] [--escalated]
```

- `--found-real` — true when the change set had a real finding on it this run; you know this.
- `--escalated` — include it only if the risk lens escalated the floor.
- `--needed-human` — the human's honest call, whatever the floor said. With a human here to
  answer, ask once and record it; with none, print the command for them to run and stop. A
  threshold that rose on a guessed verdict is worse than one that never rose.
- `--base` / `--floor` — **the two that bind the entry to the change actually reviewed.**
  `calibrate record` measures the floor itself, here, now — it has no memory of the earlier run.
  By now the tree has moved: the fixes are in it, and a committed change set was never in it at
  all. So pass the same `--base` that was settled, so it measures the same change set, and
  `--floor` so it refuses if it did not.

**If it refuses, it is right and you are wrong.** The message names both scores: the change set in
front of it is not the one that was reviewed. Do not retry without `--floor`, do not relax it to
the new score, and do not edit the record by hand — every one of those writes an entry whose
signals never fired on the change its verdict describes, and `calibrate report` cannot tell the
difference afterwards. Say so in the close, hand the human the command, and leave the record short
one honest entry rather than long one false one.

Then read the record back and fold its proposals into the close:

```sh
<oracle> calibrate report <path>
```

It names the signals that have never fired on a change that mattered, the signals that fired on
every change that needed a human, and the threshold the record would support. These are
**evidence, not instructions**: escalation is free, but only a human moves a weight or the review
threshold, and only on this evidence. Surface them so ignoring them is a choice — never act on
them here.

## Landing — commit what survived

Fixes that stay in the working tree are not fixed; they are a chore handed back to the human who
ran this. Land them.

**Nothing to land** — the risk gate required a human (so nothing was fixed), or every fix was
reverted, or the checks-gate is red on something a fix caused. Leave the tree alone and say so in
the summary. A red a fix caused is never committed around — but a red the change set arrived with
is not one, and does not hold back fixes that each passed their own gate.

**Otherwise, one commit.** Not one per finding: the fix loop already bought revertibility where it
counts, and a commit per `nit` buys a log nobody reads. Stage only what the fixes touched — never
`git add -A`, which would sweep in work no lens saw — and follow the repo's commit convention.
Write the message from what you did:

- a subject naming the change set fixed, not the tool that fixed it;
- a body listing each finding fixed, one line each: severity, `path:line`, and what it was;
- any finding **reverted** or **left for the human**, named as still open.

You are the only party that knows which fixes survived the gate, so do not ask the human to supply
a message you already have.

**Whether this commit is pushed is not decided here.** `review` never pushes — there is no named
place for the commit to go. `address` always does — the change is already on a pull request's
branch, and closing that loop is the whole reason it was called. The skill that sent you here says
which, and says it once.

When you do push, push what you committed and nothing else: if the branch has diverged, **stop and
say so** rather than forcing, rebasing, or merging. That is the human's call, and their unpushed
work is on the other side of it.

Neither step asks permission. The summary reports what landed, and a commit is one revert away.

## The summary — announce, never gate

Render one screen, in product voice. The human rules by reading it, not by being asked:

1. **The risk verdict** — `score` against `threshold`, the floor's fired signals with their
   evidence, any risk-lens escalation with its reason, and whether a human was required.
2. **Where the findings came from** — the local panel, or CI's posted review with its age.
3. **Every finding** — its lens, `path:line`, severity, what and why, and its outcome: **fixed**,
   **reverted** (the checks-gate went red — say what failed), or **left for the human** (a human
   was required, so nothing was fixed).
4. **The proposed remedy** per finding.
5. **The checks-gate now** — green or red, named; and separately, any red the change set arrived
   with, the criteria it leaves unclaimed above all. Narrowing the gate drops a false blame, not
   a true signal — say which of the two a red is.
6. **What landed** — the commit, and whether it was pushed and where; or why nothing was.

The summary is the only view most readers get, so it holds the bar every lens is held to: the
reader did not write this change. Each finding opens with **what breaks, in plain words**, and the
mechanism follows in the sentence after. A `nit` or `minor` gets a sentence or two — length here
reads as importance, and prose that outruns its severity tells the reader the wrong thing. Rewrite
a lens's prose that misses this rather than passing it through: the work is finished only when a
reader who did not write the change can act on it.

There is no approval gate. Below the threshold the fixes already landed and the human reverts what
the summary makes them regret; at or above it nothing was fixed and the findings await the human.
Either way the summary is the whole interaction — overruleable, never a "proceed? y/n".
