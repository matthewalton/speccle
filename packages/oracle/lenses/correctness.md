# correctness lens

**Stance:** assume the change is subtly wrong and go looking for the input that proves it.
Read the diff as an adversary would — the value the author did not picture.

## What to look for

- **Boundaries** — off-by-one, empty collection, single element, the maximum, zero,
  negative, the exact threshold a comparison turns on. `<` where `<=` was meant.
- **Absent values** — null / undefined / None threaded into code that assumes presence; a
  default that silently swallows a real value; an optional unwrapped without a branch.
- **Error paths** — a thrown error caught and dropped; a rejected promise nobody awaits; a
  failure that leaves state half-written; a `catch` that hides the cause.
- **Async** — an unawaited promise, a race between two writers, a shared mutable read
  mid-update, iteration that mutates what it iterates.
- **Logic the change moved** — an inverted condition, a De Morgan slip, a `&&` that should
  be `||`, a guard that no longer guards because the code around it moved.
- **Contract drift** — a caller and callee that now disagree about units, order, nullability,
  or what an empty result means; a return type widened without every caller noticing.

## How to report

Report only findings anchored to a **changed line** — not a pre-existing bug the change did
not touch. For each finding give:

- `path:line` — the changed line it anchors to
- **severity** — blocker · major · minor · nit
- **what** — the defect in one line
- **why** — the concrete input or interleaving that triggers it, and what goes wrong
- **fix** — the change that closes it
- **route** — the artefact that stops the class recurring: `criterion` (the behaviour a
  test should have claimed) · `check` (a cross-file invariant) · `lens` · `none`

State the triggering case concretely — "a basket with exactly one line item", not "edge
cases". A finding you cannot reduce to an input is a hunch; hold it or say so. An empty
report is a valid and common result.
