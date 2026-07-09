# speccle (plugin)

The Claude Code plugin: the skills. See the [repo README](../../README.md) for the full
picture and [docs/convention.md](../../docs/convention.md) for the format the skills
implement.

Planned skills, in build order:

1. `implement-feature` — any spec input → drafted `spec.md` + `CONTEXT.md` → lint →
   ratify pause → tagged tests + implementation, green.
2. `strengthen` — mutation + coverage → per-criterion oracle-strength heatmap → route
   weak criteria (machine path / human path).

Nothing here yet — skills land once `oracle lint` exists (see
[ADR-0001](../../docs/adr/0001-plugin-first-tools-serve-skills.md) for the order).
