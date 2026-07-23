# Speccle

The shared language of Speccle — a Claude Code plugin for building features as vertical
slices, backed by deterministic tooling. This file is the canonical glossary: every
README, ADR, and skill uses these terms and defers here rather than redefining them.
It is a glossary only — no implementation detail, no usage.

## Language

**Feature**:
A directory named for the feature, owning one vertical slice: the markdown contract at
its root — `SPEC.md`, `CONTEXT.md`, `AGENTS.md`, `decisions/` — and the code and tests
that satisfy it in `src/`
([ADR-0019](docs/adr/0019-a-feature-folder-is-named-and-has-a-fixed-shape.md)). The
unit acceptance criteria attach to.
_Avoid_: module, component (unqualified), epic.

**Acceptance criterion**:
One testable behaviour of a feature, written as an H2 heading in `SPEC.md` carrying a
**criterion id** and a **statement**, with a free-form **body** below.
_Avoid_: requirement, rule, AC (unqualified prose).

**Statement**:
The single testable clause on a criterion's heading line — what lint judges for quality
and what a test defends.
_Avoid_: title, summary, description.

**Body**:
The free prose under a criterion heading — rationale, edge cases, examples. Never
linted for quality; anything about one behaviour belongs here, not in the feature's
`CONTEXT.md`.
_Avoid_: notes, details section.

**Feature key**:
The short uppercase prefix (`[A-Z][A-Z0-9]{1,9}`, e.g. `CHECKOUT`) a feature's spec
declares in frontmatter (`key: CHECKOUT`) and every one of its criterion ids carries.
Keys are unique across the repo.
_Avoid_: prefix (unqualified), namespace.

**Criterion id** (**`[KEY-n]`**):
A feature key plus a number, bracketed on the criterion's heading and in test names.
An id is a name, not an order: a new criterion takes the next never-used number under
its key, and an id is never renumbered or reused. Where a test framework offers no
string name to carry it, the id has an identifier-safe spelling — `KEY_n` — and the two
spellings are one id, not two
([ADR-0039](docs/adr/0039-a-criterion-id-has-an-identifier-safe-spelling.md)).
_Avoid_: tag, label, reference.

**Feature CONTEXT.md**:
The per-feature glossary: the feature's domain language — terms, entities, avoided
synonyms — and nothing else. About a word → here; about one behaviour → that
criterion's body; a choice spanning criteria → the feature's `decisions/`.
_Avoid_: docs, notes, wiki page.

**Feature AGENTS.md**:
The slice's agent-facing entry point, following the cross-tool convention of that name:
what the slice does, how to run its tests, where the contract lives
([ADR-0020](docs/adr/0020-every-feature-carries-an-agents-md.md)). Facts about working
the slice, never about its behaviour.
_Avoid_: readme (for this file), runbook.

**Feature decision**:
A choice spanning a feature's criteria, recorded as a numbered ADR file in the
feature's `decisions/` folder — same form as the repo's own `docs/adr/`
([ADR-0021](docs/adr/0021-feature-decisions-are-adrs-context-md-is-glossary-only.md)).
_Avoid_: mini-ADR, design note, decision bullet.

**Key decision**:
A choice a feature request leaves open, with more than one viable answer, that
materially shapes the slice across criteria — a policy, a data shape, an external
contract. `plan-feature` puts each one to the human one question at a time, each with
a recommendation, and captures the settled choice into the slice's docs the moment it
lands ([ADR-0027](docs/adr/0027-plan-feature-settles-key-decisions-with-the-human.md),
[ADR-0036](docs/adr/0036-planning-grills-conditionally-and-gates-once-via-plan-mode.md)).
In an unattended run the recommendation is taken and the decision is flagged as
**defaulted**, never silent.
_Avoid_: open question (unqualified), assumption, TBD.

**Amend**:
The route for behaviour that belongs to an existing governed slice: the contract
changes in place — new criteria take the next never-used numbers (extending the
slice), existing statements are reworded, a retired behaviour retires its id — and
the slice's existing vocabulary is adopted, never re-invented
([ADR-0023](docs/adr/0023-plan-feature-routes-new-amend-or-carve.md)). The sibling
routes are **new** (no slice owns the behaviour yet) and a **carve** (it already runs
ungoverned).
_Avoid_: extend (as a distinct mode), edit, update, modify (for spec changes).

**Carve**:
Bringing an existing, ungoverned region of code under the convention: `SPEC.md` and
`CONTEXT.md` derived from its observed behaviour, existing tests tagged with criterion
ids, unclaimed criteria given new tests — with the code's behaviour unchanged
throughout ([ADR-0017](docs/adr/0017-carve-feature-specs-observed-behaviour-and-changes-no-code.md)).
_Avoid_: retrofit, migration, backfill.

**Conform**:
Bringing an already-governed feature folder up to the convention as it stands today,
after the convention changes: form only — folder shape, contract files, statement
wording where a lint rule demands it — while behaviour, criterion ids, and criterion
meaning never change
([ADR-0024](docs/adr/0024-conform-updates-governed-slices-to-the-current-convention.md)).
_Avoid_: migrate, upgrade, modernise (for this operation).

**Spec summary**:
The report every skill ends with when it drafted, amended, or retired a criterion:
each change listed by id and statement, plus, for a carve, every finding and how it
was defaulted. Human ownership of the criteria lives here — exercised by amending or
overruling after the fact, never by a blocking pre-approval. Skills announce criteria
the moment they lint clean and keep going
([ADR-0018](docs/adr/0018-skills-announce-criteria-and-end-with-a-spec-summary.md)).
_Avoid_: ratify pause, approval gate, confirmation, sign-off.

**Checks-gate**:
The deterministic close of the `feature` pipeline: `oracle lint`, `oracle claims`,
and the project's test suite, run by the orchestrator with no subagent and no
judgement. A failure returns the run to the implement stage, never to the human; on
green the one-screen summary renders and the commit happens without asking
([ADR-0035](docs/adr/0035-a-deterministic-checks-gate-and-auto-commit-close-the-pipeline.md)).
_Avoid_: review step, review gate, quality gate.

**Claim**:
The link between a test and a criterion: a test claims a criterion when the `[KEY-n]`
token appears in its full concatenated name
([ADR-0004](docs/adr/0004-tests-claim-criteria-in-the-full-test-name.md)).
`oracle claims` reads the join statically from test-file titles — no reports —
which is what makes the checks-gate seconds cheap. What counts as a test file, and what
counts as its name, is the **test dialect**'s business.
_Avoid_: link, mapping, coverage (for this relationship).

**Test dialect**:
The per-language knowledge Speccle carries about a test stack: which files are tests,
and how a test's full name is read. Dialects are named and owned by Speccle — a repo
declares which dialect it is on, never how that dialect works — so a clean `claims` run
means the same thing in every repo
([ADR-0038](docs/adr/0038-test-dialects-make-speccle-multi-language-not-agnostic.md)).
Speccle is multi-language across a supported set, not language-agnostic: an unsupported
stack is unsupported, visibly.
_Avoid_: adapter, language plugin, runner config, language-agnostic (of Speccle).

**Code voice**:
Statement language that reads as implementation rather than product — a code span, a
file path, an identifier. Statements speak product, When/Then by default; code-level
precision lives in the criterion body, and the `code-voice` lint rule polices the
boundary
([ADR-0032](docs/adr/0032-criterion-statements-are-product-voiced-when-then.md)).
_Avoid_: technical language, jargon (for this lint concept).

**Report freshness**:
`strength --check`'s verdict on the mutation and coverage reports: **fresh** when a
report post-dates every file in the spec folders, **stale** when a slice edit
post-dates it, **missing** when absent — plus **evaluated**, meaning the current
heatmap was already read (the marker beside the mutation report). The human runs the
commands that refresh reports; skills only evaluate
([ADR-0033](docs/adr/0033-strengthen-leaves-the-feature-loop-and-evaluates-human-run-reports.md)).
_Avoid_: outdated, expired, up-to-date (for these verdicts).

**Oracle strength**:
The fraction of the mutants a criterion's tests execute that the suite kills
(`killed ÷ covered`), per criterion and as one headline number. The measure of whether
tests _defend_ code, as opposed to merely executing it. A kill counts for every criterion
covering that mutant, not only the one whose test detected it
([ADR-0011](docs/adr/0011-oracle-strength-credits-a-kill-to-every-covering-criterion.md)).
_Avoid_: test strength, mutation score (as a synonym), quality score.

**Surviving mutant**:
A code change the mutation run made that no test noticed. The unit of a weak criterion:
oracle strength below 100% means at least one survivor, and each one names the exact
edit — file, line, mutator, replacement — that went undetected.
_Avoid_: escaped mutant, missed mutation, failure.

**Static mutant**:
A mutant that runs at module load (a word list, a regex literal), so per-test coverage
cannot attribute it to any test and no criterion can claim it. `strength` reports these
apart — killed as a count, survivors by site — never as unclaimed mutants.
_Avoid_: uncovered mutant, module-level mutant.

**Line coverage**:
The naïve baseline — the percentage of lines executed by the tests, shown alongside
oracle strength precisely so the gap between them is visible. Coverage is not strength.
_Avoid_: using "coverage" alone to mean strength.

**Machine path / human path**:
The exits `strengthen` routes a surviving mutant down — never a criterion, and never a
score. **Machine path**: the criterion's statement already promises the behaviour the
mutant breaks, so it is a test gap — write the killing test and re-run. **Human path**:
no criterion promises it, so it is a _spec_ problem — draft a sharper criterion,
announce it, and test the survivor under the new id; the human overrules it in the
spec summary if it does not belong. A third exit, the **equivalent mutant**, is a mutant no test could
ever detect; it is annotated in the source, and it is rare
([ADR-0012](docs/adr/0012-strengthen-routes-on-the-survivor-not-the-score.md)).
_Avoid_: auto-fix / manual, fast path / slow path.

**Test-fitting**:
Writing an assertion that pins a surviving mutant's exact behaviour when no criterion
promises it — killing the mutant while defending nothing. The failure mode `strengthen`'s
routing exists to prevent.
_Avoid_: gaming the score, overfitting (unqualified).

**Inner loop / outer loop / meta loop**:
The three nested loops Speccle is built as.
**Inner loop** — `edit · run · check` — is the `feature` pipeline, with the checks-gate
as its `check`; it drives autonomy.
**Outer loop** — `test · lint · review` — runs on a change set rather than a slice; it
drives automation.
**Meta loop** reads what the outer loop found and ships prevention back down into the
other two, owning the **remedy record** and the **calibration record**; it drives quality
([ADR-0043](docs/adr/0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)).
_Avoid_: stage, phase, cycle.

**`.speccle/`**:
The repo-root folder Speccle reads **repo facts** from — the test dialect, the suite
command and per-path overrides in `config.json`, plus `lenses/`, `checks/` and the risk
policy. A repo fact is something Speccle cannot know and there is nothing to game; it is
never judgement. `init` auto-detects and then writes the result down, and the written
record is the source of truth, never the detection
([ADR-0040](docs/adr/0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md)).
_Avoid_: config (unqualified), settings, knobs.

**Lens**:
One dimension a review looks along — accessibility, architecture, security, a repo's own
conventions — written as a markdown prompt: a stance, what to look for, how to report.
Speccle ships a baseline set; a repo's house-conventions lens is its own. A lens is the
dimension, independent of whether it runs in a local session or in CI.
_Avoid_: agent, reviewer, rule, check, rubric.

**Finding**:
One thing a lens reports, anchored to a changed line. A finding is fixed in the code and
then **routed** to a durable artefact so the class cannot recur: a new acceptance
criterion, a deterministic check, or a sharpened lens — the same posture `strengthen`
takes to a surviving mutant, routed on what the finding is and never on a count.
_Avoid_: issue, comment, violation (that's lint), defect.

**Remedy**:
The known-correct response to a class of finding: the fix applied to the code, plus the
prevention artefact that stops the class recurring — an `oracle verify` check, a new
acceptance criterion, or a sharpened lens. The meta loop chooses which, per finding, and
logs it in the **remedy record**, which it consults to fix consistently next time
([ADR-0043](docs/adr/0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)).
_Avoid_: fix (alone), patch, resolution, rule.

**Remedy record**:
The meta loop's durable log of each finding, the fix applied, and the prevention artefact
chosen for it. Memory, not policy: the loop consults it to answer a repeat finding the
way it answered the first one
([ADR-0043](docs/adr/0043-review-is-the-outer-loop-the-meta-loop-routes-remedies-home.md)).
_Avoid_: changelog, backlog, knowledge base.

**Verify check**:
A deterministic invariant `oracle verify` enforces in the checks-gate — path scope, a
required or forbidden pattern, and the finding it came from — held in `.speccle/checks/`.
Its reason to exist is the invariant no linter can express: cross-file and whole-change
relationships. A Speccle tool: no LLM.
_Avoid_: lint rule, linter rule, assertion, verifier.

**Risk signal**:
One deterministic fact about a change that contributes to its risk score — including ones
only Speccle can see: behaviour changed in a governed slice whose `SPEC.md` did not,
a criterion retired, changed code no test claims. Speccle ships a baseline set; a repo
adds its own in its **risk policy**.
_Avoid_: criterion (reserved for acceptance criteria), rule, heuristic, factor.

**Risk policy**:
A repo's declared risk signals and their weights, plus its **review threshold**, held in
`.speccle/`. The one sanctioned exception to "no configurable judgement": what counts as
consequential is irreducibly repo-specific, so Speccle cannot own it — but only a human
moves a weight or the threshold, and only on calibration evidence
([ADR-0041](docs/adr/0041-risk-gates-fix-authority-deterministic-floor-lens-escalates.md)).
_Avoid_: risk config, rules, policy (unqualified).

**Risk score**:
The weighted sum of the risk signals a change fires, computed deterministically with no
LLM. It is a **floor**: a risk lens may escalate it for subtlety no signal catches, and
may never lower it. At or above the **review threshold** a human is required and `review`
stops at findings; below it, `review` fixes and reports
([ADR-0041](docs/adr/0041-risk-gates-fix-authority-deterministic-floor-lens-escalates.md)).
_Avoid_: risk level, severity, confidence.

**Calibration record**:
The durable log of every reviewed change — score, signals fired, any escalation, and the
human's actual verdict — and the evidence base for moving signal weights and the review
threshold. Speccle reports on it; only a human acts on it, because nothing that reduces
supervision may apply itself
([ADR-0042](docs/adr/0042-calibration-proposes-only-the-human-reduces-supervision.md)).
_Avoid_: training data, model, history, feedback loop.

**Speccle tool**:
A component that is deterministic, independently runnable, emits typed JSON, and
**never calls an LLM**. Trust comes from the tools; judgement comes from the skills.
Everything in `packages/oracle` is a Speccle tool.
_Avoid_: plugin (that's the skills package), service.

**Lint violation**:
A single deterministic rule finding from `oracle lint` — rule id, line, message. There
is one severity and no configuration: a spec either lints clean or it does not.
_Avoid_: error, warning, issue.
