# Plan lenses

A **plan lens** is a lens aimed at a slice that has not been built yet. It reads the plan and
the slice's markdown — not a diff; at plan time there isn't one — and its findings join the
**plan summary**, the one screen a human rules on before the pipeline starts building.

Everything in this directory is yours. Speccle ships no plan lens, never overwrites what you
write here, and never deletes it. Nothing runs until you author one.

## What it is for

The thing worth saying while the plan is still cheap to change: _this slice's shape does not
fit our design system_, _this is the third slice to own its own retry policy_, _this belongs
behind the boundary we agreed last quarter_. Judgement about the shape of the work, from a
reader who knows this repo.

A finding here is **advice, never a veto**. It reaches a human, who decides. What must
actually stop a stage is deterministic and lives in `../../checks/` — an opinion that blocks a
build is unfalsifiable, and a green that means something different in every repo is not a
green.

## The shape

One lens, one markdown file — the same three parts a review lens has:

```markdown
# design-system lens

**Stance:** a slice that renders anything must compose the design system, not restate it.

## What to look for

- A planned component that duplicates a primitive we already ship.
- A slice inventing its own spacing, colour, or typography scale.
- A surface named in the scope with no matching entry in the pattern library.

## How to report

- **where** — the plan element it anchors to: the scope line, a key decision, or a file
- **severity** — major · minor · nit
- **what** — what does not fit, in one plain sentence
- **why** — the convention or precedent it crosses
- **suggest** — the shape you would plan instead
```

Anchor a finding to something in the plan — a scope line, a key decision, a file the slice
already has. A lens that finds nothing returns nothing, which is the common result.

## What it reads

The plan as it stands (route, feature folder, key, scope, and each key decision and how it
was settled) plus whatever markdown the slice already has: `CONTEXT.md`, `CLAUDE.md`,
`decisions/`, and `SPEC.md` on an amend. On a new slice there is very little on disk yet —
that is the point of judging it now.

## Where they run

`plan-feature` fans them out as subagents in its own session, one per lens, in parallel,
after the decisions are captured and before it writes the summary. No API key, and no run at
all in a repo that has authored none.

An unattended session cannot approve anything, but it still writes the summary and it is
still read later — so the findings go in it just the same. They never gate and never block.

---

This file is documentation. Every _other_ `*.md` here is run as a lens, so `README.md` is the
one name excluded — and the review panel never looks in this directory at all.
