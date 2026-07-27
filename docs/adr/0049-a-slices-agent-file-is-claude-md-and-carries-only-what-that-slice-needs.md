# 0049 — a slice's agent file is CLAUDE.md and carries only what that slice needs

- Status: accepted
- Date: 2026-07-27
- Supersedes [ADR-0020](0020-every-feature-carries-an-agents-md.md)

## Context

ADR-0020 gave every feature folder an `AGENTS.md` — what the slice does in a sentence,
how to run its tests, where the contract lives — and justified it chiefly on commands:
"keeping it to facts the folder cannot show (chiefly commands) minimises the surface."
Two things have since falsified that premise.

**Commands are only per-slice in some dialects.** In a pnpm workspace each package has
its own filter and test command, so the section earns its place; Speccle's own governed
slice is the proof. In a single-target Xcode project one `xcodebuild … test` invocation
runs every slice's tests. Ladder, the first repo to carry the convention across more
than one slice, ended with the same twelve-line command block copied byte-identically
into eleven `AGENTS.md` files — 132 lines restating the repo's root instructions, about
27% of everything those files held. The convention manufactured that duplication; no
one authored it carelessly.

**Claude Code does not read `AGENTS.md`.** It reads `CLAUDE.md`, with no setting to
change that. Nested `CLAUDE.md` files load on demand when the agent reads a file in
that directory; a nested `AGENTS.md` never loads at all. The cross-tool convention
ADR-0020 chose the name for bought nothing in the tool this convention is written
for — those eleven files were invisible unless a skill told an agent to open one.

Meanwhile the file's most valuable content turned out to be something ADR-0020 never
asked for. Every Ladder slice had drifted into recording the edits a change there
forces _outside_ the folder: the model link a sibling slice owns, the schema
registration in a third. Nothing else in the convention records that, and an agent that
misses it ships a model the container never registers.

## Decision

The per-feature agent file is **`CLAUDE.md`**, and it carries four things in this
order:

1. **Identity** — one line: what the slice is.
2. **Boundary** — the files outside the folder a change here must touch, and which
   slice owns each.
3. **Traps** — fixtures, injection points and prohibitions, only where they differ from
   the repo's default.
4. **Key** — the criterion token, which the folder cannot show.

One test governs everything else:

> If a line would be true of every slice in the repo, it belongs in the root
> `CLAUDE.md`, not here.

Commands appear only where they genuinely differ per slice. Behaviour stays in
`SPEC.md`, language in `CONTEXT.md`, rationale in `decisions/`. An inventory of `src/`
belongs nowhere: the folder already shows it.

This both widens ADR-0020's remit — identity and boundary are more than "how to work
the slice" — and narrows it: the convention's own shape, which every slice would state
identically, drops out.

## Consequences

- Anthropic's published guidance for `CLAUDE.md` now governs the file directly: keep
  only what would cause a mistake if removed, drop what an agent can derive by reading
  code. The convention no longer has to reason about this alone.
- The file loads on demand in the tool most Speccle users run, instead of waiting for a
  skill to open it.
- The boundary list is the section that earns the file and the one most prone to
  drift — it names files in other slices, so a move elsewhere makes it stale. `feature`
  and `implement-feature` update it whenever a change crosses the folder line.
- A repo that keeps `AGENTS.md` at its root for other tools loses nothing; only
  governed slices change, and `conform` migrates them.
- The markdown floor stays three files per feature. Only the name and the contents
  change.
