---
name: implement-feature
description: Build a feature as a vertical slice — draft its SPEC.md and CONTEXT.md from any input, lint them clean, pause for the human to ratify the criteria, then write token-tagged tests and the code that makes them green. Use when the user wants to build, implement, or spec a new feature, hands over a ticket or prose description to turn into a slice, or says "speccle this", "implement this feature", "make a slice for this".
---

# implement-feature

Turn a feature description — in whatever form it arrives — into a vertical slice: a
folder holding `SPEC.md`, `CONTEXT.md`, and the tagged tests and code that satisfy them.

The shape of that folder is fixed by [the convention](https://github.com/matthewalton/speccle/blob/main/docs/convention.md).
The words for talking about it are fixed by [CONTEXT.md](https://github.com/matthewalton/speccle/blob/main/CONTEXT.md) — say
"criterion id", not "tag"; "lint violation", not "error". Read both before drafting.

**This skill does not measure oracle strength.** A slice can finish here well-specified
and weakly defended; closing that gap is `strengthen`'s job, on its own cadence
([ADR-0006](https://github.com/matthewalton/speccle/blob/main/docs/adr/0006-implement-feature-pauses-for-ratification.md)).

## 1. Take the input as it comes

Prose, a ticket, a scratch file, a conversation, or a `SPEC.md` someone already wrote to
the convention. Never send the user away to reformat something first.

Settle two things before drafting, asking only if you cannot infer them:

- **Where the feature folder goes.** Match the project's existing layout. If other
  feature folders exist, sit beside them.
- **The feature key.** `[A-Z][A-Z0-9]{1,9}`, unique across the repo. Check for
  collisions by reading the frontmatter of every other `SPEC.md` — `oracle lint` will
  catch a clash, but guessing again after a lint failure wastes a cycle.

If the input is already a conventioned `SPEC.md`, adopt it as-is. Do not "improve" the
criteria; the human already owns them.

## 2. Draft SPEC.md and CONTEXT.md

Follow the convention exactly. The parts worth restating because they are where drafts
go wrong:

- **A statement is one testable clause.** If you cannot picture the single assertion
  that fails when it breaks, it is not one criterion. "Tax rounds half-up and the basket
  rejects over 100 items" is two criteria wearing one heading.
- **Ids are names, not order.** A new criterion takes the next never-used number under
  its key. Never renumber, never reuse — deleting `[CHECKOUT-2]` retires that number.
- **The body is free and never linted.** Rationale, edge cases, worked examples. Prefer
  a worked number over an adjective — and make it one the reader cannot misread: "three
  line items of £1.99 at 20% → £1.20 tax; taxing the £5.97 basket total would give
  £1.19" beats "3 × £1.99 → £1.20", which silently depends on whether that is one line
  item or three.
- **The `CONTEXT.md` boundary.** About a word, or a choice spanning criteria →
  `CONTEXT.md`. About one behaviour → that criterion's body. Every term gets an _Avoid_
  line naming the synonyms the feature will not use
  ([ADR-0005](https://github.com/matthewalton/speccle/blob/main/docs/adr/0005-each-feature-carries-its-own-context-md.md)).

Two files per feature is the floor, even for a tiny one.

## 3. Lint until clean

Resolve the oracle once, in this order, and reuse what works:

1. `speccle-oracle` on `PATH` — the normal case; Speccle's install links it there.
2. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24 executes
   TypeScript directly, so no build is needed:
   `node <speccle-repo>/packages/oracle/src/cli.ts`.

If neither resolves, point the user at the install steps in Speccle's README and stop.
Do not hand-check the convention in the oracle's place: a spec that has not been linted
has not been linted, and claiming otherwise is the one thing this workflow cannot
survive.

```sh
<oracle> lint <feature-folder>
```

Fix and re-run until it reports clean. Exit `0` clean, `1` violations, `2` usage error.
`--json` gives `{ root, files, violations, clean }` with each violation carrying
`rule`, `file`, `line`, `message` — parse that rather than scraping the human output.

Quality violations (`weasel-wording`, `compound-criterion`, `unmeasurable`) judge the
heading statement only. When one fires, rewrite the statement — do not move the offending
words down into the body to dodge the rule. A `compound-criterion` usually means you owe
the spec a second criterion, not a shorter sentence.

`unmeasurable` does not police vocabulary — any domain verb passes ("a refund **credits**
the customer…"). It fires only on a statement that asserts nothing: a vacuous predicate
("refunds **are handled**") or a bare property ("the dashboard **is beautiful**"). Say
what is observably true instead; the rule is telling you the criterion has no outcome to
test, not that it dislikes your wording.

The rules are fixed and unconfigurable, and there is one severity: a spec lints clean or
it does not ([ADR-0007](https://github.com/matthewalton/speccle/blob/main/docs/adr/0007-lint-rules-are-fixed-heuristics.md)).

## 4. The ratify pause — stop here

**A hard stop. Write no test and no code until the human answers.**

Show the criteria — ids and statements — and ask for approval. This pause is where human
ownership of the criteria lives; it is the reason the skill exists in this order. Treat
"looks good, and also…" as a change request: amend the spec, re-lint, ask again.

Skip the pause only when the input was already a conventioned `SPEC.md` that you adopted
unchanged. Drafting anything means pausing.

## 5. Implement the slice, one criterion at a time

Tests first, then the code that makes them pass — and **never more than one criterion at
a time**. Your instinct will be to build a layer at a time: every criterion's parsing,
then every criterion's calculation, then every criterion's persistence. Resist it. A
feature built that way does not execute until the last layer lands, and by then the
mistake is expensive ([ADR-0013](https://github.com/matthewalton/speccle/blob/main/docs/adr/0013-implement-feature-traces-one-criterion-end-to-end-first.md)).

### Fire the tracer criterion first

Pick the criterion whose passing test exercises the thinnest complete path through every
layer the feature touches — entry to exit, nothing stubbed. Choose it for **path length,
not importance**: the plainest success case, the one carrying the least logic. An edge
case or a rejection is never the tracer; it short-circuits the very layers it was meant to
prove. `[CHECKOUT-1] Tax rounds half-up per line item` traces the path;
`[CHECKOUT-3] Checkout rejects a basket of more than 100 line items` throws before
reaching it.

Make it green. Then say so: name the criterion, and name the layers its test now runs
through. Do not stop for approval — the green test _is_ the feedback. The ratify pause is
this skill's only hard stop.

When a feature has one layer — a pure function, a formatter — there is no path to trace.
The first criterion is the tracer, nothing special happens, and you should not dress it up
as though something did.

### Then thicken

Take the remaining criteria in document order, one at a time, each written against a
skeleton that already runs. The suite is green at every criterion boundary — if it is not,
finish that criterion before starting the next.

If a criterion cannot be made green without dragging two others in with it, stop and look
at the spec. That is a compound criterion that lint let through, and finding it now is
worth more than the detour costs.

### Tagging tests

A test claims a criterion when the `[KEY-n]` token appears in its **full concatenated
name** — enclosing `describe` titles count. One `describe('[CHECKOUT-1] tax rounding', …)`
claims every test nested inside it, which is the idiom to reach for.

```ts
describe("[CHECKOUT-1] tax rounding", () => {
  it("rounds each line's tax half-up before summing", () => {
    const basket = [line("a", 199), line("b", 199), line("c", 199)];
    expect(checkout(basket, 0.2).tax).toBe(120);
  });
});
```

Write tests that would fail if the behaviour broke, not tests that merely execute the
code. Reach for the criterion body's edge cases — they are there because someone thought
the naïve implementation would miss them.

## 6. Confirm done

Done means all four, verified rather than assumed:

1. The feature folder exists, holding `SPEC.md` and `CONTEXT.md`.
2. `<oracle> lint <feature-folder>` exits `0`.
3. Every criterion id in `SPEC.md` appears in at least one full test name.
4. The test suite is green.

For (3), run the suite with a JSON reporter (`vitest run --reporter=json`) and check each
id from the spec against the concatenated test names. An id nobody claims is an
unimplemented criterion — go back to phase 5. Do not report done on a spec with an
unclaimed criterion.

There is no oracle-strength check here, deliberately. Say so when you hand back: the
slice is green, and how well it is _defended_ is a question `strengthen` answers.
