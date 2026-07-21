# 0037 — a slice's src may nest into purpose-named subfolders

- Status: accepted
- Date: 2026-07-22
- Amends [ADR-0019](0019-a-feature-folder-is-named-and-has-a-fixed-shape.md)

## Context

[ADR-0019](0019-a-feature-folder-is-named-and-has-a-fixed-shape.md) fixed the feature
folder's shape and required all code to sit flat in `src/`, one level down. Flatness
was chosen for uniformity: every slice's `src/` looks identical, so an agent never has
to learn a slice's internal geography.

That bet pays off while a slice is small and breaks once it grows. A `src/` of twenty
files is no longer "uniform and simple" — it is a pile you scroll, and the navigability
the flatness was buying is gone. The pile is often a signal that the slice is
over-scoped and should split into siblings, but not always: a genuinely cohesive
feature can still carry enough files that grouping them aids navigation.

Nesting inside `src/` is already mechanically supported — spec discovery walks
arbitrarily deep and the test-to-criterion join is name-based, so neither cares how
`src/` is laid out. The only thing forbidding subfolders was 0019's flat clause.

The freedom 0019 was reacting against was _whole-project_ layout freedom, which let two
Speccle projects look nothing alike. A bounded relaxation inside `src/` — shallow,
purpose-named, tests beside code — keeps a slice recognisable without reopening that
door.

## Decision

Everything 0019 fixed still holds, except the flat clause:

- A feature folder is still **named for the feature**; the root is still **pure
  markdown**; the code subfolder is still always named **`src/`**.
- **Inside `src/`, subfolders are permitted** to group code by concern. Grouping is
  soft-governed, not free layout:
  - **A file limit, not a judgement.** `src/` stays flat while it holds ten files or
    fewer directly — code and tests together, subfolders excluded. The file that would
    make it eleven triggers grouping, and the same limit applies within each subfolder.
    Ten is a round stand-in for the point past which a flat listing stops being
    scannable; it is a fixed rule, not configuration, and counting entries is something
    an agent can determine rather than weigh. A small slice never trips it.
  - **Shallow and purpose-named.** Prefer one level of subfolders named for the concern
    they hold. Deep trees are the layout freedom 0019 killed, returning by the back
    door.
  - **Tests stay beside the code they defend** — the existing rule, now applying at any
    depth: a test lives in the same subfolder as its code.

Subfolder names are the slice's own call, not a fixed vocabulary: the convention is
language-agnostic and cannot know a project's layers.

The ten-file limit is a new drift kind, so **`conform` catches it** on a sweep. An
over-full flat directory is drift like any other; conform's fix is to regroup the files
into shallow, purpose-named subfolders — a pure relocation with import and config fixes,
the same class of move it already makes taking loose code into `src/`. The one thing
conform must not do is **split the slice into siblings**: that redraws slice
boundaries, which is a re-slice and belongs to a `feature` amend, not a form fix. When
the pile reads as two behaviours rather than one crowded feature, conform still regroups
to conform the slice — the subfolders it draws are the natural split lines — and raises
the sibling split as a finding for the human, the better fix it cannot make itself.

## Consequences

- A slice that outgrows a flat `src/` has a first-class answer that is not "split it" —
  though splitting into sibling slices remains the right move when the pile is really
  two behaviours.
- 0019's uniformity guarantee weakens from "every `src/` is identical" to "every `src/`
  is shallow, purpose-named, and tests sit beside code". A reader still lands on a
  recognisable shape.
- No tooling changes: spec discovery and the claims join already ignore `src/` layout.
- `implement-feature` carries the ten-file limit, since it is the skill that creates
  files; `conform` carries it for slices that already exist, extending its drift set
  ([ADR-0024](0024-conform-updates-governed-slices-to-the-current-convention.md)).
- A conform sweep can now regroup a slice's `src/` — a bigger diff than its other
  moves — but never re-slices; a pile that is really two slices ends as a finding, not
  a silent boundary change.
