# speccle-oracle

The deterministic tooling the skills invoke: one bin, two commands —

```
speccle-oracle lint       # enforce the convention over a repo's specs
speccle-oracle strength   # oracle-strength heatmap: per-criterion killed ÷ covered
```

- `lint` — enforce the [convention](../../docs/convention.md) over a repo's specs.
- `strength` — join specs + Stryker mutation report + coverage into per-criterion
  `killed ÷ covered`. Not implemented yet.

The bin is named after the package; both commands are explicit subcommands (a bare
invocation is a usage error, exit code 2). `strength` names the measurement — oracle
strength — not the heatmap rendering of it.

Everything here is a **Speccle tool**: deterministic, independently runnable, emits
typed JSON, never calls an LLM (see [CONTEXT.md](../../CONTEXT.md)).

## lint

```sh
speccle-oracle lint [path] [--json]
```

Lints every `SPEC.md` under `path` (default: current directory; a file path lints just
that file) against the nine fixed rules in
[docs/convention.md](../../docs/convention.md) — six structural, three quality
heuristics judging the heading statement only (ADR-0007). One severity, no
configuration.

Output is human terminal text by default; `--json` emits the typed `LintReport`
(see [`src/lint.ts`](src/lint.ts)) — the contract other tooling consumes. Exit codes:
`0` clean, `1` violations, `2` usage error.

## Development

TypeScript ESM, zero runtime dependencies. Node ≥ 24 runs the sources directly:

```sh
node src/cli.ts lint ../../targets/checkout   # no build needed
pnpm test                                  # vitest: unit + e2e
pnpm build                                 # tsc → dist/ (what the bin points at)
```

Spec parsing lives in [`src/spec.ts`](src/spec.ts), written once and shared by lint
and the heatmap (ADR-0002). The [toy target project](../../targets/checkout) is the clean
proving ground; the dirty regression fixtures live in
[`test/fixtures`](test/fixtures).
