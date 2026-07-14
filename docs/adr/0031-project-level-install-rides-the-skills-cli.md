# 0031 — Project-level install rides the `skills` CLI; the repo layout is the contract

- Status: accepted
- Date: 2026-07-14

## Context

#125 wants one explicit command that provisions a target repo project-level: the seven
skills into `.claude/skills/` (so the whole team gets the pipeline by cloning, instead
of per-person plugin installs) and the npm stack (`speccle-oracle` as a lockfile-pinned
devDependency plus what `strength init` already provisions, ADR-0029).

Two decisions were settled with the user: the skills materialize **from the GitHub
repo** — not from the `speccle-oracle` tarball, which stays tool-only per ADR-0030, and
not from a second npm package — and the copies are **generated, then committed**, so
teammates need nothing and a re-run refreshes them.

Tested against the real repo: `npx skills add matthewalton/speccle` (the skills.sh CLI,
`vercel-labs/skills`) discovers all seven skills under `packages/plugin/skills/`,
copies each whole skill directory — `references/` included — byte-identical into the
target's `.claude/skills/`, and writes a `skills-lock.json` recording source repo,
skill path, and a content hash, which `skills update` uses to refresh.

## Decision

Speccle ships no materializer of its own. Project-level install is two explicit
commands, each doing the half it is built for:

```sh
npx skills add matthewalton/speccle -a claude-code   # skills → .claude/skills/, committed
npx speccle-oracle strength init                     # oracle devDep + strength stack + configs
```

The contract this creates: **the repo layout is the published interface.** Skills live
at `packages/plugin/skills/<name>/SKILL.md` and moving them breaks every downstream
`skills update`.

Skill bodies must survive both installs unchanged — the same files are the plugin and
the vendored copies:

- Cross-skill invocations use bare names with a note that the namespace follows the
  install (`speccle:plan-feature` as the plugin, `plan-feature` project-level); the
  orchestrator resolves against the session's skill list.
- `${CLAUDE_SKILL_DIR}` reference reads work in both (the variable is the skill's own
  directory wherever it lives). The `${CLAUDE_PLUGIN_ROOT}` frontmatter grant
  (ADR-0026) is a no-op project-level — in-project files need no grant — and stays for
  the plugin's sake.

`strength init` grows the npm half: it adds `speccle-oracle` itself to the missing
devDependencies, pinned with a caret to the running oracle's own version (read from its
package.json at runtime, so the pin never drifts from the code answering it). And it
warns — best-effort, via `~/.claude/settings.json` — when the target vendors the skills
project-level while a user-level speccle plugin is still enabled: two copies of every
skill would load, and the vendored copies are the one source of truth.

## Consequences

- Zero materializer code to build or maintain; version pinning of the vendored skills
  is `skills-lock.json`'s content hash against the repo, not an npm version.
- The `skills` CLI is a third-party dependency of the install story (not of the
  installed artifacts — the copies are plain files and keep working regardless).
- Moving or renaming `packages/plugin/skills/` is now a breaking change to the install
  contract, not an internal refactor.
- Skill bodies are written install-agnostically from here on: no wording that assumes
  the plugin namespace or plugin-only path variables outside the harmless grant line.
