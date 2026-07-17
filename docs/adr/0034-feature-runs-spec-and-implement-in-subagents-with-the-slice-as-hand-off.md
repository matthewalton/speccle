# 0034 — feature runs spec and implement in subagents; the slice's markdown is the hand-off

- Status: accepted
- Date: 2026-07-17
- Supersedes the in-session pipeline of
  [ADR-0022](0022-feature-orchestrates-plan-spec-implement-strengthen.md) and the
  remaining ratify pause of
  [ADR-0006](0006-implement-feature-pauses-for-ratification.md)

## Context

Running the whole pipeline in one session drowns the orchestrator's context in TDD
grind — red/green loops, test output dumps — and anything the human decided during
planning survives only as long as that context does, which is the root of knowledge
loss across feature builds.

A subagent cannot talk to the human mid-run: it executes autonomously and returns one
report. So the pipeline splits by step type — dialogue steps stay in the main session,
grind steps move out.

## Decision

The `feature` orchestrator keeps **plan** (dialogue,
[ADR-0036](0036-planning-grills-conditionally-and-gates-once-via-plan-mode.md)) and
**commit** in the main session, and runs **spec** and **implement** each in its own
subagent.

- **The hand-off artifact is the feature folder itself.** A subagent never sees the
  planning conversation; everything it needs must be on disk — `SPEC.md`,
  `CONTEXT.md`, `AGENTS.md`, `decisions/` — before it launches. Context saving thereby
  forces documentation: what isn't written into the slice doesn't survive the
  hand-off.
- **A per-feature PRD was considered and rejected.** Everything it would hold already
  has a home: decisions in `decisions/`, language in `CONTEXT.md`, product intent in
  `SPEC.md`'s intro prose. A second product document beside the spec is drift waiting
  to happen. The folder floor stays: `SPEC.md`, `CONTEXT.md`, `AGENTS.md`,
  `decisions/`, `src/`.
- **The spec subagent must lint clean before returning** — including the product-voice
  rule ([ADR-0032](0032-criterion-statements-are-product-voiced-when-then.md)) — and
  reports the criteria list back for the orchestrator to show as an FYI the human can
  veto. There is no ratification gate: the oracle guards spec quality, not the human.
- **The implement subagent** requires the linted spec on disk and works
  criterion-driven red-green, tracer first on a new slice
  ([ADR-0013](0013-implement-feature-traces-one-criterion-end-to-end-first.md)).

## Consequences

- The orchestrator's context stays small enough to hold the whole run: route, key,
  plan summary, subagent reports.
- The child skills remain independently invocable ([ADR-0022](0022-feature-orchestrates-plan-spec-implement-strengthen.md)'s
  decomposition survives); what changes is that `feature` invokes spec and implement
  as subagents rather than inline.
- A wrong spec can burn an implement run before the human notices — mitigated by the
  criteria FYI, and accepted in exchange for a single up-front gate.
