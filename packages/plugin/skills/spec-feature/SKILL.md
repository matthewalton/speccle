---
name: spec-feature
description: Draft or amend a feature's markdown contract — SPEC.md, CONTEXT.md, AGENTS.md, decisions/ — from a plan or any raw input, lint it clean with the oracle, and announce the criteria, without writing any tests or code. Use when the user wants a spec drafted or amended but not yet implemented, wants acceptance criteria written for a behaviour, or says "spec this", "draft the criteria", "add a criterion to this slice".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# spec-feature

Produce the markdown contract — `SPEC.md`, `CONTEXT.md`, `AGENTS.md`, `decisions/` —
for one feature, and lint it clean. Stage 2 of the `feature` pipeline,
and complete on its own when the user wants a spec without an implementation. This
skill writes markdown only — tests and code are `implement-feature`'s job.

The shape of the contract is fixed by the convention, bundled beside this skill. Read
`${CLAUDE_SKILL_DIR}/references/convention.md` before drafting — it is the written
contract, and this skill only restates the parts drafts get wrong.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "statement", not
"title"; "body", not "notes"; "lint violation", not "error" or "warning"; "amend",
not "edit" or "update".

## 1. Start from a plan

In the pipeline, `plan-feature` hands you the route, the feature folder, the key, and
any key decisions it settled with the user — each marked agreed or defaulted.
Standalone, settle those the way `plan-feature` does — route on where the behaviour
lives, read every other `SPEC.md`'s frontmatter before picking a key, and put key
decisions the input leaves open to the user before drafting.
Record each settled decision by the routing rule below: spanning criteria → an ADR in
`decisions/`, about one behaviour → that criterion's body. No key decision lives only
in the conversation.
If the input is already a conventioned `SPEC.md`, adopt it as-is. Do not "improve"
the criteria; the human already owns them.

## 2. Draft (new) or amend the contract

**New route** — scaffold the convention's shape: `SPEC.md`, `CONTEXT.md`, and
`AGENTS.md` at the feature root, `decisions/` when the first cross-criterion choice
lands. The parts worth restating because they are where drafts go wrong:

- **A statement is one testable clause.** If you cannot picture the single assertion
  that fails when it breaks, it is not one criterion. "Tax rounds half-up and the
  basket rejects over 100 items" is two criteria wearing one heading.
- **Ids are names, not order.** A new criterion takes the next never-used number under
  its key. Never renumber, never reuse — deleting `[CHECKOUT-2]` retires that number.
- **The body is free and never linted.** Rationale, edge cases, worked examples.
  Prefer a worked number over an adjective — and make it one the reader cannot
  misread: "three line items of £1.99 at 20% → £1.20 tax; taxing the £5.97 basket
  total would give £1.19" beats "3 × £1.99 → £1.20", which silently depends on
  whether that is one line item or three.
- **The routing rule.** About a word → `CONTEXT.md`, a glossary only — every term
  gets an _Avoid_ line naming the synonyms the feature will not use.
  About one behaviour → that criterion's body. A choice spanning criteria → an ADR in
  `decisions/`.
- **`AGENTS.md` states how to work the slice**, not what it does: how to run its
  tests, and where the contract lives. Behaviour stays in `SPEC.md` — duplicating it
  here is drift waiting to happen.

`SPEC.md`, `CONTEXT.md`, and `AGENTS.md` are the floor, even for a tiny feature;
`decisions/` appears with the first decision.

**Amend route** — the contract already exists; change it in place, never re-scaffold:

- **New criteria take the next never-used numbers** under the slice's existing key.
  Read the whole spec first — including the numbers no longer present; a deleted id
  stays retired.
- **A reworded statement keeps its id only if it promises the same behaviour**,
  sharpened. A statement that now promises something different is a retire-plus-draft:
  the old id goes, a new id arrives, and the old id's tests go with it (flag them for
  `implement-feature`).
- **Adopt the slice's language.** Read its `CONTEXT.md` and write new criteria in
  those terms; add a glossary entry only for a genuinely new term, with its _Avoid_
  line. Introducing a synonym for an existing term is the drift the glossary exists
  to prevent.
- **A change that spans criteria gets an ADR** in the slice's `decisions/`, same as
  on the new route.
- **Leave unrelated criteria untouched.** The diff of an amendment reads as the
  request: statements the request did not mention do not change.

## 3. Lint until clean

Resolve the oracle once, in this order, and reuse what works:

1. `speccle-oracle` on `PATH` — the normal case; Speccle's install links it there.
2. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24
   executes TypeScript directly, so no build is needed:
   `node <speccle-repo>/packages/oracle/src/cli.ts`.

If neither resolves, point the user at the install steps in Speccle's README and stop.
Do not hand-check the convention in the oracle's place: a spec that has not been
linted has not been linted, and claiming otherwise is the one thing this workflow
cannot survive.

```sh
<oracle> lint <feature-folder>
```

Fix and re-run until it reports clean. Exit `0` clean, `1` violations, `2` usage
error. `--json` gives `{ root, files, violations, clean }` with each violation
carrying `rule`, `file`, `line`, `message` — parse that rather than scraping the
human output.

Quality violations (`weasel-wording`, `compound-criterion`, `unmeasurable`) judge the
heading statement only. When one fires, rewrite the statement — do not move the
offending words down into the body to dodge the rule. A `compound-criterion` usually
means you owe the spec a second criterion, not a shorter sentence.

`unmeasurable` does not police vocabulary — any domain verb passes ("a refund
**credits** the customer…"). It fires only on a statement that asserts nothing: a
vacuous predicate ("refunds **are handled**") or a bare property ("the dashboard **is
beautiful**"). Say what is observably true instead; the rule is telling you the
criterion has no outcome to test, not that it dislikes your wording.

The rules are fixed and unconfigurable, and there is one severity: a spec lints clean
or it does not.

## 4. Announce the criteria — and keep going

Show the criteria — ids and statements; on the amend route, also each id retired and
why. Then proceed: in the pipeline, into `implement-feature`; standalone, to the
hand-back. Do not ask for approval and do not wait — the human owns the criteria, but
that ownership is exercised in the spec summary (or by interrupting now), not at a
blocking pre-approval.

If the human does interject — now or at any point — treat "looks good, and also…" as
a change request: amend the spec, re-lint, announce again.

When the input was already a conventioned `SPEC.md` adopted unchanged, there is
nothing new to announce; say you adopted it and move on.

Standalone, hand back with the **spec summary**: every criterion drafted, amended, or
retired, ids and statements; every key decision recorded, flagging each one that was
defaulted rather than agreed — and say what the contract does not yet have: tests and
code are `implement-feature`'s job, and nothing is claimed until it runs.
