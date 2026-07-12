# 0025 — Skill frontmatter grants read access to bundled references

- Status: accepted; the grant's spelling and placement are superseded by
  [0026](0026-every-skill-carries-the-plugin-wide-references-grant.md) — the per-skill
  grant never fires for Skill-tool children
- Date: 2026-07-12

## Context

ADR-0014 bundled `docs/convention.md` beside each skill that orders the agent to read
it, so the instruction would be executable offline. The #110 cold test showed the
bundle is not executable either: the plugin cache lives outside the session's working
directory, so the ordered `Read` hits a permission wall — a prompt per run in an
interactive session, a silent failure in a headless one. All three cold runs proceeded
without ever reading the convention, saved only by sibling slices to imitate and the
oracle's lint. On a bare target nothing would have stood between the agent and a
malformed contract but lint.

Two fixes were considered. Embedding the convention text into each `SKILL.md` at
`pnpm sync:plugin-refs` time removes the read entirely, but injects ~160 lines into
every skill invocation — paid three times over in a pipeline run — and turns each
`SKILL.md` into a part-generated file. The alternative is the `allowed-tools` skill
frontmatter field, which grants the listed tools without prompting while the skill is
active, scoped with the documented `${CLAUDE_SKILL_DIR}` substitution.

The obvious spelling does not work, and an A/B probe against the installed cache
proved it: `Read(${CLAUDE_SKILL_DIR}/references/**)` expands to a single-leading-slash
pattern, and Read rules follow gitignore semantics where `/path` anchors at the
settings source — only `//path` is absolute from the filesystem root. Prefixing one
more slash, `Read(/${CLAUDE_SKILL_DIR}/references/**)`, expands to the `//` absolute
form and the ordered read succeeds cold, with no prompt.

## Decision

Every skill that bundles references declares, in its `SKILL.md` frontmatter:

```yaml
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/references/**)
```

The leading slash is load-bearing: it is what turns the expanded absolute path into
an absolute _pattern_ under Read-rule semantics. The grant covers only the skill's own
`references/` directory — not the plugin, not the cache — and only while the skill is
active.

The skill body orders the read as `${CLAUDE_SKILL_DIR}/references/convention.md`
(single slash: here it is a path, not a pattern), so the path the agent reads is
exactly the path the rule allows; a relative `references/…` would resolve against the
session's working directory and miss.

## Consequences

- A skill's ordered reads now execute in cold and headless sessions without a
  permission prompt, closing the hole #110 found in ADR-0014's fix.
- ADR-0014's bundling rule stands unchanged: references are still generated copies,
  still drift-guarded by `pnpm check:plugin-refs`; this ADR only makes them reachable.
- The convention costs tokens only when actually read, unlike embedding it in every
  `SKILL.md`.
- On a Claude Code too old to substitute `${CLAUDE_SKILL_DIR}`, the rule matches
  nothing and behaviour degrades to today's permission prompt — worse than nothing
  never happens.
- The double-slash spelling is easy to "fix" back to the broken single-slash form by
  someone tidying frontmatter; this ADR is the guard against that.
