# 0012 — strengthen routes on the survivor, not the score

- Status: accepted
- Date: 2026-07-09

## Context

`strengthen` shows a per-criterion oracle-strength heatmap and then has to do something
about the weak criteria. The obvious design is a threshold: below some percentage, act.

But under [ADR-0011](0011-oracle-strength-credits-a-kill-to-every-covering-criterion.md)
a mutant counts as killed for a criterion when any test in the suite kills it. So a
criterion's **surviving mutant is a change the entire suite missed** — not an artefact of
which test happened to detect it. Two things follow. A criterion below 100% always has at
least one survivor to act on, and a criterion at 100% has nothing to act on at all. The
percentage adds no information the survivor list doesn't already carry, and a threshold
would invent a cutoff where the data has none.

What the score cannot tell you is _whose_ gap it is. On the toy target `[CHECKOUT-3]`
("Checkout rejects a basket of more than 100 line items") sits at 88.2% with two
survivors: the `TooManyLineItems` message string, and `this.name`. The test asserts
`toThrow(TooManyLineItems)`, so `instanceof` never reads either. Both are genuinely
undetected by the suite. Neither is `[CHECKOUT-3]`'s fault — "rejects" promises a
refusal, and says nothing whatsoever about what the refusal _says_.

Killing them under `[CHECKOUT-3]` means asserting the message text a criterion never
promised. The test then passes because someone typed that string, not because the
behaviour is right — and the next person to reword the message gets a failure that
teaches them nothing. That is test-fitting the mutant: the failure mode that turns
mutation testing into a score chase, and the thing this ADR exists to prevent.

## Decision

`strengthen` routes each **surviving mutant** — never a criterion, never a percentage —
down one of three exits. The discriminator is entailment:

> Can you write an assertion that follows from the criterion's **statement**, and that
> fails against this mutant?

1. **Machine path** — yes. The statement already promises the behaviour the mutant
   breaks; the suite just never checked it. Write the killing test under that criterion
   id, re-run, confirm the survivor is gone. No human in the loop.
2. **Human path** — no, and the behaviour matters. No criterion in the spec entails it,
   so the spec is silent or too vague to test. Draft a sharper statement or a new
   criterion, lint it, and **stop at the ratify pause**
   ([ADR-0006](0006-implement-feature-pauses-for-ratification.md)) — the human owns
   criteria here exactly as they do in `implement-feature`. Once ratified, the survivor
   takes the machine path under the new id.
3. **Equivalent mutant** — no, and no test could ever tell the difference, because the
   mutated code means the same thing. Annotate it in the source
   (`// Stryker disable next-line <mutator>: <why>`) and move on.

Exit 3 must be argued from the semantics, never assumed because a test is inconvenient to
write. It is the rare exit; reaching for it more than occasionally means exit 1 or 2 was
the real answer.

## Consequences

- No threshold, and no configuration of one. There is nothing to tune, matching the
  lint rules ([ADR-0007](0007-lint-rules-are-fixed-heuristics.md)).
- `strength` stays a report, not a gate: it exits `0` with survivors present. Failing a
  build on oracle strength is `gate`'s job, if it is ever anyone's.
- The human path grows the spec. `[CHECKOUT-3]`'s survivors are answered by a new
  criterion about what the rejection tells the caller — not by a cleverer test. Rising
  oracle strength and a sharpening spec are the same motion.
- Generous credit closes the loop: a test written for the new criterion kills those
  mutants, and `[CHECKOUT-3]` — whose tests also execute them — reaches 100% without
  anyone touching its tests.
- An unclaimed criterion is not a routing decision. No test carries its token, so it
  scores nothing rather than zero; it needs a test before it can be weak.
