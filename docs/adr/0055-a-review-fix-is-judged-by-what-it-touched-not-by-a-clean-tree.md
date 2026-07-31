# 0055 — A review fix is judged by what it touched, not by a clean tree

- Status: accepted
- Date: 2026-07-31
- Amends the checks-gate of
  [ADR-0035](0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md) a second
  time: [ADR-0054](0054-implement-runs-one-criterion-per-session-and-claims-clean-is-the-terminal-condition.md)
  narrowed its `claims` check for the inner loop; this narrows it for the outer one
- Refines the revert-on-red rule of
  [ADR-0051](0051-the-local-driver-lands-the-fixes-it-makes.md): it settles what counts as the
  fix's red, not whether a red fix is reverted

## Context

`review` and `address` guard every fix with the checks-gate and treat a non-green result as the
fix's fault — "revert it, do not salvage". Three of the gate's four checks are scoped to the
change or the slice; the fourth, `claims <root>`, asserts that **every** criterion under the
root is claimed by a test.

That is an assertion about the whole tree, made to judge one fix. On a change set where any
slice is half-built, `claims` exits `1` before a single fix is applied, so every fix reads red
and every fix is reverted. The review reports nothing fixed, and reports it in the gate's
words — which are true about the exit code and false about the cause.

The reading was sound where it was written. ADR-0035 put the gate at the **end of a slice**,
where every criterion was meant to be claimed, so "the tree is clean" and "this fix broke
nothing" coincided. The outer loop inherited the sentence without inheriting the precondition:
`review`'s unit is the change set
([ADR-0043](0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)), and nothing
promises a change set is a finished slice.

[ADR-0054](0054-implement-runs-one-criterion-per-session-and-claims-clean-is-the-terminal-condition.md)
turns that from an edge case into the ordinary one. Per-criterion sessions make the natural
stopping point every criterion rather than the end of a slice, and its own consequence
anticipates a slice's intermediate commits reaching one review together. The state the gate
treats as broken is now the state the pipeline is designed to leave behind between sessions.

## Decision

**A fix is judged by what it touched.** A red the fix did not cause is not the fix's red — it
is a fact about the change set, and it belongs in the summary rather than in the revert
decision.

The gate's four checks and its commands are unchanged. What changes is how `claims` is read.

### `claims` is read, not exit-coded

The gate runs `<oracle> claims <root> --json` and asks two questions of the fix just applied:

1. Every criterion whose defending tests the fix touched is `claimed`.
2. No `unknownClaims` entry names a test the fix touched.

Both are narrow for the same reason: a fix that leaves a criterion it was defending undefended,
or that renames a test into a claim on an id that does not exist, has broken something it was
holding. Everything else in the report describes the change set the review arrived at.

The narrowing is the skill's, not the oracle's. The report already carries per-criterion
`claimed` and the full `unknownClaims` list, and the blast radius is a judgement the skill is
already making when it decides which files a fix touched — a `--criterion` flag would move that
judgement into a flag without making it any more deterministic.

### The other three stay absolute

`claims` is the only check a half-built slice makes red **by construction** — unclaimed is what
half-built means. The others carry no such guarantee of falsity, and one carries the opposite:
ADR-0054's per-criterion gate requires a green suite at every commit, so a committed change set
that arrives with a red suite has a real problem, and stopping on it is right. `lint` is already
scoped to the slice the fix touched, and `verify` to the change set. Where a check cannot
distinguish a pre-existing red from a caused one, the gate stays absolute.

### What the narrowing must not become

Silence. The same report that scopes the verdict also names the criteria the change set leaves
unclaimed, and the summary says so — as an observation about the change set, never as a fix's
verdict. Narrowing the gate removes a false attribution; it must not also remove the true
signal underneath it.

## Consequences

- **A review of a mid-slice branch can fix things again.** This is the whole point, and it is
  the case ADR-0054 made ordinary.
- **The gate's claims check stops being a single exit code**, so a skill that only shelled out
  and looked at the status now has to read the report. That is the cost of the judgement being
  the skill's; it is also the read the summary needed anyway.
- **A fix can pass the gate on a tree that is not clean**, which was previously impossible. The
  fix landing is still bounded by every other check, by the risk gate that granted the authority
  ([ADR-0041](0041-risk-gates-fix-authority-deterministic-floor-lens-escalates.md)), and by the
  change set being one revert away.
- **Slice-wide `claims` clean now has exactly one asserting caller: none.** ADR-0054 made it the
  pipeline's terminal condition, observed by `next`; the outer loop was the last place still
  asserting it. The consolidation 0054 wanted is finished rather than half-made.
- **The rule is stated generally but applied to one check**, which is a bet that the other three
  will not need it. If a consumer's `verify` check turns out to be red-by-construction mid-slice,
  this is the ADR that was wrong, and the same reading extends to it.
