# 0026 — Every skill carries the plugin-wide references grant

- Status: accepted
- Date: 2026-07-12

## Context

ADR-0025 granted each skill read access to its own bundled references via
`allowed-tools: Read(/${CLAUDE_SKILL_DIR}/references/**)`, proven by an A/B probe. The
#115 bare-target cold test showed the probe validated the wrong invocation path: the
grant fires only when the skill is the session's entry point. When a skill runs as a
Skill-tool child — how `feature` runs every pipeline stage (ADR-0022) — its
frontmatter grant never registers, and every stage proceeded convention-blind on
exactly the bare target ADR-0025 was written for.

A second probe round (Claude Code 2.1.207, headless, installed cache) pinned the
mechanics:

- A child grant spelled as a literal absolute path is still denied via the Skill
  tool, so child frontmatter grants do not register at all — this is not a
  `${CLAUDE_SKILL_DIR}` substitution problem.
- An entry skill carrying `Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)` lets
  a Skill-tool child read its bundled reference cleanly. That proves two undocumented
  facts at once: `${CLAUDE_PLUGIN_ROOT}` is substituted in `allowed-tools`, and the
  entry skill's grant stays in force while its Skill-tool children run.

Upstream, none of this is documented: grant lifetime is specified only as "while the
skill is active", with child invocation unaddressed (related issues
anthropics/claude-code#14956, #59968).

## Decision

Every skill in the plugin — orchestrators and leaves alike, with or without their own
`references/` — declares:

```yaml
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
```

Whichever skill is the session's entry point arms reference reads for itself and for
every skill reached from it through the Skill tool. The rule has no exceptions so it
cannot rot: a skill that gains references later, or gains a new child, is already
covered.

ADR-0025's other rulings stand: the leading slash is still load-bearing (`/` +
substitution = the `//` absolute pattern Read rules require), and the skill body still
orders the read as `${CLAUDE_SKILL_DIR}/references/convention.md` — the child's own
directory, single slash, a path not a pattern.

## Consequences

- The pipeline's ordered reads now execute cold and headless regardless of which
  skill entered the session, closing the hole #115 found in ADR-0025's fix.
- The grant is wider than ADR-0025's: any active speccle skill may read every speccle
  skill's `references/`. The ceiling is the plugin's own bundled, generated docs —
  nothing outside the plugin is granted.
- One hole remains, unreachable by frontmatter: a speccle skill model-invoked via the
  Skill tool in a session whose entry was not a speccle skill registers no grant —
  interactive sessions degrade to a permission prompt, headless ones to a denial.
  Closing it needs an upstream fix (child grants registering) or a plugin hook.
- Both proven behaviours are undocumented upstream and could change under us; the
  probe pair in this ADR is the regression test to re-run when a Claude Code upgrade
  breaks reference reads.
