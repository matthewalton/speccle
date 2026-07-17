---
name: spec-feature
description: Draft or amend a feature's markdown contract — SPEC.md, CONTEXT.md, AGENTS.md, decisions/ — from a plan or any raw input, lint it clean with the oracle (product-voiced When/Then statements included), and hand back the criteria, without writing any tests or code. Use when the user wants a spec drafted or amended but not yet implemented, wants acceptance criteria written for a behaviour, or says "spec this", "draft the criteria", "add a criterion to this slice".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# spec-feature

Produce the markdown contract — `SPEC.md`, `CONTEXT.md`, `AGENTS.md`, `decisions/` —
for one feature, and lint it clean. Stage 2 of the `feature` pipeline, and complete
on its own when the user wants a spec without an implementation. This skill writes
markdown only — tests and code are `implement-feature`'s job.

In the pipeline this skill runs in its own subagent session: the hand-off in the
prompt and the feature folder on disk are everything — there is no planning
conversation to consult, and nobody to ask mid-run. The final message is the
hand-back.

The shape of the contract is fixed by the convention, bundled beside this skill. Read
`${CLAUDE_SKILL_DIR}/references/convention.md` before drafting — it is the written
contract, and this skill only restates the parts drafts get wrong.

Speccle's words are fixed and mandatory: "criterion id", not "tag"; "statement", not
"title"; "body", not "notes"; "lint violation", not "error" or "warning"; "amend",
not "edit" or "update".

## 1. Start from a plan

In the pipeline, the hand-off carries the route, the feature folder, the key, the
scope, and every key decision the plan settled — each marked agreed or defaulted, the
cross-criterion ones already captured as ADRs in the slice's `decisions/`, the
per-behaviour ones noted for a criterion body. Land those notes where they belong as
you draft; flag anything marked defaulted again in your hand-back. A decision the
hand-off genuinely leaves open is taken on its recommendation and flagged defaulted —
never guessed silently, and never a reason to stall.

Standalone, settle those the way `plan-feature` does — route on where the behaviour
lives, read every other `SPEC.md`'s frontmatter before picking a key, and put key
decisions the input leaves open to the user before drafting. Record each by the
routing rule below: spanning criteria → an ADR in `decisions/`, about one behaviour →
that criterion's body. No key decision lives only in the conversation.

If the input is already a conventioned `SPEC.md`, adopt it as-is. Do not "improve"
the criteria; the human already owns them.

## 2. Draft (new) or amend the contract

**New route** — scaffold the convention's shape: `SPEC.md`, `CONTEXT.md`, and
`AGENTS.md` at the feature root, `decisions/` when the first cross-criterion choice
lands. The parts worth restating because they are where drafts go wrong:

- **Statements speak product, When/Then by default.** "When X, Y" — the trigger,
  then the outcome, readable by someone who has never seen the code. A simple
  invariant may stay plain declarative ("An empty basket totals zero"). Code-level
  precision that is genuinely contractual — exact messages, ordering, rounding,
  identifiers — goes in the body, never the statement; the `code-voice` lint rule
  enforces the boundary.
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
- **`SPEC.md`'s intro prose carries the product intent** — what the feature is for
  and its scope, a paragraph, not a line. There is no separate product document; this
  is where a future reader learns why the slice exists.
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

Quality violations (`weasel-wording`, `compound-criterion`, `unmeasurable`,
`code-voice`) judge the heading statement only. When one fires, rewrite the
statement — do not move the offending words down into the body to dodge the rule.
Two of them deserve their own note:

- A `compound-criterion` usually means you owe the spec a second criterion, not a
  shorter sentence.
- A `code-voice` violation means the statement names the mechanism. Push the code
  fragment into the body — where that precision belongs — and say what the user
  observes instead: "When a basket exceeds 100 line items, checkout rejects it", not
  "`addItem` throws `BasketLimitError`".

`unmeasurable` does not police vocabulary — any domain verb passes ("a refund
**credits** the customer…"). It fires only on a statement that asserts nothing: a
vacuous predicate ("refunds **are handled**") or a bare property ("the dashboard **is
beautiful**"). Say what is observably true instead; the rule is telling you the
criterion has no outcome to test, not that it dislikes your wording.

The rules are fixed and unconfigurable, and there is one severity: a spec lints clean
or it does not.

## 4. Hand back the criteria

In the pipeline, the hand-back is your final message: every criterion drafted,
amended, or retired — ids and statements — every decision recorded and where, and
each one flagged that was defaulted rather than agreed. The orchestrator shows it to
the human; you do not wait, and you do not ask.

Standalone, the same content is the **spec summary**, announced in chat: the human
owns the criteria, and that ownership is exercised by interrupting or amending — not
at a blocking pre-approval. Treat "looks good, and also…" as a change request: amend
the spec, re-lint, announce again. Say what the contract does not yet have: tests
and code are `implement-feature`'s job, and nothing is claimed until it runs.

When the input was already a conventioned `SPEC.md` adopted unchanged, there is
nothing new to announce; say you adopted it and move on.
