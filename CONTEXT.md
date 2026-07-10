# Speccle

The shared language of Speccle — a Claude Code plugin for building features as vertical
slices, backed by deterministic tooling. This file is the canonical glossary: every
README, ADR, and skill uses these terms and defers here rather than redefining them.
It is a glossary only — no implementation detail, no usage.

## Language

**Feature**:
A directory subtree owning one vertical slice: its `SPEC.md`, its `CONTEXT.md`, and the
code and tests that satisfy them, colocated. The unit acceptance criteria attach to.
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
its key, and an id is never renumbered or reused.
_Avoid_: tag, label, reference.

**Feature CONTEXT.md**:
The per-feature file holding the feature's domain language (terms, entities, avoided
synonyms) and decisions that span criteria. If it's about a word or a cross-cutting
choice, it lives here; if it's about one behaviour, it lives in that criterion's body.
_Avoid_: docs, notes, wiki page.

**Ratify pause**:
The mandatory stop in `implement-feature` between drafting the criteria and writing any
test or code: the human owns the criteria, and this pause is where that ownership lives.
_Avoid_: review step, confirmation, approval gate.

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
no criterion promises it, so it is a _spec_ problem — draft a sharper criterion and a
human ratifies it. A third exit, the **equivalent mutant**, is a mutant no test could
ever detect; it is annotated in the source, and it is rare
([ADR-0012](docs/adr/0012-strengthen-routes-on-the-survivor-not-the-score.md)).
_Avoid_: auto-fix / manual, fast path / slow path.

**Test-fitting**:
Writing an assertion that pins a surviving mutant's exact behaviour when no criterion
promises it — killing the mutant while defending nothing. The failure mode `strengthen`'s
routing exists to prevent.
_Avoid_: gaming the score, overfitting (unqualified).

**Speccle tool**:
A component that is deterministic, independently runnable, emits typed JSON, and
**never calls an LLM**. Trust comes from the tools; judgement comes from the skills.
Everything in `packages/oracle` is a Speccle tool.
_Avoid_: plugin (that's the skills package), service.

**Lint violation**:
A single deterministic rule finding from `oracle lint` — rule id, line, message. There
is one severity and no configuration: a spec either lints clean or it does not.
_Avoid_: error, warning, issue.
