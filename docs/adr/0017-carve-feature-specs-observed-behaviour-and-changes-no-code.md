# 0017 — carve-feature specs observed behaviour and changes no code

- Status: accepted
- Date: 2026-07-11

## Context

`implement-feature` and `strengthen` prove the convention on greenfield slices, and the
ADR-0015 pilot proved by hand that existing code can be governed retroactively: a spec
derived from the lint rules landed beside them, their tests were tagged and pulled into
the subtree, and nothing about the rules' behaviour moved. That hand-carve is the prior
art ADR-0015 promised the deferred `carve-feature` skill; building the skill forces
three questions the pilot answered implicitly.

**What does a derived spec describe?** An agent reading unfamiliar code will find
behaviour that looks wrong — an off-by-one, a swallowed error, a rounding direction
nobody would choose today. Writing the criterion the code _should_ satisfy produces a
spec the code fails; writing the observed behaviour risks canonising a bug with a
ratified id. Greenfield ratification (ADR-0006) gives the human ownership of the
criteria; in a carve the human owns something more — whether the agent's _reading_ of
the code matches their intent.

**What may a carve edit?** The temptation is to fix what the reading turns up: the bug,
the dead branch, the misnamed function. But a carve runs precisely when no ratified
spec exists yet — any behaviour change it makes is a change nothing defends, made by
the party with the least context on why the code is the way it is.

**Where is the boundary?** The convention makes a feature a directory subtree with the
code and tests colocated. Existing projects routinely keep tests in a parallel tree,
and sometimes smear a feature's source across several directories.

## Decision

`carve-feature` brings an existing region of code under the convention, and its spec
states **observed behaviour only**: every criterion is something the code verifiably
does today. Behaviour the agent suspects is a bug is presented as a finding at the
ratify pause, where the human rules each one **intended** — the criterion stands,
stating what the code does — or **a bug** — the behaviour is left out of the spec and
recorded as future work. A carve never writes an aspirational criterion and never fixes
what it finds.

A carve edits test files, `SPEC.md`, and `CONTEXT.md` — nothing else. Existing tests
may be renamed to carry criterion ids and moved into the subtree for colocation;
unclaimed criteria get new tests, written to pass against the code as it stands.
Source files are never edited or moved. If the feature's source is not already one
directory subtree, the skill stops: colocating source is a refactor the human does
before carving, under whatever safety net they trust.

Done is `implement-feature`'s done — folder, clean lint, every criterion claimed,
suite green — plus the carve's own invariant, verified from the diff: nothing changed
but tests and the two markdown files. Oracle strength stays `strengthen`'s job, and a
fresh carve is that skill's natural next target.

## Consequences

- A carved spec is honest before it is aspirational. It may ratify ugly criteria that
  document odd-but-intended behaviour — that is the point; sharpening them is later,
  governed work.
- A bug found mid-carve becomes a ticket and, later, an `implement-feature` or
  `strengthen` cycle against a new criterion. The carve's output is stable regardless
  of what it uncovered.
- A new test that fails is a discovery, not a draft to iterate on: the agent misread
  the code (fix the spec, re-ratify the changed statement) or found a bug (unspec it,
  file it). The failing test never becomes a reason to touch the source.
- The subtree restriction leaves some code uncarveable until a human refactors it into
  one place. Deliberate: the alternative is the skill moving source files nothing yet
  defends.
- There is no tracer criterion ([ADR-0013](0013-implement-feature-traces-one-criterion-end-to-end-first.md)):
  the tracer exists to prove a path connects, and a carve's path is proven by the code
  already running. Criteria are claimed in document order.
