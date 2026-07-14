---
name: strengthen
description: Measure how well a feature's tests defend its code — run mutation and coverage, read the per-criterion oracle-strength heatmap, and route every surviving mutant to a killing test or a sharper criterion. Use when the user wants to strengthen tests, check oracle strength, asks whether tests would catch a bug, wants to kill surviving mutants, or says "strengthen this", "how well is this defended", "run the heatmap".
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# strengthen

A slice can be green and badly defended. `implement-feature` leaves it that way on
purpose; this skill closes the gap — as the final stage of the `feature` pipeline, or
standalone on its own cadence.

Measure oracle strength per criterion, then act on every **surviving mutant** — the exact
code change no test noticed. The routing call is the whole job; §4 is how to make it.

Speccle's words are mandatory: "oracle strength", not "mutation score"; "surviving
mutant", not "missed mutation"; "test-fitting", not "gaming the score".

## 1. Resolve the oracle

Once, in this order, and reuse what works:

1. `speccle-oracle` on `PATH` — the normal case; Speccle's install links it there.
2. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24 executes
   TypeScript directly, so no build is needed:
   `node <speccle-repo>/packages/oracle/src/cli.ts`.

If neither resolves, point the user at the install steps in Speccle's README and stop.

## 2. Require the stack, and never install it silently

Oracle strength needs to know which tests covered each mutant, and that constrains the
target to TypeScript + vitest + StrykerJS. Check for
all four before running anything:

| Requirement                       | Where                                |
| --------------------------------- | ------------------------------------ |
| `@stryker-mutator/core` + runner  | `package.json` devDependencies       |
| `coverageAnalysis: "perTest"`     | `stryker.config.json`                |
| the `json` reporter, and its path | `stryker.config.json` `jsonReporter` |
| istanbul provider, `json-summary` | `vitest.config.ts` `test.coverage`   |

`perTest` is the hard one: without it Stryker never records `coveredBy`, the join has
nothing to walk back to criterion ids, and `oracle strength` exits `2` saying so.

**If something is missing, stop and offer.** Show what is absent, then offer the one
command that provisions all of it — `speccle-oracle strength init <path>` installs the
missing devDependencies and writes the preset configs, keeping any that already exist —
and wait for the user's go-ahead before running it. Never write to the target's
`package.json`, lockfile, or test config without the user agreeing first — this skill
measures someone else's project; it does not quietly re-tool it.

## 3. Produce the reports, then read the heatmap

Mutation runs are slow — minutes on a real codebase. Run them once, route many survivors
from the one report, and only re-run when you have changed a test or the code.

```sh
<test command with coverage>   # → coverage/coverage-summary.json
<mutation command>             # → reports/mutation/mutation.json
<oracle> strength <path>
```

Those two paths are the oracle's defaults; pass `--mutation <file>` / `--coverage <file>`
when the target writes them elsewhere. Coverage is optional — its absence loses the line
coverage baseline, not the measurement.

Show the human heatmap to the user. It prints a bar and `killed/covered` per criterion,
with each criterion's survivors listed beneath it:

```
features/checkout/SPEC.md
  CHECKOUT-1  ████████████████████  100.0%    14/14  Tax rounds half-up to 2dp per line item
  CHECKOUT-3  ██████████████████░░   88.2%    15/17  Checkout rejects a basket of more than 100 line items
      features/checkout/checkout.ts:13:11  StringLiteral → ``
      features/checkout/checkout.ts:14:17  StringLiteral → ""
```

Use `--json` for the routing work: `{ root, strength, lineCoverage, features[], unclaimed,
unknownClaims, unclaimedMutants, staticMutants }`, each criterion carrying `survivors[]`
with `file`, `line`, `column`, `mutator`, `replacement`. `strength` is a report, not a
gate: it exits `0` with survivors present, `2` on a bad or missing report. Never scrape
the human output.

Four fields are not routing work, and are worth saying out loud before you start:

- **`unclaimed`** — a criterion no test's name carries. It scores nothing rather than
  zero. It needs a test written against it before it can be weak; that is
  `implement-feature`'s job, not a survivor to route.
- **`unknownClaims`** — a test claims an id no spec declares. Someone renamed or deleted a
  criterion. Fix the test name or restore the criterion.
- **`unclaimedMutants`** — code the criteria do not reach at all, each entry naming its
  `file`, `line`, `column`, `mutator`, `replacement`. Not weak criteria; a map of the
  regions the spec is silent about. Do not route these as survivors — name the region to
  the human and let them decide whether a feature owes a spec there.
- **`staticMutants`** — mutants that run at module load (word lists, regex literals), so
  per-test coverage can attribute them to no criterion: `{ killed, survivors[] }`. The
  killed ones are fine — some test noticed. A survivor is a real gap, but it can never be
  claimed by a criterion id; name it to the human alongside the unclaimed mutants.

## 4. Route every surviving mutant

Never route a criterion, and never route a percentage — a criterion under 100% always has
at least one survivor to act on, and one at 100% has none, so the number carries nothing
the survivor list does not.
Route each survivor, and ask one question of it:

> Can I write an assertion that **follows from the criterion's statement**, and that fails
> against this mutant?

**Machine path — yes.** The statement already promises the behaviour this mutant breaks;
the suite just never checked it. Write the killing test under that criterion id, exactly
as `implement-feature` does — the `[KEY-n]` token in the full concatenated name.
Re-run, confirm the survivor is gone. No pause; this is why it is the machine path.

**Human path — no, and the behaviour matters.** No criterion entails it, so the spec is
silent or too vague to test. Draft a sharper statement, or the new criterion the spec
owes, taking the next never-used number under the key. Draft it in the target's `SPEC.md`
itself — the spec edit _is_ the draft, and lint reads the real file. Lint it clean,
**announce it** — id and statement — and keep going: the survivor takes the machine path
under the new id.
The human rules on every criterion this run added at the spec summary in §5; an overruled
one is reverted from the spec along with its test, returning its survivor to the report.

**Equivalent mutant — no, and no test ever could.** The mutated code means the same thing.
Annotate it where it lives and move on:

```ts
// Stryker disable next-line ArithmeticOperator: x * 1 and x / 1 are the same value
```

Argue it from the semantics. "The test is awkward to write" is not equivalence, and
reaching for this exit more than rarely means the answer was the machine or human path.

### The trap

`[CHECKOUT-3]` above says _"rejects a basket of more than 100 line items"_. Its two
survivors are the error's message string and `this.name`; the test asserts
`toThrow(TooManyLineItems)`, so `instanceof` reads neither.

Asserting the message text under `[CHECKOUT-3]` kills both mutants and turns the bar
green. Do not. "Rejects" promises a refusal and says nothing about what the refusal
_says_ — the test would pass because someone typed that string, and the next person to
reword the message gets a failure that teaches them nothing. That is test-fitting the
mutant, and it is how mutation testing rots into a score chase.

These survivors are the human path. The spec owes a criterion about what the rejection
tells the caller. Draft it, announce it, test it — and watch `[CHECKOUT-3]` reach 100%
untouched, because a kill counts for every criterion covering the mutant.

Rising oracle strength and a sharpening spec are the same motion. If strength rose and the
spec did not change, check that you did not fit a test to a mutant.

## 5. Confirm and hand back

Re-run coverage, mutation, and `strength` after your last edit — a heatmap from before the
change is not evidence. Then report, verified rather than assumed:

1. The test suite is green.
2. Every survivor you took the machine path on is gone from the report.
3. Oracle strength, before and after, headline and per criterion.
4. The **spec summary**: every criterion this run added to the spec, id and statement.
   The human rules here — an overruled criterion is reverted along with its killing
   test, returning its survivor to the report.
5. What is left, and why: each remaining survivor is annotated as equivalent, with its
   argument, or named as a gap awaiting the human's ruling.

A survivor you cannot explain is not a finished job. Say it is still there rather than
letting a nicer headline number imply otherwise.
