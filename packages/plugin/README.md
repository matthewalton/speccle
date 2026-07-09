# speccle (plugin)

The Claude Code plugin: the skills. See the [repo README](../../README.md) for the full
picture and [docs/convention.md](../../docs/convention.md) for the format the skills
implement.

Skills, in build order
([ADR-0001](../../docs/adr/0001-plugin-first-tools-serve-skills.md)):

1. [`implement-feature`](skills/implement-feature/SKILL.md) — any spec input → drafted
   `SPEC.md` + `CONTEXT.md` → lint → ratify pause → tagged tests + implementation,
   green. **Landed.**
2. `strengthen` — mutation + coverage → per-criterion oracle-strength heatmap → route
   weak criteria (machine path / human path). Waiting on the heatmap.

The skills shell out to `speccle-oracle` for everything deterministic — trust comes from
the tools, judgement from the skills. Speccle is used from a clone, so that binary comes
from building the oracle and linking it onto your `PATH`: see
[Install](../../README.md#install). Skills that cannot find the oracle stop rather than
hand-check the convention in its place.
