# 0018 — skills announce criteria and end with a spec summary

- Status: accepted
- Date: 2026-07-11
- Supersedes the ratify pause in [ADR-0006](0006-implement-feature-pauses-for-ratification.md);
  amends the human path in [ADR-0012](0012-strengthen-routes-on-the-survivor-not-the-score.md)
  and the findings ruling in [ADR-0017](0017-carve-feature-specs-observed-behaviour-and-changes-no-code.md)

## Context

Every skill that drafted a criterion stopped at the ratify pause: a hard stop between
drafting and any test or code, where the human pre-approved the criteria
([ADR-0006](0006-implement-feature-pauses-for-ratification.md)). In use, the pause is a
rubber stamp — the drafted criteria are usually right, so the stop costs a human
context-switch on every feature and buys little the diff would not show. When the
criteria are wrong, amending after the fact is cheap: the skills already support
incremental spec amendment, and everything sits in git.

The pause did extra work in two places. `carve-feature` used it for the human to rule
each finding intended-or-bug before the spec claimed it; `strengthen`'s human path used
it to gate a drafted criterion before its killing test, as a defence against
test-fitting.

## Decision

No skill blocks on the human. In place of the pause, two obligations:

- **Announce**: the moment a drafted or amended spec lints clean, show the criteria —
  ids and statements — and keep going. The human can interrupt at any point; the skill
  never waits.
- **Spec summary**: every run ends with a summary of the spec changes it made —
  criteria drafted, amended, or retired, and for a carve, each finding and how it was
  defaulted. The human rules here, after the fact; an overruled criterion is reverted
  along with its tests.

Defaults where the pause used to decide:

- A carve specs what the code observably does, suspicious or not. Findings are flagged
  at announce time and again in the spec summary; one ruled a bug comes out of the spec
  and into the tracker, exactly as before — the ruling just moves after the claiming.
- `strengthen`'s human path drafts the sharper criterion, announces it, and proceeds
  straight to the killing test under the new id. The defence against test-fitting is
  now the routing question plus the summary: every criterion the run added is surfaced
  for overruling, and a rejected one is reverted with its test, returning its survivor
  to the report.

## Consequences

- Humans still own criteria; ownership moves from pre-approval to review-after,
  exercised in the spec summary or an interrupt rather than at a gate.
- A skill runs end to end with no stops — the flow interruption the pause imposed on
  every feature is gone.
- The window between announce and summary can hold a wrong criterion — including a
  carved spec temporarily claiming a suspected bug. Accepted: reverting is cheap, and
  the summary makes each ruling explicit rather than skipped.
- "Ratify pause" leaves the glossary; "spec summary" replaces it.
