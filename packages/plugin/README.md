# speccle (plugin)

The Claude Code plugin: the skills. See the
[repo README](https://github.com/matthewalton/speccle#readme) for the full picture and
[docs/convention.md](https://github.com/matthewalton/speccle/blob/main/docs/convention.md)
for the format the skills implement.

The entry point is [`feature`](skills/feature/SKILL.md), an orchestrator that runs
the pipeline **plan → spec → implement → strengthen** by invoking the child skills
below — each of which is also invocable on its own
([ADR-0022](https://github.com/matthewalton/speccle/blob/main/docs/adr/0022-feature-orchestrates-plan-spec-implement-strengthen.md)):

1. [`plan-feature`](skills/plan-feature/SKILL.md) — any input → explore the repo →
   route the work (**new** slice / **amend** the slice that owns the behaviour /
   hand to a **carve**) → announce route, folder, and key
   ([ADR-0023](https://github.com/matthewalton/speccle/blob/main/docs/adr/0023-plan-feature-routes-new-amend-or-carve.md)).
2. [`spec-feature`](skills/spec-feature/SKILL.md) — draft (new) or amend (existing)
   the markdown contract → lint → criteria announced → spec summary when standalone.
3. [`implement-feature`](skills/implement-feature/SKILL.md) — a linted spec → tagged
   tests + implementation, red-green, one criterion at a time, tracer criterion first
   on a new slice
   ([ADR-0013](https://github.com/matthewalton/speccle/blob/main/docs/adr/0013-implement-feature-traces-one-criterion-end-to-end-first.md)).
4. [`strengthen`](skills/strengthen/SKILL.md) — mutation + coverage → per-criterion
   oracle-strength heatmap → route each surviving mutant (machine path / human path /
   equivalent mutant), never the score
   ([ADR-0012](https://github.com/matthewalton/speccle/blob/main/docs/adr/0012-strengthen-routes-on-the-survivor-not-the-score.md)).
   The pipeline's built-in review gate, and a standalone skill.

Beside the pipeline: [`carve-feature`](skills/carve-feature/SKILL.md) — existing
ungoverned code → markdown contract derived from observed behaviour → lint → criteria
and findings announced → existing tests tagged, unclaimed criteria tested, behaviour
unchanged → spec summary
([ADR-0017](https://github.com/matthewalton/speccle/blob/main/docs/adr/0017-carve-feature-specs-observed-behaviour-and-changes-no-code.md)).

A skill that is _ordered to read_ a doc gets that doc bundled beside it, under the
skill's `references/` — an installed plugin obeys its own instructions offline. Those
copies are generated; edit the source in `docs/` and run `pnpm sync:plugin-refs`. Every
other doc link here is provenance: cite it, don't fetch it.

The skills shell out to `speccle-oracle` for everything deterministic — trust comes from
the tools, judgement from the skills. Speccle is used from a clone, so that binary comes
from building the oracle and linking it onto your `PATH`: see
[Install](https://github.com/matthewalton/speccle#install). Skills that cannot find the
oracle stop rather than hand-check the convention in its place.
