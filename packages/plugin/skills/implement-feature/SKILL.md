---
name: implement-feature
description: Implement exactly one criterion of an already-specced slice — write its token-tagged tests first, make them green, run the per-criterion checks-gate, and commit on green. On a slice with nothing built yet, that one criterion is the tracer. Use when a linted SPEC.md exists and the user wants the next criterion built, wants tests and code for a named criterion, or says "make the slice green", "implement the spec", "implement CHECKOUT-2". For a feature that has no spec yet, the whole job — plan, spec, implement — is the feature skill.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# implement-feature

Write the tagged tests and the code that satisfy **one criterion** of an existing, linted
`SPEC.md`, tests first — then gate and commit it. One criterion is the whole session: it is
already the unit of the spec, the unit a test claims, and the unit the red-green loop
iterates over, so it is the unit that bounds the work. A slice of eight criteria is eight
sessions and eight commits, not one session holding eight rounds of test output.

The slice's folder is the whole brief — `SPEC.md`, `CONTEXT.md`, `CLAUDE.md`, `decisions/`.
Read them. There is no earlier conversation to consult, and nothing that was not written
into the folder survived.

**This skill starts from a spec.** Handed a feature with no conventioned `SPEC.md`, say so
and point at the `feature` pipeline (or `spec-feature` for the contract alone) rather than
drafting one here — drafting has its own skill, and an unlinted spec must not reach this
one. Verify the precondition rather than assuming it: `<oracle> lint <feature-folder>` exits
`0` (resolve the oracle as every Speccle skill does: the repo's own
`<repo-root>/node_modules/.bin/speccle` first — a devDependency is never on `PATH`, so test
for the file — else `speccle` on `PATH`, else
`node <speccle-repo>/packages/oracle/src/cli.ts`; if none resolves, point at the README's
install steps and stop).

The folder shape and test-linking rules are fixed by the convention, bundled beside this
skill at `${CLAUDE_SKILL_DIR}/references/convention.md`.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "statement", not
"title"; "spec summary", not "approval gate".

**This skill does not measure oracle strength.** A slice can finish here well-specified and
weakly defended; closing that gap is `strengthen`'s job, on its own cadence — the gate below
checks lint, claims, the repo's own checks and green tests, not how hard the tests bite.

## 1. Take exactly one criterion

If a criterion was named for you, that is the one. Otherwise ask the folder rather than
choosing by eye:

```sh
<oracle> next <feature-folder> --json
```

`criterion` is the first unclaimed criterion in **document order** — the order the spec
reads, which is the order its criteria build on each other in. Criterion ids are names, not
order, so on an amended slice a low-numbered criterion can sit last in the document; the
document wins. `tracerOwed` says whether anything is built yet.

Two answers that are not "implement this criterion":

- **`stale-claims`** — a test name claims an id no criterion declares, usually a retired one.
  That is a lie about what is defended and it comes first: delete those tests, confirm the
  code they defended is either still promised by a live criterion or removed too, and stop
  there. The next session takes a criterion.
- **`spec`** — the contract is unfinished or does not lint. Stop and say so; drafting is
  `spec-feature`'s job.

Everything you write lands in the feature's `src/` — tests beside the code they defend; the
feature root stays pure markdown.

Keep `src/` flat while it holds **ten files or fewer** directly (code and tests together —
count the entries, don't judge the crowding). The file that would make it eleven triggers
grouping: gather the code into shallow, purpose-named subfolders — one level, tests still
beside the code they defend at that depth — and the same ten-file limit then applies inside
each subfolder. Before nesting, ask whether the pile is really one slice: a `src/` that has
grown two clearly separate concerns is usually two slices, and splitting into a sibling
folder beats burying the seam under subfolders. Nest when it is genuinely one cohesive
feature that just carries many files.

## 2. Red-green that one criterion

Write the criterion's tests, run them, and watch them **fail** before writing any code: a
test that has never failed proves nothing. Then make it green. Then stop — the next criterion
is the next session's, and reaching for it is how the session gets fat again.

Your instinct will be to build a layer at a time: this criterion's parsing, then the layer
below for every criterion you can see coming. Resist it. Write only what this criterion's
tests demand.

### When a tracer is owed — nothing is built yet

`tracerOwed` true means no criterion in this slice is claimed, so the slice has no running
path and this session's criterion is the **tracer**. That choice is judgement, not
derivation, so it is yours: pick the criterion whose passing test exercises the thinnest
complete path through every layer the feature touches — entry to exit, nothing stubbed.
Choose for **path length, not importance**: the plainest success case, the one carrying the
least logic. An edge case or a rejection is never the tracer; it short-circuits the very
layers it was meant to prove. "When a line item is taxed, tax rounds half-up" traces the
path; "When a basket exceeds 100 line items, checkout rejects it" throws before reaching it.

Say which criterion you picked and which layers its test now runs through — and say it even
if that is not the criterion `next` named, because the folder cannot make this call.

When a feature has one layer — a pure function, a formatter — there is no path to trace. The
first criterion is the tracer, nothing special happens, and you should not dress it up as
though something did.

### If the criterion will not come green alone

If it cannot be made green without dragging two others in with it, stop and look at the spec.
That is a compound criterion lint let through, and finding it now is worth more than the
detour costs. Amend the spec — next never-used ids, re-lint, announce the change — then
commit that and stop. The new ids are the next session's work; you do not have to carry a
spec change through anything else.

**When an edit lands outside the feature folder, record it in the slice's `CLAUDE.md`** under
the boundary list — the file touched and which slice owns it. That list is the one part of
the contract nothing else derives, and it goes stale silently: the next agent finds the model
but not the schema entry it has to register. Add the line as you make the edit, not at the
end.

### Tagging tests

A test claims a criterion when the `[KEY-n]` token appears in its **full concatenated name** —
enclosing `describe` titles count. One `describe('[CHECKOUT-1] tax rounding', …)` claims
every test nested inside it, which is the idiom to reach for. The scan is static: only
string-literal `describe`/`it`/`test` titles count, so write the token as literal text, never
built up at runtime.

```ts
describe("[CHECKOUT-1] tax rounding", () => {
  it("rounds each line's tax half-up before summing", () => {
    const basket = [line("a", 199), line("b", 199), line("c", 199)];
    expect(checkout(basket, 0.2).tax).toBe(120);
  });
});
```

Write tests that would fail if the behaviour broke, not tests that merely execute the code.
Reach for the criterion body's edge cases — they are there because someone thought the naïve
implementation would miss them.

## 3. The per-criterion checks-gate

Four checks, deterministic, no judgement:

1. `<oracle> lint <feature-folder>` — exit `0`.
2. `<oracle> claims <feature-folder> --json` — **this** criterion's `claimed` is `true`, and
   `unknownClaims` is empty. Read those two fields; do **not** gate on the exit code. Mid-slice
   `claims` exits `1` because criteria you were never asked to build are still unclaimed, and
   that is correct — slice-wide claims are what the last session observes, not what this one
   asserts.
3. `<oracle> verify <repo-root> --json` — `clean` is `true`. Mind the path: this one takes the
   **repo root**, not the feature folder. The repo's checks live in `.speccle/checks/` at the
   root, and each is a predicate over the whole change set rather than over one slice, so
   pointed at a feature folder it would find no checks and pass vacuously. It reads the working
   tree's pending change, which at gate time is exactly this criterion's uncommitted edits.
4. The **whole project's** test suite — green, not just this slice's. On an amended slice the
   pre-existing tests are exactly the ones a change breaks.

A repo that has authored no checks has an empty `.speccle/checks/` — `speccle init` scaffolds
the directory with a README, and only `*.json` is a check — so `verify` reports `clean` with an
empty `checks` list and there is nothing to do. Where there are checks, this is the one gate the
repo itself wrote — a **breach** names an invariant the change set failed to hold, and the
report carries both the `message` saying what is missing and the `because` saying which finding
bought the check. Satisfy it the way it asks, usually by making the edit the check says a change
of this shape must come with.

A **malformed** check is not a breach and is not yours to red-green away: `verify` prints an
error naming the file and exits `2` with no report at all, because a check that silently does
nothing is worse than no check. That is the repo's configuration broken, not this criterion.
Stop, name the file, commit nothing.

Fix what fails and re-run. **A check that fails the same way twice stops the session**: show
the human what is stuck and commit nothing. There is nothing to hand back to — this session
is the implement agent — and a half-fixed criterion left uncommitted is exactly the state the
next session can re-derive, because `next` will name this same criterion again.

There is no oracle-strength measurement here. The heatmap is `strengthen`'s job, on its own
cadence, and this gate stays seconds cheap.

## 4. Commit on green, then stop

On a green gate, commit — no "commit? y/n": the pause is ceremony, and a commit is one revert
away. Stage the feature folder and only the files this criterion touched, and write the
message the repo's conventions ask for, **naming the criterion**: its id and what it promises.
The route no longer distinguishes one commit from another — every commit after the one that
introduced the slice amends a slice that already runs — so the criterion is what the message
carries. One commit per criterion, in document order, each with a green suite: the slice's
history comes to read as its spec.

Then close by saying, in a line or two:

- The criterion that went green — id and statement — and, if you picked the tracer, the layers
  its test runs through.
- Any spec change you made, as a **spec summary** for the human to rule on.
- What `<oracle> next <feature-folder>` now says: the next criterion, or that the slice is
  done. Every session ends naming the next command.

Do not report the slice done because your criterion is green. Whether every criterion is
claimed is a question `next` answers, and only after this commit lands.
