# 0042 — Calibration proposes; only the human reduces supervision

- Status: accepted
- Date: 2026-07-23

## Context

The review threshold ([ADR-0041](0041-risk-gates-fix-authority-deterministic-floor-lens-escalates.md))
cannot be guessed correctly on day one. Set it high and unreviewed changes ship; set it
low and every change is supervised forever, which is the status quo with extra steps. The
useful behaviour is to start low and let the threshold **earn** its rise as the scoring
proves accurate against real outcomes.

Nothing here is model training — no weights inside the model are updated. What improves is
bookkeeping Speccle owns: the weights on risk signals, the set of signals, the threshold,
and the lens prompts.

That requires a durable **calibration record**: for every reviewed change, the score, the
signals that fired, any lens escalation, and the human's actual verdict — did this need a
human, and did the review find something real.

The hazard is the one ADR-0041 exists to prevent, in slower form. A loop that lowers its
own weights argues its own work down to unsupervised across thirty changes instead of one,
and no single decision is accountable for the drift. Weights and threshold also multiply
into the same verdict, so "only the human moves the threshold" is meaningless if weights
tune themselves — halving every weight is doubling the threshold.

## Decision

Speccle keeps the calibration record and **reports** on it: which signals never once
corresponded to a real problem, which fired on every change a human did catch, what
threshold the record would have supported.

Nothing that reduces supervision applies itself. Weights and the review threshold change
only by human decision, on that evidence. Escalation remains free — anything that _adds_
supervision may happen automatically, consistent with ADR-0041.

## Consequences

- Supervision can only ever be reduced by a deliberate, attributable act. There is no
  silent slide.
- Recalibration is a motion the human has to make; a repo that never makes it keeps its
  day-one threshold, which is safe but stagnant. The report has to be surfaced often
  enough that ignoring it is a choice.
- The record needs an honest human verdict per reviewed change, which is real friction
  early on. That cost is accepted deliberately: it is the training data, and a threshold
  that rose on dishonest data is worse than one that never rose.
- Calibration reports are evidence, never instructions. A report showing a signal has
  never fired usefully is a prompt to think, not a licence to delete it.
