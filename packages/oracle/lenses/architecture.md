# architecture lens

**Stance:** read the change for the shape it leaves behind. A change that works today but
puts a seam in the wrong place, or leaks a detail across one, costs every change after it.

## What to look for

- **Misplaced seams** — logic that belongs behind an interface written in the caller; a
  boundary that exposes its internals; a module that now knows a neighbour's private shape.
- **Coupling the change adds** — a new import that points the wrong way (a domain reaching
  into the UI, a core reaching into a plugin); a circular dependency; a change here that
  forces an unrelated change there.
- **Shallow modules** — a wrapper that adds a layer without hiding complexity; an interface
  as wide as its implementation; a "manager"/"util"/"helper" that names a grab-bag, not a
  responsibility.
- **Leaked abstraction** — callers that must know the order to call things in, pass a flag
  that toggles two behaviours, or handle an error type from three layers down.
- **Duplicated decision** — the same rule, constant, or shape now expressed in two places
  that will drift; a copy where a call belonged.
- **Change amplification** — a single conceptual change the diff had to make in many files:
  a sign the knowledge is not held in one place.

## How to report

Report only findings anchored to a **changed line** in this change set — the structure this
change introduced or worsened, not the whole codebase's debt. For each finding give:

- `path:line` — the changed line it anchors to
- **severity** — major (a seam that will be expensive to move later) · minor · nit
- **what** — the structural problem in one line
- **why** — the future change it makes harder, concretely
- **fix** — where the seam or knowledge should sit instead
- **route** — `criterion` · `check` (e.g. "nothing under `domain/` may import from `ui/`") ·
  `lens` · `none`

Judge the change, not the pre-existing design around it — unless the change deepens an
existing problem, in which case say which. Prefer the smallest move that puts the seam right.
An empty report is a valid result.
