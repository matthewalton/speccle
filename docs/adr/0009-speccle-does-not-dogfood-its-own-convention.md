# 0009 — Speccle does not dogfood its own convention

- Status: accepted
- Date: 2026-07-09

## Context

The old repo enforced a dogfooding invariant: every package proved itself with its own
spec convention, criteria defended by tagged tests, the linter linting its own spec.
Elegant — and a standing tax on every change, part of why the project felt heavier
than its size.

## Decision

This repo does not apply the Speccle convention to itself. No feature-folder specs, no
self-measured oracle strength. It keeps the lighter documentation discipline instead:
this root `CONTEXT.md` glossary and these ADRs. The convention is proven against toy
target projects at each build step, not against Speccle's own source.

## Consequences

- Changes to Speccle carry no convention overhead; the toy projects are the proving
  ground and the regression fixtures.
- Speccle loses the "measurer is measured" credibility story — an acceptable trade
  while the priority is shipping the workflow.
- Revisitable once the tooling is stable enough that dogfooding would be cheap.
