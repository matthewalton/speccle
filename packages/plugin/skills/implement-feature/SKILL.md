---
name: implement-feature
description: Implement an already-specced slice — write token-tagged tests first and the code that makes them green, one criterion at a time, tracer criterion first on a new slice. Use when a linted SPEC.md exists and the user wants it implemented, wants tests and code for drafted criteria, or says "make the slice green", "implement the spec". For a feature that has no spec yet, the whole job — plan, spec, implement — is the feature skill.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# implement-feature

Write the tagged tests and the code that satisfy an existing, linted `SPEC.md` — one
criterion at a time, tests first. Stage 3 of the `feature` pipeline, and complete on
its own when the spec already exists — hand-written to the convention, or drafted
earlier by `spec-feature`.

In the pipeline this skill runs in its own subagent session: the linted spec and the
slice's docs are the whole brief — read them; there is no earlier conversation to
consult. The final message is the hand-back in §3.

**This skill starts from a spec.** Handed a feature with no conventioned `SPEC.md`,
say so and point at the `feature` pipeline (or `spec-feature` for the contract alone)
rather than drafting one here — drafting has its own skill, and an unlinted spec must
not reach this one. Verify the precondition rather than assuming it:
`<oracle> lint <feature-folder>` exits `0` (resolve the oracle as every Speccle skill
does: `speccle-oracle` on `PATH`, else
`node <speccle-repo>/packages/oracle/src/cli.ts`; if neither resolves, point at the
README's install steps and stop).

The folder shape and test-linking rules are fixed by the convention, bundled beside
this skill at `${CLAUDE_SKILL_DIR}/references/convention.md`.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "statement", not
"title"; "spec summary", not "approval gate".

**This skill does not measure oracle strength.** A slice can finish here
well-specified and weakly defended; closing that gap is `strengthen`'s job, on its
own cadence — the pipeline's checks-gate verifies lint, claims, and green tests, not
how hard the tests bite.

## 1. Scope the work

Everything this skill writes lands in the feature's `src/` — tests beside the code
they defend; the feature root stays pure markdown.

- **New slice** (no code in `src/` yet): every criterion is unimplemented; the tracer
  rule below applies.
- **Amended slice** (the spec changed over running code):
  implement only the criteria no test yet claims, in document order. There is **no
  tracer** — the slice's path already runs, so there is nothing to prove; the same
  reason a carve has none.
  A retired id takes its tests with it: delete them, and confirm the code they
  defended is either still promised by a live criterion or removed too.

Find the unclaimed criteria mechanically, not by eye:
`<oracle> claims <feature-folder>` joins every criterion to the test names that
carry its token — `unclaimed` lists the ids still owed a test, `unknownClaims` the
tokens pointing at no criterion (a retired id someone's test still claims). One
caveat, because the scan is static: only string-literal `describe`/`it`/`test`
titles count, so write the `[KEY-n]` token as literal text, never built up at
runtime.

## 2. Red-green, one criterion at a time

Tests first, then the code that makes them pass — and **never more than one criterion
at a time**. Write the criterion's tests, run them, and watch them fail before
writing any code: a test that has never failed proves nothing. Then make it green,
then move on. Your instinct will be to build a layer at a time: every criterion's
parsing, then every criterion's calculation, then every criterion's persistence.
Resist it. A feature built that way does not execute until the last layer lands, and
by then the mistake is expensive.

### Fire the tracer criterion first (new slice only)

Pick the criterion whose passing test exercises the thinnest complete path through
every layer the feature touches — entry to exit, nothing stubbed. Choose it for
**path length, not importance**: the plainest success case, the one carrying the
least logic. An edge case or a rejection is never the tracer; it short-circuits the
very layers it was meant to prove. "When a line item is taxed, tax rounds half-up"
traces the path; "When a basket exceeds 100 line items, checkout rejects it" throws
before reaching it.

Make it green. Then say so: name the criterion, and name the layers its test now runs
through. Do not stop for approval — the green test _is_ the feedback, and this skill
has no stops.

When a feature has one layer — a pure function, a formatter — there is no path to
trace. The first criterion is the tracer, nothing special happens, and you should not
dress it up as though something did.

### Then thicken

Take the remaining criteria in document order, one at a time, each written against a
skeleton that already runs. The suite is green at every criterion boundary — if it is
not, finish that criterion before starting the next.

If a criterion cannot be made green without dragging two others in with it, stop and
look at the spec. That is a compound criterion that lint let through, and finding it
now is worth more than the detour costs. Amending the spec mid-implement is
`spec-feature`'s §2 in miniature: next never-used ids, re-lint, announce the change.

### Tagging tests

A test claims a criterion when the `[KEY-n]` token appears in its **full concatenated
name** — enclosing `describe` titles count. One
`describe('[CHECKOUT-1] tax rounding', …)` claims every test nested inside it, which
is the idiom to reach for.

```ts
describe("[CHECKOUT-1] tax rounding", () => {
  it("rounds each line's tax half-up before summing", () => {
    const basket = [line("a", 199), line("b", 199), line("c", 199)];
    expect(checkout(basket, 0.2).tax).toBe(120);
  });
});
```

Write tests that would fail if the behaviour broke, not tests that merely execute the
code. Reach for the criterion body's edge cases — they are there because someone
thought the naïve implementation would miss them.

## 3. Confirm done

Done means all four, verified rather than assumed:

1. The feature folder is named for the feature and has the convention's shape:
   `SPEC.md`, `CONTEXT.md`, `AGENTS.md` at the root, code and tests in `src/`.
2. `<oracle> lint <feature-folder>` exits `0`.
3. `<oracle> claims <feature-folder>` exits `0` — every criterion claimed, and no
   test still claiming a retired id. An id nobody claims is an unimplemented
   criterion, so go back to §2.
4. The **whole project's** test suite is green, not just the slice's — on an amended
   slice, the pre-existing tests are exactly the ones a change breaks.

Do not report done on a spec with an unclaimed criterion.

Hand back by naming what went green: each criterion implemented this run, id and
statement. If the spec changed mid-run (a compound criterion found in §2), that is a
spec change and gets the **spec summary** treatment: list it for the human to rule
on.

There is no oracle-strength check here, deliberately. Say so when you hand back: the
slice is green, and how well it is _defended_ is a question `strengthen` answers, on
its own cadence.
