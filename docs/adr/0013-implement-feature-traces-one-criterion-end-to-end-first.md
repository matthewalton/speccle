# 0013 — implement-feature traces one criterion end-to-end before thickening

- Status: accepted
- Date: 2026-07-09

## Context

`implement-feature` hands its phase 5 an already-ratified spec: several criteria, each a
testable behaviour, in document order. Until now phase 5 said only "tests first, then the
code that makes them pass" — true, and silent on the question that actually decides
whether the build goes well: _in what order_.

Silence has a default, and the default is bad. An agent given five criteria and no
ordering rule builds by layer — every criterion's parsing, then every criterion's
calculation, then every criterion's persistence — and discovers only at the end whether
the path connects. This is the failure _The Pragmatic Programmer_ named tracer bullets to
avoid, and the one LLMs fall into hardest, because generating a whole plausible layer is
easier than generating a thin path that runs.

Speccle already says "vertical slice", but it means something else by it: a **feature** is
a subtree owning its spec, context, code and tests together. That is a claim about
colocation. It says nothing about the order in which the code inside the subtree comes to
exist, and it is not the same claim tracer bullets make.

The unit tracer bullets need is already sitting there. An acceptance criterion is one
testable behaviour of the feature — end to end by construction, because a criterion
describes what the feature does, not what one of its layers does. Criteria are the
bullets.

## Decision

Phase 5 implements criteria **one at a time**, and names the one it starts with.

The **tracer criterion** is the criterion whose passing test exercises the thinnest
complete path through every layer the feature touches. It is chosen for path length, not
for importance: the plainest success case, the one with the least logic between entry and
exit. Edge cases, rejections and error paths are never the tracer — they short-circuit
the layers they are supposed to prove.

The tracer criterion is written, made green, and reported. Then each remaining criterion,
in document order, is written and made green against a skeleton that already runs. The
suite is green at every criterion boundary.

Phase 5 does not stop for a human. The green test is the feedback loop; the ratify pause
stays the skill's single hard stop
([ADR-0006](0006-implement-feature-pauses-for-ratification.md)).

## Consequences

- The integration risk is paid on criterion one, when the code is small enough to throw
  away, instead of on criterion five, when it is not.
- Every criterion after the first is an increment on a running system. There is no phase
  in which the feature does not execute.
- A single-layer feature — a pure function, a formatter — has no path to trace. The rule
  degenerates: the first criterion is the tracer, nothing special happens, and the skill
  should not pretend otherwise. The rule earns its keep when a feature spans a boundary.
- Criteria stay honest units of work. A criterion that cannot be made green without three
  others is a compound criterion that lint let through, and the discovery is worth more
  than the inconvenience.
- Document order is now load-bearing in a second place. Ids remain names, never order
  ([ADR-0003](0003-criteria-are-headings-with-key-n-ids.md)); it is the spec's ordering of
  headings that phase 5 walks, and the tracer criterion may sit anywhere in it.
