# speccle

The deterministic tooling the skills invoke — one bin:

```
speccle init            # record repo facts + vendor the skills into .claude/skills/
speccle doctor          # report staleness across the CLI, skills, and strength stack
speccle update          # refresh the vendored skills; print the CLI + stack fix commands
speccle lint            # enforce the convention over a repo's specs
speccle claims          # join criteria to the test names that claim them
speccle verify          # run .speccle/checks/ over a change set: cross-file invariants
speccle risk            # score a change set from spec-aware signals; gate on the threshold
speccle calibrate       # record / report the calibration evidence a threshold moves on
speccle remedy          # record / recall the known remedy for a class of finding
speccle review init     # scaffold the opt-in CI review driver (a GitHub Actions workflow)
speccle review run      # review a pull request with the lens panel and post one review
speccle strength        # oracle-strength heatmap: per-criterion killed ÷ covered
speccle strength init   # provision the strength stack into a target
```

- `init` / `doctor` / `update` — the setup and staleness surface: `init` records the
  repo's test facts in `.speccle/config.json` and vendors the skills into
  `.claude/skills/`; `doctor` reports whether those skills and the strength stack still
  match this CLI; `update` refreshes the skills forward and prints the CLI + stack fix
  commands. See [Install](https://github.com/matthewalton/speccle/blob/main/README.md#install)
  and [Updating](https://github.com/matthewalton/speccle/blob/main/README.md#updating).
- `lint` — enforce the [convention](https://github.com/matthewalton/speccle/blob/main/docs/convention.md) over a repo's specs.
- `claims` — join every criterion to the test names carrying its id, statically. No
  reports needed, so it is cheap enough to gate on.
- `verify` / `risk` — the change-set surface. Both read the working tree's pending change
  by default, or a committed range with `--base <ref>`, measured at the merge base — which
  is what a CI run needs, where the working tree is clean. `risk` exits 1 at or above the
  review threshold, so it works as a status check.
- `calibrate` / `remedy` — the meta loop's two records: the evidence a review threshold
  moves on, and the known-correct remedy for a class of finding.
- `review init` / `review run` — the CI driver. See [review](#review) below.
- `strength` — join specs + Stryker mutation report + coverage into per-criterion
  `killed ÷ covered`.
- `strength init` — the setup `strength` measures against: install the stack's
  devDependencies and write the preset configs.

The bin is named after the package; every command is an explicit subcommand (a bare
invocation is a usage error, exit code 2). `strength` names the measurement — oracle
strength — not the heatmap rendering of it.

Every command here but one is a **Speccle tool**: deterministic, independently runnable,
emits typed JSON, never calls an LLM (see [CONTEXT.md](https://github.com/matthewalton/speccle/blob/main/CONTEXT.md)).
The exception is `review run`, the CI driver, which calls a model by definition.

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

## review

The outer loop has two drivers. The **local driver** is the `review` skill: it fans the
lenses as subagents in a session and needs no key. The **CI driver** is these two commands,
and it is **opt-in**, because it needs a metered `ANTHROPIC_API_KEY`.

```sh
speccle review init [path] [--json]
```

Writes one file — `.github/workflows/speccle-review.yml` — pinned to the version of the CLI
that wrote it. Nothing else is vendored: the driver ships in this tarball and the workflow
fetches it from npm, so the code doing the reviewing never comes from the branch under
review. Re-running moves the pin, which is how a repo updates the driver.

```sh
speccle review run --pr <number> [path] [--repo <owner/name>] [--base <ref>]
                                        [--force] [--model <id>] [--dry-run] [--json]
```

Fans every lens in `.speccle/lenses/` over the pull request's change set — one model call
per lens, findings forced into shape by a tool schema — and posts them as a single review
with inline comments. It **finds and comments only**: it never edits the tree, commits, or
pushes, because a fix has to re-run the checks-gate and be revertible, which is the local
driver's job.

- Skips `risk.md` (it escalates authority rather than reporting findings) and an unauthored
  `house-conventions.md`, exactly as the local driver does.
- Posts one automatic review per pull request, recognised by a marker in its own body;
  `--force` overrides that, which is what the workflow's `@review` rerun path passes.
- A finding that cannot anchor to a line in the diff is carried in the summary rather than
  dropped, and if GitHub rejects the anchors outright the retry carries every finding in
  the body.
- Reads `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` from the environment; `--dry-run` reports
  what would be posted and posts nothing. The default model is overridable with
  `SPECCLE_REVIEW_MODEL`.

The risk verdict leads the summary, and the workflow runs `speccle risk --base` as its own
step so the **status check stays deterministic** — it survives a bad API day. Whether a
failing check blocks the merge is branch protection: GitHub's setting, the repo's call.

This is the one command here that calls a model
([ADR-0047](https://github.com/matthewalton/speccle/blob/main/docs/adr/0047-the-ci-driver-ships-in-the-tarball-and-is-the-one-llm-caller.md)).

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
