# speccle (plugin)

The Claude Code plugin: the skills. See the [repo README](../../README.md) for the full
picture and [docs/convention.md](../../docs/convention.md) for the format the skills
implement.

Skills, in build order
([ADR-0001](../../docs/adr/0001-plugin-first-tools-serve-skills.md)):

1. [`implement-feature`](skills/implement-feature/SKILL.md) — any spec input → drafted
   `SPEC.md` + `CONTEXT.md` → lint → ratify pause → tagged tests + implementation, one
   criterion at a time, tracer criterion first
   ([ADR-0013](../../docs/adr/0013-implement-feature-traces-one-criterion-end-to-end-first.md)).
   **Landed.**
2. [`strengthen`](skills/strengthen/SKILL.md) — mutation + coverage → per-criterion
   oracle-strength heatmap → route each surviving mutant (machine path / human path /
   equivalent mutant), never the score
   ([ADR-0012](../../docs/adr/0012-strengthen-routes-on-the-survivor-not-the-score.md)).
   **Landed.**

The skills shell out to `speccle-oracle` for everything deterministic — trust comes from
the tools, judgement from the skills. Speccle is used from a clone, so that binary comes
from building the oracle and linking it onto your `PATH`: see
[Install](../../README.md#install). Skills that cannot find the oracle stop rather than
hand-check the convention in its place.
