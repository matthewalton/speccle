# 0046 — The `speccle` tarball carries the skills

- Status: accepted
- Date: 2026-07-24
- Supersedes [ADR-0031](0031-project-level-install-rides-the-skills-cli.md) — the skills
  materialize from the `speccle` tarball, not from the GitHub repo via `skills.sh`
- Amends [ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) — the
  tarball ships more than `dist/`; everything it decided about the bin's substance stands

## Context

[ADR-0031](0031-project-level-install-rides-the-skills-cli.md) settled the project-level
install as two commands doing two halves: `npx skills add matthewalton/speccle` pulls the
seven skills from the GitHub repo via the `skills.sh` CLI, and `speccle strength init`
provisions the stack. Its load-bearing justification was economy — "zero materializer
code to build or maintain," with the repo layout standing in as the published install
interface and `skills-lock.json`'s content hash standing in for a version.

Two things undercut that economy.

First, the saving is already being spent. #174's investigation concluded Speccle needs
staleness reporting for the skills and the stack regardless of packaging — the machinery
that reads a source, compares it to what's on disk, and reports drift. That is the same
machinery a materializer needs. "No materializer" was never free; it was deferred.

Second, the arrangement leaves **two independent version lines that can drift**. The
skills resolve from GitHub `main` by content hash; the oracle resolves from npm by
version. [ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) pinned
the oracle as a devDependency precisely to kill skill↔oracle contract drift (#67 was one
instance), but pinning the oracle does not pin the skills to it — it pins _around_ the
problem. A team can hold a skill revision that a different oracle version lints or claims
differently, and nothing catches it.

Everything else already points at the CLI carrying the skills. The bin must be on `PATH`
to be resolved at all ([ADR-0044](0044-the-oracle-ladder-prefers-the-repos-pinned-oracle.md)),
it is already published ([ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md)),
and `speccle init` already exists as the repo-facts writer
([ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md)). The skills are a
natural payload of a command that is already provisioning the repo.

## Decision

The `speccle` npm tarball carries the skills. Speccle ships its own materializer.

- The build copies `packages/plugin/skills/` into the package, and the `files` field
  grows from `dist` to include the bundled skills. One tarball contains both the bin and
  the skills it pairs with, so `speccle@X` names one skill↔oracle pairing — the #67 drift
  class closes for real, not pinned around.
- `speccle init` materializes the bundled skills into the target's `.claude/skills/`,
  **generated then committed**, alongside writing `.speccle/config.json`
  ([ADR-0040](0040-speccle-reads-repo-facts-from-a-dot-speccle-folder.md)). Project-level
  install becomes one command per artifact: `speccle init` for the skills and repo facts,
  `speccle strength init` for the mutation stack — which stays separate and opt-in per
  [ADR-0029](0029-strength-init-provisions-the-stack-on-explicit-command.md), because the
  npm mutation stack is meaningless on, say, a Swift repo.
- This supersedes [ADR-0031](0031-project-level-install-rides-the-skills-cli.md)'s
  "Speccle ships no materializer of its own" and its sourcing of the skills from the
  GitHub repo via `skills.sh`. The `skills.sh` dependency and `skills-lock.json` leave the
  project-level install story; the tarball version replaces the content hash as the
  staleness anchor.

What survives the supersede, because the reasoning still holds:

- **Skill bodies stay install-agnostic.** The user-level plugin path remains (below), so
  the same files must work under both namespaces. ADR-0031's rules — bare cross-skill
  names, `${CLAUDE_SKILL_DIR}` reference reads, the harmless `${CLAUDE_PLUGIN_ROOT}`
  grant — are unchanged.
- **Skills land as committed files**, and re-running `init` refreshes them as a
  reviewable diff. The tarball changes where the copies come _from_, not that they are
  the consumer's files.

[ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md)'s tool-only binary
is untouched. This changes what the tarball _contains_, not what the _bin does_ — still
deterministic, still no LLM calls, still no new judgement surface. Its packaging note is
the only thing amended: the tarball ships `dist/` **plus the skills payload**, and still
carries no runtime dependencies, because the skills are static files, not dependencies.

**Two things this deliberately does not solve**, kept explicit so the decision stays
honest:

1. The **user-level plugin path stays.** It is Claude Code's marketplace, which an npm CLI
   cannot replace. Two install paths remain; the win is that each becomes internally
   coherent — one command apiece — instead of one being two half-commands.
2. **Updating skills still produces a diff a human reviews and commits.** Speccle puts
   judgement into per-repo markdown on purpose, and per-repo content is exactly what
   cannot be rewritten behind the user's back. No packaging change dissolves that
   asymmetry, nor should it.

## Consequences

- One version line for the project-level pairing: `speccle@X` carries the skills and the
  oracle together, so the pairing is atomic rather than two lines pinned near each other.
- The `skills.sh` CLI leaves the install story, and `skills-lock.json`'s content-hash
  staleness gives way to the tarball version. Reporting whether a repo's committed skills
  are behind the installed CLI becomes the job of the `doctor`/`update` surface #174
  identified — the same machinery whose cost this decision stops pretending it avoids.
- The build must copy the skills into the package before publish, and the tarball grows.
  Moving or renaming `packages/plugin/skills/` is still a breaking change — now to the
  build step rather than to a downstream `skills update`.
- `speccle init` grows a materialization step; today it only writes
  `.speccle/config.json`. Re-running it refreshes the committed skills as a diff.
- [ADR-0031](0031-project-level-install-rides-the-skills-cli.md) is superseded;
  [ADR-0030](0030-speccle-oracle-publishes-to-npm-on-internal-demand.md) is amended in its
  packaging note only. This ADR records the decision; the build and `init` changes land as
  their own ticket.
