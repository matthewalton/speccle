# speccle-oracle

The deterministic tooling the skills invoke: one bin, two concerns —

- `lint` — enforce the [convention](../../docs/convention.md) over a repo's specs.
- the oracle-strength heatmap — join specs + Stryker mutation report + coverage into
  per-criterion `killed ÷ covered`.

Everything here is a **Speccle tool**: deterministic, independently runnable, emits
typed JSON, never calls an LLM (see [CONTEXT.md](../../CONTEXT.md)).

Stub for now — `lint` is the next build step
([ADR-0001](../../docs/adr/0001-plugin-first-tools-serve-skills.md)). Bin and command
naming are still open.
