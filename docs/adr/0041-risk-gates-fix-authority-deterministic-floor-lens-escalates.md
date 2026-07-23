# 0041 — Risk gates fix authority: deterministic floor, a lens may only escalate

- Status: accepted
- Date: 2026-07-23
- Amends [ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md) — risk
  policy is judgement, and the one repo-configurable exception

## Context

`review` fixes what it finds. Whether it may do that unasked is not a global setting —
it depends on the change. A typo fix and a change to auth code deserve different
supervision, and Speccle's usual "announce, never gate" posture is right for one and
reckless for the other.

That needs a risk verdict, which needs a risk policy, which is configurable judgement —
under strain from [ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md).
It survives as a third category. `lint` and `claims` decide whether the code **passes**,
so they must mean the same thing in every repo and Speccle owns them outright. Risk
decides whether a **human is needed**, and what is consequential is irreducibly
repo-specific — `Journey/` is frozen in Ladder, migrations are lethal elsewhere. Speccle
cannot know it.

The hazard is that a risk policy is exactly the dial someone turns to make supervision
disappear, and the worst version of that is a model scoring the risk of its own work.

Speccle can also score risk better than a generic tool can, because it knows things a
diff alone does not: whether a governed slice owns the changed code, whether behaviour
changed while the owning `SPEC.md` did not, whether a criterion was retired or reworded,
whether `claims` still comes back clean, whether the changed code is claimed by any test
at all.

## Decision

A **risk score** is computed by `oracle risk` — deterministic, no LLM, from weighted
spec-aware signals plus the repo's declared **risk policy** in `.speccle/`. Speccle ships
a baseline set of **risk signals**; a repo adds its own. The score is numeric rather than
a band, so it can be calibrated against real outcomes over time
([ADR-0042](0042-calibration-proposes-only-the-human-reduces-supervision.md)).

That score is a **floor**. A risk lens then reads the diff and may **escalate** it for
subtlety no rule catches. It may never de-escalate.

The score gates fix authority against a **review threshold**: below it, `review` fixes
unasked and reports in its summary, as every other Speccle skill does; at or above it,
`review` reports findings and stops, and a human is required. The threshold starts low —
most changes supervised — and rises only on evidence, by human decision.

In CI the verdict is emitted as a pass/fail status check. Whether that blocks a merge is
branch protection: the repo's call, made in GitHub, not configured in Speccle.

Fixes are guarded regardless: every fix re-runs the checks-gate, and a fix that goes red
is reverted rather than salvaged.

## Consequences

- Trust stays in the deterministic tool; judgement can only ever add supervision.
- A model cannot argue its own change down to unsupervised, which is the failure mode
  worth designing against.
- Two mechanisms produce one number, so both the computed floor and any escalation have
  to be legible in the output — a risk level with no visible reasoning is not auditable.
- "Configurable judgement" now has one sanctioned exception, and the reason it is an
  exception has to be stated wherever the principle is.
