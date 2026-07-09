---
name: strengthen
description: Measure how well a feature's tests defend its code — run mutation and coverage, read the per-criterion oracle-strength heatmap, and route every surviving mutant to a killing test or a sharper criterion. Use when the user wants to strengthen tests, check oracle strength, asks whether tests would catch a bug, wants to kill surviving mutants, or says "strengthen this", "how well is this defended", "run the heatmap".
---

# strengthen

A slice can be green and badly defended. `implement-feature` leaves it that way on
purpose ([ADR-0006](https://github.com/matthewalton/speccle/blob/main/docs/adr/0006-implement-feature-pauses-for-ratification.md));
this skill closes the gap.

Measure oracle strength per criterion, then act on every **surviving mutant** — the exact
code change no test noticed. The routing call is the whole job; §4 is how to make it.

Speccle's words are mandatory: "oracle strength", not "mutation score"; "surviving
mutant", not "missed mutation"; "test-fitting", not "gaming the score". The canonical
glossary is [CONTEXT.md](https://github.com/matthewalton/speccle/blob/main/CONTEXT.md).

## 1. Resolve the oracle

Once, in this order, and reuse what works:

1. `speccle-oracle` on `PATH` — the normal case; Speccle's install links it there.
2. Otherwise, from a clone of the speccle repo, run it from source — Node ≥ 24 executes
   TypeScript directly, so no build is needed:
   `node <speccle-repo>/packages/oracle/src/cli.ts`.

If neither resolves, point the user at the install steps in Speccle's README and stop.

## 2. Require the stack, and never install it silently

Oracle strength needs to know which tests covered each mutant, and that constrains the
target to TypeScript + vitest + StrykerJS
([ADR-0008](https://github.com/matthewalton/speccle/blob/main/docs/adr/0008-v1-targets-ts-vitest-stryker-only.md)). Check for
all four before running anything:

| Requirement                       | Where                                |
| --------------------------------- | ------------------------------------ |
| `@stryker-mutator/core` + runner  | `package.json` devDependencies       |
| `coverageAnalysis: "perTest"`     | `stryker.config.json`                |
| the `json` reporter, and its path | `stryker.config.json` `jsonReporter` |
| istanbul provider, `json-summary` | `vitest.config.ts` `test.coverage`   |

`perTest` is the hard one: without it Stryker never records `coveredBy`, the join has
nothing to walk back to criterion ids, and `oracle strength` exits `2` saying so.

**If something is missing, stop and offer.** Show what is absent and the exact config or
install command that fixes it, then wait. Never write to the target's `package.json`,
lockfile, or test config without the user agreeing first — this skill measures someone
else's project; it does not quietly re-tool it.

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
unknownClaims, unclaimedMutants }`, each criterion carrying `survivors[]` with `file`,
`line`, `column`, `mutator`, `replacement`. `strength` is a report, not a gate: it exits
`0` with survivors present, `2` on a bad or missing report. Never scrape the human output.

Three fields are not routing work, and are worth saying out loud before you start:

- **`unclaimed`** — a criterion no test's name carries. It scores nothing rather than
  zero. It needs a test written against it before it can be weak; that is
  `implement-feature`'s phase 5, not a survivor to route.
- **`unknownClaims`** — a test claims an id no spec declares. Someone renamed or deleted a
  criterion. Fix the test name or restore the criterion.
- **`unclaimedMutants`** — code the criteria do not reach at all. Not a weak criterion; a
  hint that the spec is silent about a whole region of the code.

## 4. Route every surviving mutant

Never route a criterion, and never route a percentage — a criterion under 100% always has
at least one survivor to act on, and one at 100% has none, so the number carries nothing
the survivor list does not
([ADR-0012](https://github.com/matthewalton/speccle/blob/main/docs/adr/0012-strengthen-routes-on-the-survivor-not-the-score.md)).
Route each survivor, and ask one question of it:

> Can I write an assertion that **follows from the criterion's statement**, and that fails
> against this mutant?

**Machine path — yes.** The statement already promises the behaviour this mutant breaks;
the suite just never checked it. Write the killing test under that criterion id, exactly
as `implement-feature` does — the `[KEY-n]` token in the full concatenated name
([ADR-0004](https://github.com/matthewalton/speccle/blob/main/docs/adr/0004-tests-claim-criteria-in-the-full-test-name.md)).
Re-run, confirm the survivor is gone. No pause; this is why it is the machine path.

**Human path — no, and the behaviour matters.** No criterion entails it, so the spec is
silent or too vague to test. Draft a sharper statement, or the new criterion the spec
owes, taking the next never-used number under the key. Lint it clean, then **stop at the
ratify pause**: show the id and statement, ask for approval, and write nothing until the
human answers. Once ratified, the survivor takes the machine path under the new id.

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
tells the caller. Draft it, get it ratified, test it — and watch `[CHECKOUT-3]` reach 100%
untouched, because a kill counts for every criterion covering the mutant
([ADR-0011](https://github.com/matthewalton/speccle/blob/main/docs/adr/0011-oracle-strength-credits-a-kill-to-every-covering-criterion.md)).

Rising oracle strength and a sharpening spec are the same motion. If strength rose and the
spec did not change, check that you did not fit a test to a mutant.

## 5. Confirm and hand back

Re-run coverage, mutation, and `strength` after your last edit — a heatmap from before the
change is not evidence. Then report, verified rather than assumed:

1. The test suite is green.
2. Every survivor you took the machine path on is gone from the report.
3. Oracle strength, before and after, headline and per criterion.
4. What is left, and why: each remaining survivor is awaiting ratification, annotated as
   equivalent, or a criterion the human declined to add.

A survivor you cannot explain is not a finished job. Say it is still there rather than
letting a nicer headline number imply otherwise.
