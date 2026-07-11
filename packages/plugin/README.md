# speccle (plugin)

The Claude Code plugin: the skills. See the
[repo README](https://github.com/matthewalton/speccle#readme) for the full picture and
[docs/convention.md](https://github.com/matthewalton/speccle/blob/main/docs/convention.md)
for the format the skills implement.

Skills, in build order
([ADR-0001](https://github.com/matthewalton/speccle/blob/main/docs/adr/0001-plugin-first-tools-serve-skills.md)):

1. [`implement-feature`](skills/implement-feature/SKILL.md) — any spec input → drafted
   `SPEC.md` + `CONTEXT.md` → lint → criteria announced → tagged tests +
   implementation, one criterion at a time, tracer criterion first → spec summary
   ([ADR-0013](https://github.com/matthewalton/speccle/blob/main/docs/adr/0013-implement-feature-traces-one-criterion-end-to-end-first.md)).
   **Landed.**
2. [`strengthen`](skills/strengthen/SKILL.md) — mutation + coverage → per-criterion
   oracle-strength heatmap → route each surviving mutant (machine path / human path /
   equivalent mutant), never the score
   ([ADR-0012](https://github.com/matthewalton/speccle/blob/main/docs/adr/0012-strengthen-routes-on-the-survivor-not-the-score.md)).
   **Landed.**
3. [`carve-feature`](skills/carve-feature/SKILL.md) — existing ungoverned code →
   `SPEC.md` + `CONTEXT.md` derived from observed behaviour → lint → criteria and
   findings announced → existing tests tagged, unclaimed criteria tested, behaviour
   unchanged → spec summary
   ([ADR-0017](https://github.com/matthewalton/speccle/blob/main/docs/adr/0017-carve-feature-specs-observed-behaviour-and-changes-no-code.md)).
   **Landed.**

A skill that is _ordered to read_ a doc gets that doc bundled beside it, under the
skill's `references/` — an installed plugin obeys its own instructions offline. Those
copies are generated; edit the source in `docs/` and run `pnpm sync:plugin-refs`. Every
other doc link here is provenance: cite it, don't fetch it.

The skills shell out to `speccle-oracle` for everything deterministic — trust comes from
the tools, judgement from the skills. Speccle is used from a clone, so that binary comes
from building the oracle and linking it onto your `PATH`: see
[Install](https://github.com/matthewalton/speccle#install). Skills that cannot find the
oracle stop rather than hand-check the convention in its place.
