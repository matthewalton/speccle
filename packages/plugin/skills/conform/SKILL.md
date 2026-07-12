---
name: conform
description: Bring already-governed feature folders up to the current convention after it changes — sweep every SPEC.md, diagnose each slice's drift against the convention (folder shape, missing contract files, decisions content in CONTEXT.md, lint violations), announce the drift report, then apply form-only fixes with the suite green throughout, ending with a spec summary. Use when the user upgrades Speccle or its convention and wants existing features updated, asks to bring features up to convention or check for drift, or says "conform this", "conform the features", "the convention changed".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# conform

Bring slices that are **already governed** up to the convention as it stands today.
The convention moves — a folder shape tightens, a new contract file becomes the floor,
a lint rule sharpens — and a feature scaffolded correctly last month drifts without a
line of it changing.
Conform is the remedy: form changes only, behaviour never.

Two neighbours this skill is not. Ungoverned code — no `SPEC.md` — is a **carve**
(`carve-feature`); changing what a criterion _means_ is an **amend** (`spec-feature`).
A request that mixes conforming with either is two passes, never one.

The shape being conformed _to_ is fixed by the convention, bundled beside this skill.
Read `${CLAUDE_SKILL_DIR}/references/convention.md` before diagnosing anything — the
checklist below is applied against it, not from memory.

Speccle's words are fixed and mandatory: "conform", not "migrate" or "upgrade";
"criterion id", not "tag"; "lint violation", not "error"; "spec summary", not
"approval gate".

## 1. Find the governed slices

Given a project root, find every `SPEC.md` under it by the convention's discovery
rules — never entering `node_modules`, `dist`, `fixtures`, `__fixtures__`, or
dot-directories — and conform each. Given a single feature folder, conform just it.

No `SPEC.md` found means there is nothing governed to conform: the work is a carve or
a new feature. Say so and stop.

## 2. Diagnose each slice against the bundled convention

Resolve the oracle once, in this order, and reuse what works:

1. `speccle-oracle` on `PATH` — the normal case; Speccle's install links it there.
2. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24
   executes TypeScript directly, so no build is needed:
   `node <speccle-repo>/packages/oracle/src/cli.ts`.

If neither resolves, point the user at the install steps in Speccle's README and
stop. Do not hand-check the spec rules in the oracle's place.

Then walk the checklist for each slice — every item is what the convention requires
today, and the bundled copy is the authority:

- **The folder is named for the feature.** An unnamed catch-all (`src/`, `lib/`)
  flags, even for a project's only feature.
- **The markdown contract is complete at the root**: `SPEC.md`, `CONTEXT.md`,
  `AGENTS.md`; `decisions/` whenever the feature has a decision to hold.
- **All code and tests sit one level down in `src/`**, tests beside the code they
  defend, and the root holds the markdown contract and nothing else.
- **`CONTEXT.md` is a glossary only.** Decisions content — a Decisions section,
  mini-ADR bullets, any recorded choice spanning criteria — belongs in `decisions/`
  as numbered ADR files.
- **`<oracle> lint <feature-folder>` exits 0.** Parse `--json` rather than scraping
  the human output. A rule that did not exist when the spec was written flags here
  like any other lint violation.
- **Every criterion id appears in at least one full test name.** An unclaimed
  criterion is a **finding**, not a fix — writing tests is `carve-feature` and
  `strengthen` territory, and conform names the gap rather than filling it.

## 3. Announce the drift report — and keep going

Per slice: each drift item found and the fix planned for it; slices with no drift
listed as clean. Then proceed straight into phase 4 without waiting — a misjudged fix
is corrected by interrupt, like any other announcement.

## 4. Apply the fixes, suite green at every boundary

Run the project's suite before touching anything. Conform never starts on red without
saying so — a pre-existing failure is the user's to rule on, not yours to absorb into
the diff.

Per slice, in this order:

- **Structural moves first.** Code and tests into `src/`; a catch-all folder renamed
  for its feature. Fix the moved files' own imports, everything that imports them,
  and the runner and tsconfig include patterns — a pattern that no longer matches
  loses tests silently, so re-run the suite and check the test count, not just the
  colour.
- **Generate a missing `AGENTS.md`** from what the folder shows: what the slice does
  in a sentence or two, how to run its tests, where the contract lives. Facts about
  working the slice, never about its behaviour.
- **Split decisions content out of `CONTEXT.md`** into `decisions/0001-<slug>.md`
  onward, same form as any ADR. The original wording becomes the Decision; a "why"
  that was never recorded is stated as unrecorded, not invented.
- **Reword statements only as far as lint requires, meaning unchanged.** The fix for
  a quality violation on an old statement is naming what the code observably does —
  which usually means reading the code, not polishing the sentence. Ids are names:
  never renumbered, never reused. Re-run lint until the slice is clean.

## 5. Confirm done

Done means all four, verified rather than assumed:

1. `<oracle> lint` exits `0` for every slice swept.
2. The **whole project's** suite is green with the same test count as before the
   moves — moved test files are exactly the change that loses a sibling silently.
3. The diff shows markdown, file moves with their import and config fixes, and
   criterion-id tags in test names — nothing source-semantic. Check `git status` and
   `git diff` rather than asserting it; this is the invariant conform exists to keep.
4. Every drift item announced in phase 3 is either fixed or carried into the spec
   summary as a finding.

Hand back with the **spec summary**: per-slice changes; every reworded statement, old
and new side by side under its unchanged id, for the human to overrule; and the
findings — unclaimed criteria and anything suspicious met along the way — naming
`strengthen` as the natural next step where the claims look thin.
