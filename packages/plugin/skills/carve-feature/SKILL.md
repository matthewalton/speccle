---
name: carve-feature
description: Bring existing, ungoverned code under the convention without changing it — derive SPEC.md and CONTEXT.md from what the code observably does, lint them clean, announce the derived criteria and findings, then claim every criterion by tagging the tests that already defend it and writing tests for what nothing claims, ending with a spec summary the human rules on. Use when the user wants to retrofit a spec onto working code, govern an existing module, bring legacy code into a slice, or says "carve this", "carve it into a slice", "spec what this already does".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# carve-feature

Take a region of code that already works and make it a governed feature folder: the
markdown contract — `SPEC.md`, `CONTEXT.md`, `AGENTS.md`, `decisions/` — derived from
its observed behaviour, and every criterion claimed by a tagged test. The code's
behaviour does not change — a carve is a change of governance, not of code.

If the user is describing behaviour that does not exist yet, that is the `feature`
pipeline, not a carve. A request that mixes the two ("spec this up and fix the
rounding while you're in there") is a carve followed by governed work — never one
pass.

The shape of the folder is fixed by the convention, bundled beside this skill. Read
`${CLAUDE_SKILL_DIR}/references/convention.md` before deriving anything.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "statement", not
"title"; "carve", not "retrofit" or "migration"; "spec summary", not "approval gate".

**This skill does not measure oracle strength.** A carve can finish well-specified and
weakly defended; a fresh carve is `strengthen`'s natural next target, and saying so is
part of handing back.

## 1. Pick the carve boundary

The boundary is the directory that owns the code being carved; the markdown contract
lands at its root. A carve never moves or edits source files, so the boundary must
already have the convention's shape — where it does not, the fix is a **pre-carve
refactor** the user does before carving, under whatever safety net they trust. Stop
and show them exactly what is wrong; do not do it for them.

- **The boundary is named for the feature.** An unnamed catch-all (`src/`, `lib/`) is
  never a feature folder, even when it holds the project's only feature — renaming it
  is the pre-carve refactor case, not a valid boundary.
- **Source must already sit in the boundary's `src/`.** Source loose at the boundary
  root, or smeared across the tree, is the same case: show the user which files live
  where and what the shape should be.
- **Tests may live outside it** — a parallel `test/` tree is normal in existing
  projects. Tests are the one thing a carve does move: they land in `src/` beside the
  code in phase 6.

Settle the feature key as `plan-feature` does: `[A-Z][A-Z0-9]{1,9}`, unique across
the repo — read the frontmatter of every other `SPEC.md` before guessing.

If a conventioned `SPEC.md` already sits at the root, the criteria are already owned:
adopt them unchanged and go straight to phase 6 for whatever they leave unclaimed.

## 2. Derive the criteria from what is, not what should be

Read in this order, because it is the order of reliability:

1. **The existing tests** — executable claims about behaviour someone once cared about.
2. **The source** — for observable behaviour no test asserts.
3. **Docs and comments last** — they drift, and a carve documents the code, not the
   folklore around it.

Every criterion is one testable clause the code **verifiably does today**. If you
cannot point at the code that makes a statement true, it is not observed behaviour and
it does not go in the spec. Criteria describe the feature at its boundary — what a
caller can see — not one per function; a spec that mirrors the file listing is an
implementation inventory, not acceptance criteria.

**When something looks wrong, do not write the criterion you wish were true.** The
code's spec fails against the code — that is a broken carve. Do not quietly fix the
code either. Record it as a finding: what the code does, why it looks unintended, and
where. Findings are announced in phase 5 and ruled on by the human at the spec summary,
not by you.

## 3. Draft the markdown contract

Follow the convention exactly — the drafting pitfalls `spec-feature` restates
(one clause per statement, ids are names not order, the body is free) all apply
unchanged. `SPEC.md`, `CONTEXT.md`, and `AGENTS.md` are the floor, even for a small
carve; `decisions/` appears with the first cross-criterion choice the code turns out
to embody.

The carve-specific part is `CONTEXT.md`: adopt the language the code already uses.
The terms are the names in the source, and the _Avoid_ lines retire the synonyms the
codebase mixes — a carve is often the first time anyone writes down which of three
interchangeable names is canonical.
It is a glossary only: a choice the code embodies that spans criteria (a keying
strategy, a rounding policy) is an ADR in `decisions/`, recording what the code does
and whatever "why" survives.
In `AGENTS.md`, state how to work the slice — run its tests, find the contract — and
nothing about behaviour.

## 4. Lint until clean

Resolve the oracle once, in this order, and reuse what works:

1. `speccle-oracle` on `PATH` — the normal case; Speccle's install links it there.
2. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24 executes
   TypeScript directly, so no build is needed:
   `node <speccle-repo>/packages/oracle/src/cli.ts`.

If neither resolves, point the user at the install steps in Speccle's README and stop.
Do not hand-check the convention in the oracle's place.

```sh
<oracle> lint <feature-folder>
```

Fix and re-run until clean — exit `0` clean, `1` violations, `2` usage error; parse
`--json` rather than scraping the human output. When a quality violation fires on a
derived statement, rewrite the statement without changing what it observes: the fix for
"the parser handles bad input" is naming what the parser observably does with bad
input, which usually means going back to the code to look.

## 5. Announce the derivation — and keep going

Show two things, then proceed straight into phase 6 without waiting:

- **The criteria** — ids and statements, as `implement-feature` does. What the human
  will rule on later is more than wording: whether your reading of the code matches
  their intent.
- **The findings** — each behaviour you suspect is unintended. Spec what the code
  observably does, suspicious or not — a carved spec is honest before it is
  aspirational — and flag each finding here and again in the spec summary, where the
  human rules: **intended**, and its criterion stands, stating what the code does; or
  **a bug**, and the criterion comes out of the spec and the behaviour is recorded as
  future work in whatever tracker the project uses. A carve never fixes one.

If the human interjects — now or at any point — treat "looks good, and also…" as a
change request: amend, re-lint, announce again.

## 6. Claim every criterion, changing nothing

The carve's whole discipline in one check: when this phase ends, the diff shows test
files and the markdown contract — `SPEC.md`, `CONTEXT.md`, `AGENTS.md`, `decisions/` —
**nothing else**.

- **Tag the existing tests.** A test claims a criterion when the `[KEY-n]` token
  appears in its full concatenated name — renaming the enclosing `describe` is the
  idiom.
  Tag only tests that assert the criterion's behaviour, not every test that happens to
  execute the code. Tests that map to no criterion stay as they are — untagged is
  honest; do not delete or reword them.
- **Move outside tests into `src/`, beside the code they defend.** Colocation is the
  convention's point. Fix the moved files' own imports and confirm the runner still
  finds them — an include pattern that no longer matches loses tests silently.
- **Write tests for unclaimed criteria**, tagged the same way. They run against code
  that already works, so they pass on first run. **A new test that fails is a
  discovery, not a draft to iterate on**: either you misread the code — fix the
  statement, re-lint, and announce the change — or you found a bug — it comes out of
  the spec and into the tracker, like any phase-5 finding. The failing test is never a
  reason to touch the source.

There is no tracer criterion — the tracer proves a path connects, and a carve's path is
proven by the code already running.
Claim criteria in document order, suite green at every criterion boundary.

## 7. Confirm done

Done means all five, verified rather than assumed:

1. The feature folder is named for the feature and holds the markdown contract —
   `SPEC.md`, `CONTEXT.md`, `AGENTS.md` — with all code and tests in `src/`.
2. `<oracle> lint <feature-folder>` exits `0`.
3. Every criterion id appears in at least one full test name — run the suite with a
   JSON reporter and check each id against the concatenated names.
4. The **whole project's** suite is green, not just the carved folder's — moved test
   files are exactly the change that breaks a sibling.
5. The diff touches test files and the markdown contract only. Check `git status`
   and `git diff` rather than asserting it — this is the invariant the carve exists to
   keep, and it is the first thing to say when handing back.

Hand back with the **spec summary**: the derived criteria (ids and statements) and
every finding awaiting a ruling. The human rules each finding intended-or-bug here —
a criterion ruled a bug is reverted with its tests, and the behaviour goes to the
tracker.

Then say what done does not include: how well the new claims _defend_ the code is
`strengthen`'s question, and a fresh carve is its natural next target.
