# 0028 — Shipped skills carry no repo citations

- Status: accepted (amends [ADR-0014](0014-a-skill-bundles-the-docs-it-orders-you-to-read.md))
- Date: 2026-07-12

## Context

ADR-0014 split doc links into instructions (bundled) and citations (absolute
`github.com` URLs), and kept the citations in the skill bodies. Living with that for a
few releases showed the citations serve nobody the skill is written for: an installed
skill's only readers are the agent executing it and the user who installed it, and
neither needs — or has — Speccle's decision log. The URLs also ride into every agent's
context on each skill load, a few hundred tokens of provenance the agent must not act
on.

The provenance itself is still wanted. When a skill's wording is challenged, the ADR
that settled it is the answer to "why is it like this", and losing the mapping means
re-litigating settled decisions.

## Decision

Skill bodies — `SKILL.md` and the generated `references/` copies — carry **no links
out of `packages/plugin`**: no ADR citations, no links to `CONTEXT.md` or `docs/`.
ADR-0014's instruction/citation split stands; what changes is where citations live.

Provenance moves to [docs/skill-provenance.md](../skill-provenance.md), a
maintainer-facing map from each skill to the ADRs that govern it. It is kept by hand:
a decision that shapes a skill adds a row when the skill changes, the same commit.

`scripts/sync-plugin-references.mjs` no longer rewrites the source's relative links to
`github.com` URLs; it **unlinks** them, keeping the link text (`[ADR-0016](adr/…)` →
`ADR-0016`) so the source docs stay fully linked for maintainers while the bundled
copies ship clean.

## Consequences

- A skill body reads as self-contained instructions; nothing in it points at a repo
  the installer does not have.
- The skill → ADR mapping is no longer greppable from the skill files. The map file is
  the record, and it can drift — accepted, because it is maintainer convenience, not
  something any skill executes.
- ADR-0014's rule that an ordered read must be bundled is untouched; this amends only
  its treatment of citations.
