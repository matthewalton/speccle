# speccle

The deterministic tooling the skills invoke: one bin, three commands —

```
speccle lint            # enforce the convention over a repo's specs
speccle claims          # join criteria to the test names that claim them
speccle strength        # oracle-strength heatmap: per-criterion killed ÷ covered
speccle strength init   # provision the strength stack into a target
```

- `lint` — enforce the [convention](https://github.com/matthewalton/speccle/blob/main/docs/convention.md) over a repo's specs.
- `claims` — join every criterion to the test names carrying its id, statically. No
  reports needed, so it is cheap enough to gate on.
- `strength` — join specs + Stryker mutation report + coverage into per-criterion
  `killed ÷ covered`.
- `strength init` — the setup `strength` measures against: install the stack's
  devDependencies and write the preset configs.

The bin is named after the package; every command is an explicit subcommand (a bare
invocation is a usage error, exit code 2). `strength` names the measurement — oracle
strength — not the heatmap rendering of it.

Everything here is a **Speccle tool**: deterministic, independently runnable, emits
typed JSON, never calls an LLM (see [CONTEXT.md](https://github.com/matthewalton/speccle/blob/main/CONTEXT.md)).

## lint

```sh
speccle lint [path] [--json]
```

Lints every `SPEC.md` under `path` (default: current directory; a file path lints just
that file) against the nine fixed rules in
[docs/convention.md](https://github.com/matthewalton/speccle/blob/main/docs/convention.md) — six structural, three quality
heuristics judging the heading statement only. One severity, no configuration.

Output is human terminal text by default; `--json` emits the typed `LintReport`
(see [`src/lint.ts`](src/lint.ts)) — the contract other tooling consumes. Exit codes:
`0` clean, `1` violations, `2` usage error.

## claims

```sh
speccle claims [path] [--json] [--dialect <name>]
```

Joins every criterion under `path` to the test names that claim it, read statically from
the test files — no mutation or coverage reports, so it runs in seconds. A criterion no
test name claims is **unclaimed**; a token claiming a criterion no spec declares is an
**unknown claim**. Only test files under a spec's own folder count, so unrelated tooling
tests can never phantom-claim.

`--dialect` names the **test dialect**: which files are tests, and how a test's full name
is read.

| dialect               | test files                              | names read                                                             |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `ts-vitest` (default) | `*.test.*`, `*.spec.*`                  | `describe` / `it` / `test` titles                                      |
| `swift`               | `*Tests.swift`, anything under `Tests/` | `@Test("…")` / `@Suite("…")` display names, `func test…()` identifiers |

Dialects are named and owned by speccle — a repo declares which one it is on,
never how that dialect works, so a clean run means the same thing in every repo. An
unsupported stack is a usage error, not a silent empty result. Where a framework gives a
test no string name, the criterion id takes its identifier-safe spelling:
`func test_CHECKOUT_1_taxRounds()` claims `CHECKOUT-1`. Reports always render the
bracketed form.

Names are read statically, so a name built dynamically shows up as unclaimed — the
failure mode is a false alarm, never a silent pass. `--json` emits the typed
`ClaimsReport` (see [`src/claims.ts`](src/claims.ts)). Exit codes: `0` every criterion
claimed and no unknown claims, `1` otherwise, `2` usage error.

## strength

```sh
speccle strength [path] [--json] [--mutation <file>] [--coverage <file>]
```

Joins three inputs into one number per **acceptance criterion**: the `SPEC.md` files under
`path`, a StrykerJS mutation report, and an Istanbul `json-summary`. A test claims a
criterion by carrying its `[KEY-n]` token anywhere in its full concatenated name, describe
titles included.

```
features/checkout/SPEC.md
  CHECKOUT-1  ████████████████████  100.0%    14/14  Tax rounds half-up to 2dp per line item
  CHECKOUT-2  ████████████████████  100.0%      7/7  An empty basket totals zero
  CHECKOUT-3  ██████████████████░░   88.2%    15/17  Checkout rejects a basket of more than 100 line items
      features/checkout/checkout.ts:13:11  StringLiteral → ``
      features/checkout/checkout.ts:14:17  StringLiteral → ""
  line coverage 100.0%

oracle strength 95.7% (44/46)   line coverage 100.0%
2 surviving mutants — each one a change no test noticed
```

**Oracle strength** is `killed ÷ covered` — of the mutants a criterion's tests execute, the
fraction the suite kills. A kill counts for every criterion covering that mutant, not only
the one whose test detected it, so
**a criterion below 100% always has at least one surviving mutant listed beneath it** —
the exact code change no test noticed, which is what `strengthen` routes on. Line coverage
sits alongside as the naïve baseline, precisely so the gap between them is visible.

The command reads reports; it never runs Stryker. Defaults are `reports/mutation/mutation.json`
and `coverage/coverage-summary.json`, relative to `path`. Mutants Stryker never ran
(`NoCoverage`) or could not run (`CompileError`, `RuntimeError`, `Ignored`, `Pending`) are
excluded from both sides of the ratio.

The target project must run Stryker with `coverageAnalysis: "perTest"` — without it the
report carries no `coveredBy`, and `strength` refuses rather than guessing. A criterion no
test claims is reported as **unclaimed**, not as zero strength; tokens claiming a criterion
no spec declares are reported too.

`--json` emits the typed `StrengthReport` (see [`src/strength.ts`](src/strength.ts)). The
command exits `0` whenever it produced a report — judging a diff against a threshold is a
separate concern.

## strength init

```sh
speccle strength init [path] [--json] [--skip-install] [--mutate <glob>]...
```

Provisions the stack `strength` measures against — the explicit command the
`strengthen` skill offers when a target is missing pieces,
instead of a hand-assembled config recipe. In one run it:

- installs the missing devDependencies — `speccle` itself, caret-pinned to the
  running oracle's own version, plus the stack pinned to the majors the join is proven
  on (`vitest@^4`, `@vitest/coverage-istanbul@^4`, `@stryker-mutator/core@^9`,
  `@stryker-mutator/vitest-runner@^9`) — using the package manager the target's
  lockfile names (pnpm / npm / yarn / bun);
- writes `stryker.config.json` with the load-bearing preset fields —
  `coverageAnalysis: "perTest"` and the `json` reporter at
  `reports/mutation/mutation.json` (the paths `strength` reads by default) — and mutate
  globs derived from the `SPEC.md` folders under `path` (no specs yet →
  `features/**/*.ts`; override with `--mutate`, repeatable);
- writes a `vitest.config.ts` with the istanbul provider and `json-summary` reporter.

Init also warns (best-effort, via `~/.claude/settings.json`) when the target vendors
the speccle skills project-level in `.claude/skills/` while a user-level speccle plugin
is still enabled — two copies of every skill would load.

An existing Stryker or vitest/vite config is **kept, never overwritten** — init reports
it and names the fields it must carry itself. The command is idempotent: re-running
changes nothing that is already in place. `--skip-install` reports the install command
instead of running it; `--json` emits the typed `InitReport` (see
[`src/init.ts`](src/init.ts)). Running init at a target's root **is** the consent to
write there — there is no postinstall hook or implicit trigger. Exit codes: `0` done,
`2` usage error (including a `path` with no `package.json`).

After init, the loop is the standard one:

```sh
npx vitest run --coverage    # → coverage/coverage-summary.json
npx stryker run              # → reports/mutation/mutation.json
speccle strength .
```

Repo-specific blind spots stay the target's decision: edit the written config's `mutate`
globs to exclude what mutation can't reach (e.g. entry files only exercised through
child processes).

## Development

TypeScript ESM, zero runtime dependencies. Node ≥ 24 runs the sources directly:

```sh
node src/cli.ts lint ../../targets/checkout   # no build needed
pnpm test                                  # vitest: unit + e2e
pnpm build                                 # tsc → dist/ (what the bin points at)
```

Spec parsing lives in [`src/spec.ts`](src/spec.ts), written once and shared by lint
and the heatmap. The [toy target project](https://github.com/matthewalton/speccle/blob/main/targets/checkout) is the clean
proving ground; the dirty regression fixtures live in
[`test/fixtures`](test/fixtures).
