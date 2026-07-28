# speccle

The deterministic tooling the skills invoke — one bin:

```
speccle init            # record repo facts + vendor the skills into .claude/skills/
speccle doctor          # report staleness across the CLI, skills, CI driver, and strength stack
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
  `.claude/skills/`; `doctor` reports whether those skills, the CI driver's pinned
  version, and the strength stack still match this CLI; `update` refreshes the skills
  forward and prints the CLI + stack fix commands. See
  [Install](https://github.com/matthewalton/speccle/blob/main/README.md#install)
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

With no `--dialect`, the dialect comes from `.speccle/config.json`, resolved **per spec
folder** — so a mixed-language tree is joined in one pass, each slice under its own dialect
(the config's longest matching `overrides` path wins). `--dialect` forces one dialect across
every folder instead. The report names every dialect in play, and each feature the one its
folder joined under:

```
ios/ladder/SPEC.md  (swift)
  LADDER-1  1 test name  A rung raises the climber by one
web/basket/SPEC.md  (ts-vitest)
  BASKET-1  1 test name  When an item is added, its line quantity increments by exactly 1

swift, ts-vitest — 2 spec files, 2 criteria, 2 claimed, clean
```

Names are read statically, so a name built dynamically shows up as unclaimed — the
failure mode is a false alarm, never a silent pass. `--json` emits the typed
`ClaimsReport` (see [`src/claims.ts`](src/claims.ts)). Exit codes: `0` every criterion
claimed and no unknown claims, `1` otherwise, `2` usage error.

## verify

```sh
speccle verify [path] [--json] [--base <ref>]
```

Runs every check in `.speccle/checks/` over a **change set**. Its reason to exist is the
class of invariant no linter can hold, because the fact is about the whole change rather
than any one file: _a changed `@Model` requires a round-trip test in the same change._

One check, one JSON file:

```json
{
  "when": { "path": "features/**/src/*.ts", "contains": "@Model" },
  "require": { "path": "features/**/src/*.test.ts", "contains": "roundTrip" },
  "message": "a changed @Model needs a round-trip test in the same change",
  "because": "PR #412 shipped a schema change with no round-trip coverage"
}
```

`when` is the trigger — absent means always enforced, and a check whose trigger never fires
reports as **inactive**, not as a pass. Then exactly one requirement: `require` breaches when
no changed file matches it, `forbid` breaches when any does, naming the offenders. Each is a
**predicate** — a glob over root-relative posix paths (`**` spans directories), optionally
narrowed by a `contains` regex the file's current content must match. `because` records the
finding that created the check and prints on breach, so a breach still explains itself a year
later.

```
model-roundtrip  a changed @Model needs a round-trip test in the same change
  because PR #412 shipped a schema change with no round-trip coverage

1 check, 1 breach
```

The change set is the working tree's pending change by default, or the commits between
`--base <ref>` and HEAD, measured from their merge base — what a CI run needs, where the tree
is clean and the change is committed. A repo that has authored no checks passes trivially; a
malformed check file is a hard error naming the file, because a check that silently does
nothing is worse than no check at all.

`--json` emits the typed `VerifyReport` (see [`src/verify.ts`](src/verify.ts)). Exit codes:
`0` no breach, `1` at least one breach, `2` usage error.

## risk

```sh
speccle risk [path] [--json] [--base <ref>] [--dialect <name>]
```

Scores a change set from spec-aware signals — facts only Speccle can see, because only
Speccle knows which code is governed by which spec. The score decides **how supervised the
change is**: at or above the review threshold a human is required, and review stops at
findings instead of fixing unasked.

Four baseline signals ship with the CLI and apply in every repo unmodified:

| signal               | weight | fires on                                                              |
| -------------------- | -----: | --------------------------------------------------------------------- |
| `criterion-retired`  |      4 | a criterion vanished from a changed `SPEC.md`                         |
| `spec-silent-change` |      3 | production source changed in a governed slice whose `SPEC.md` did not |
| `unclaimed-change`   |      3 | changed code lives in a slice with a criterion no test claims         |
| `criterion-reworded` |      2 | a criterion's statement changed                                       |

```
spec-silent-change  +3  production source changed in a governed slice whose SPEC.md did not
  features/checkout/src/checkout.ts
unclaimed-change  +3  changed code lives in a slice with a criterion no test claims
  CHECKOUT-2

score 6 ≥ threshold 3 — human required, review stops at findings
this score is a floor — a risk lens may escalate it, never lower it
```

Every fired signal carries its evidence — the files, criterion ids, or slices it fired on —
so the number is auditable rather than asserted. The score is a **floor**: a risk lens reading
the change may escalate beyond it, never below it.

The default review threshold is `3`, deliberately low, so most changes are supervised. A repo
may reweight in `.speccle/risk.json` — the one sanctioned piece of configurable judgement here,
because what counts as consequential really is repo-specific:

```json
{
  "threshold": 4,
  "weights": { "criterion-reworded": 0 },
  "signals": [
    {
      "id": "migration-without-rollback",
      "weight": 5,
      "when": { "path": "db/migrations/*.sql" },
      "message": "a migration changed",
      "because": "the incident on 2026-03-02"
    }
  ]
}
```

A `0` weight mutes a baseline signal, and a muted signal is not computed at all. Only a human
edits this file, and a malformed one is a hard error rather than a silently-ignored weight —
a quietly dropped signal is exactly the invisible reduction of supervision the score exists to
prevent.

Whether a changed file is production source or a test is a per-path question, and
`spec-silent-change` answers it from `.speccle/config.json`, resolved **at each changed file's
own path** — so in a mixed tree an `ios/` slice's `PlayerTests.swift` reads as a test even
where the repo defaults to `ts-vitest`. `--dialect` forces one dialect across every path instead.

`--base` moves both the change set and the criterion baseline to the merge base. That pairing
is load-bearing: on a branch, HEAD already contains the change, so diffing a changed `SPEC.md`
against HEAD would compare it with itself and no criterion would ever read as retired or
reworded.

`--json` emits the typed `RiskReport` (see [`src/risk.ts`](src/risk.ts)). Exit codes: `0`
below the review threshold (review may fix and report), `1` at or above it (a human is
required), `2` usage error. Exit `1` is the verdict, not a failure — it is what makes the
command usable as a status check.

## calibrate

```sh
speccle calibrate record [path] --needed-human <true|false> --found-real <true|false>
                                [--base <ref>] [--floor <score>] [--escalated]
                                [--note <text>] [--dialect <name>] [--json]
speccle calibrate report [path] [--json]
```

The evidence a review threshold moves on. `record` appends one line to
`.speccle/calibration.jsonl` per reviewed change: `risk` computes the deterministic floor —
score, threshold, the signals that fired — and the caller supplies the honest human verdict.

The two are recorded side by side and never conflated, which is the whole point. `--needed-human`
and `--found-real` are required and never defaulted, because recording the gate's verdict as if
it were the human's produces exactly the dishonest data a threshold must not rise on.

```
recorded .speccle/calibration.jsonl — 1 entry
  score 6 vs threshold 3 — floor required a human — measured on the working tree
  verdict: needed a human, found something real
  signals: spec-silent-change, unclaimed-change
```

`--base` and `--floor` keep the entry bound to the change that was actually reviewed. The floor
is measured **when `record` runs**, so a review that fixes what it found — or that reviewed a
committed branch, which a clean working tree does not contain — would otherwise score a different
change set and file the human's verdict against signals that never fired on it. `--base <ref>`
measures the same committed range the review gated on, and the entry names it. `--floor <score>`
asserts the score the review gated on: it is checked, never recorded, so it cannot fabricate a
floor — it can only refuse one that has moved.

```
this change set scores 3, but the review gated on 2 — the change set has moved since, so this
entry would describe a change nobody reviewed. Name the reviewed change set with a base ref,
or record it before applying fixes
```

Refusing is the point. A wrong entry is not weak evidence, it is false evidence, and `report`
cannot tell afterwards — so the record stays one entry short rather than one entry wrong.

`report` reads the record back and answers three questions arithmetically: which signals fired
but never on a change that mattered, which fired on every change that genuinely needed a human,
and what threshold the record would support.

```
1 reviewed change — 1 needed a human, floor gated 1

  spec-silent-change  1/1 mattered — on every change that needed a human
  unclaimed-change    1/1 mattered — on every change that needed a human

proposals — evidence, not instructions (only a human reduces supervision):
  spec-silent-change and unclaimed-change fired on every change that needed a human — reliable so far
  the record would support a review threshold up to 6 (now 3) — only a human may raise it
```

`supportedThreshold` is the cheapest change that needed a human — conservative on purpose,
since a floor any higher would have missed it. Escalation is excluded from that arithmetic: a
safety net must never be the reason a floor sits high. Two counters name the failure directions
in plain terms — `floorMisses` (needed a human, and neither the floor nor a lens caught it) and
`overSupervised` (the floor gated a change the verdict says was fine).

The report **proposes and never applies**. Nothing here edits `.speccle/risk.json`; only a
human reduces supervision.

`--json` emits the typed `RecordReport` / `CalibrationReport` (see
[`src/calibration.ts`](src/calibration.ts)). Both subcommands exit `0` whenever they produced a
report — the verdict is `risk`'s job — and `2` on a usage error, including a missing verdict
flag or a malformed record line, which is reported with its line number rather than skipped.

## remedy

```sh
speccle remedy record [path] --class <handle> --finding <text> --fix <text>
                             --route <check|criterion|lens|none> [--artefact <ref>]
                             [--note <text>] [--json]
speccle remedy recall [path] --class <handle> [--json]
```

The memory that makes a repeat finding get the same answer twice. `record` appends one line to
`.speccle/remedies.jsonl`: what the finding was, the fix applied to the code this time, and the
**prevention route** chosen so the class stops recurring.

| route       | prevention artefact            |
| ----------- | ------------------------------ |
| `check`     | a `.speccle/checks/` path      |
| `criterion` | a `SPEC.md` criterion id       |
| `lens`      | a `.speccle/lenses/` path      |
| `none`      | names none — an honest one-off |

Every route but `none` must name its `--artefact`: a record is only worth consulting if it
points at the prevention it chose. `none` is the honest escape — a finding whose class is not
worth preventing prevents nothing, and must not pretend otherwise.

```
recorded .speccle/remedies.jsonl — 1 remedy
  missing-model-roundtrip-test: a changed @Model shipped with no round-trip test
  fix: added a round-trip test over the changed model
  remedy: check → .speccle/checks/model-roundtrip.json
```

`recall` looks a class up before routing a finding fresh. Matching is deterministic on the
class handle's tokens — lowercased alphanumeric runs — and an entry matches when one side's
tokens are a subset of the other's, so `missing-roundtrip` still recalls
`missing-model-roundtrip-test`. Most-recent first: the latest answer to a class wins.

```
1 prior remedy for "missing-roundtrip" — reuse to fix consistently:

  missing-model-roundtrip-test  (2026-07-24T19:39:15.815Z)
    finding: a changed @Model shipped with no round-trip test
    fix: added a round-trip test over the changed model
    remedy: check → .speccle/checks/model-roundtrip.json
```

The `--class` handle is the reviewer's judgement, not the tool's — it only stores and retrieves,
the same honesty split `calibrate` draws around the human verdict.

`--json` emits the typed `RemedyRecordReport` / `RemedyRecallReport` (see
[`src/remedy.ts`](src/remedy.ts)). Both subcommands exit `0` whenever they produced a report,
**including a recall that matched nothing** — no prior remedy is an answer ("route it fresh,
then record it"), not a failure. `2` is a usage error: a missing required flag, an unknown
route, an artefact on a `none` remedy, or a malformed record line, reported with its line
number rather than skipped.

## strength

```sh
speccle strength [path] [--json] [--mutation <file>] [--coverage <file>]
```

Joins three inputs into one number per **acceptance criterion**: the `SPEC.md` files under
`path`, a StrykerJS mutation report, and an Istanbul `json-summary`. A test claims a
criterion by carrying its `[KEY-n]` token anywhere in its full concatenated name, describe
titles included.

This is the one command bound to a single **test dialect**. The join has to know which
tests covered each mutant — nothing else can credit a kill to a criterion — and only
StrykerJS produces that, so `strength` scores a `ts-vitest` repo and no other. On a
dialect it cannot score, `doctor` reports the stack as `not applicable` rather than
nagging toward `strength init`. Every other command — `lint`, `claims`, `verify`,
`risk` — is multi-language regardless.

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
lenses as subagents in a session and needs no key. The **CI driver** is `init` and `run`
below, and it is **opt-in**, because it needs a metered `ANTHROPIC_API_KEY`. `findings` is
how the first reads what the second posted.

```sh
speccle review init [path] [--json]
```

Writes one file — `.github/workflows/speccle-review.yml` — pinned to the version of the CLI
that wrote it. Nothing else is vendored: the driver ships in this tarball and the workflow
fetches it from npm, so the code doing the reviewing never comes from the branch under
review. Re-running moves the pin, which is how a repo updates the driver.

`doctor` reports that pin as its `driver` row, so a workflow left behind on an old version
shows up as stale rather than sitting there unnoticed; a repo that never opted in reads
`not installed` and is not a failure. `update` moves the pin **only when the workflow is
already there** — it will not scaffold one, because opting a repo into a driver that spends
a metered key per run has to be deliberate.

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

This is the one command here that calls a model.

```sh
speccle review findings --pr <number> [path] [--repo <owner/name>] [--json]
```

Reads back the review the CI driver posted, so the local driver fixes the findings CI already
paid for instead of running a second panel that can reach a different answer on the same
commit. It **calls no model** — it reads the review, recognised by the same marker `run`
stamps on it, and parses each inline comment back into the finding it was rendered from.

- Returns the **latest** review the driver posted; a rerun's findings replace the ones it
  supersedes.
- Reports `base` — the ref the change set was measured against — so `risk` and
  `calibrate record` measure the same change set the review did.
- Reports `stale` when the head has moved since the review, because a finding may then name a
  line that no longer exists.
- A finding the review could not anchor to a line comes back marked `partial`: the summary
  body is its whole record, so it carries no fix or remedy, and saying so beats returning
  empty fields.
- A comment on the review that no lens wrote — a human's reply — is left alone and counted.
- Resolves the repository from `--repo`, then `GITHUB_REPOSITORY`, then the `origin` remote;
  and the token from `GITHUB_TOKEN`, then `gh auth token`. The last rung of each is what a
  human standing in a clone needs, and CI never reaches it.

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

It also reports a `speccle-oracle` devDependency as **superseded** — the name this CLI
published under before 0.11.0. A repo provisioned back then keeps that package beside the
current one, exposing a stale binary in `node_modules/.bin/`. Init names the removal
command and stops there: your `package.json` is yours to change.

Both init commands warn (best-effort, via `~/.claude/settings.json`) when the target
vendors the speccle skills project-level in `.claude/skills/` while a user-level speccle
plugin is still enabled — two copies of every skill would load. `speccle init` is the run
that vendors them, so it warns too rather than leaving the discovery to a `strength init`
a contract-only user may never run.

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
