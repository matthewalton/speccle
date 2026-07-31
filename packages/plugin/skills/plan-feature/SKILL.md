---
name: plan-feature
description: Shape a feature request into a ratified plan — take prose, a ticket, or a conversation as it comes, explore the repo, route the work (a new slice, an amendment to the slice that already owns the behaviour, or a carve), settle every open key decision with the user one question at a time, capture each one into the slice's docs as it lands, and end with an easy-to-read plan summary. Use when the user wants to plan or scope a feature before building it, asks where a behaviour should live, wants to agree open decisions about a feature, or asks whether something is a new feature or a change to an existing one.
allowed-tools: Read(/${CLAUDE_PLUGIN_ROOT}/skills/*/references/**)
---

# plan-feature

Turn a feature request — in whatever form it arrives — into a plan the rest of the
pipeline can execute unattended: the **route**, the **feature folder**, the **feature
key**, the scope, and every open decision settled and written down. This is the first
stage of the `feature` pipeline and its one human gate — it shares its session with
`spec-feature`, which lands the per-behaviour decisions this skill settles. It is also
useful alone: a plan is a cheap thing to be wrong about out loud.

The folder shape and key rules this skill plans against are fixed by the convention,
bundled beside this skill. Read `${CLAUDE_SKILL_DIR}/references/convention.md` before
shaping anything.

Speccle's words are fixed and mandatory: "amend", not "edit" or "update"; "feature
key", not "prefix"; "criterion id", not "tag"; "key decision" and "defaulted" as
defined here.

## 1. Take the input as it comes

Prose, a ticket, a scratch file, a conversation, or a `SPEC.md` someone already wrote
to the convention. Never send the user away to reformat something first. If the input
is already a conventioned `SPEC.md`, the criteria are owned — the plan adopts them
as-is and routes on where that spec should live.

## 2. Explore before routing

The route is decided by **where the behaviour lives**, and finding that out means
looking:

- Find every existing feature folder — every `SPEC.md` — and read each one's key and
  criteria statements. This is also the key-collision check, so it is never wasted.
- Read the language: the owning slice's `CONTEXT.md` and the project's root glossary,
  where they exist. A request that uses a term those files define differently is
  challenged out loud — "your glossary defines X as …, but you seem to mean Y" —
  never silently translated.
- Read the project's layout: where feature folders sit, what the test runner is, how
  the slice would be reached from the outside.

Then route:

- **New** — no governed slice owns the behaviour. The plan names a new feature folder
  and key.
- **Amend** — a governed slice already owns it. Extending (new criteria) and changing
  (rewording or retiring criteria) are the same route: the plan names the owning
  folder and its existing key. Never plan a second folder for behaviour that has an
  owner.
- **Carve** — the behaviour already runs but is ungoverned. Stop and hand to
  `carve-feature`; a request that mixes governing and changing is a carve followed by
  an amend, never one pass.

When the call is genuinely close — the behaviour half-belongs to an existing slice —
route **amend** and say why: two slices owning one behaviour is the expensive mistake,
and a wrongly-amended slice is cheap to split later.

## 3. Shape the slice

- **Where the feature folder goes** (new route). Match the project's existing layout;
  if other feature folders exist, sit beside them. The folder is **named for the
  feature** — never an unnamed catch-all like `src/` or `lib/` — even when it is the
  project's first.
- **The feature key.** New route: `[A-Z][A-Z0-9]{1,9}`, unique across the repo — you
  already read every other spec's frontmatter in phase 2. Amend route: the slice's
  existing key, never a new one.
- **The slice's scope.** Name the behaviours the spec will cover, in a sentence or
  two each — what is in, and what is deliberately out. These are raw material for
  `spec-feature`, not criteria: leave the statements to the drafting.

## 4. Settle the open decisions — one question at a time

Planning is where open choices get agreed, not guessed. A **key decision** is a choice
the input leaves open, with more than one viable answer, that materially shapes the
slice across criteria — a policy (rounding, retention, who may retry), a data shape,
an external contract.

- **Ask only what changes the plan.** A choice the ticket or conversation already
  settles is not open — adopt it. Routing is never a key decision: it is decided by
  where the behaviour lives and announced. Naming, statement wording, and
  single-behaviour details belong to `spec-feature` and the criterion body. If
  nothing is genuinely open, say "no open decisions" and move on — never manufacture
  questions to look thorough.
- **One at a time, each with a recommendation.** Put the options, recommend one, and
  say why — then wait. The next question may depend on the last answer; a batch
  cannot. This dialogue is the reason planning runs in the main session and not a
  subagent.
- **If no one can answer** — an unattended run — take the recommendation and flag the
  decision as **defaulted**, in the plan summary and again at the end of the
  pipeline. A defaulted decision is never silent.

## 5. Capture each decision the moment it lands

A decision that lives only in this conversation dies with it. Write it now, not at
the end:

- **Feature-level** — an ADR in the slice's `decisions/` (next number, slug, the
  usual status/context/decision/consequences) and, when it coins or sharpens a term,
  an entry in the slice's `CONTEXT.md` with its _Avoid_ line. On the new route the
  feature folder exists from the first captured decision — create it, named per the
  convention; `spec-feature` fills in the rest of the contract later.
- **Repo-wide** — a decision bigger than the slice goes to the project's own ADR
  home (`docs/adr/` by convention) and its root glossary, in whatever form the
  project already uses.
- **About one behaviour** — no file yet; note it in the plan for `spec-feature` to
  land in that criterion's body.
- **When writes are forbidden** — the session is in plan mode — carry every capture
  in the plan summary, explicitly marked "to write on approval". Writing them is the
  pipeline's first act after the gate.

## 6. Ask the repo's plan lenses

A repo may keep **plan lenses** in `.speccle/lenses/plan/` — its own judgement about
the shape of a slice, one markdown prompt each. Most repos keep none, and then this
step is nothing: look, find no lens, move on without a word about it.

Where there are lenses, fan out one subagent per lens, in parallel, before you write
the summary. Each prompt carries the lens file verbatim, the plan as it stands — route,
folder, key, scope, and every key decision with how it was settled — and whatever
markdown the slice already has: `CONTEXT.md`, `CLAUDE.md`, `decisions/`, and `SPEC.md`
on an amend. There is no diff at plan time; do not invent one, and do not send a lens
looking at code.

Two names never go to a subagent. `README.md` in that directory is the scaffold's own
documentation, not a lens. And the lenses in `.speccle/lenses/` itself belong to
`review` — they judge a change set, and there is no change set here.

**A finding is advice, never a veto.** It cannot fail the plan, and it cannot quietly
rewrite it. Where one is plainly right, revise the plan and say so, naming the lens;
where it is arguable, carry it into the summary and let the human rule. Do not reopen
§4 to ask about it — a lens is not a new question, it is a comment on the answers. A
lens that finds nothing is the common result, and it earns no line anywhere.

## 7. End with the plan summary

One screen, easy to read: the route, the feature folder, the key, the scope (in and
out), and each key decision — how it was settled (from the input, agreed, or
defaulted) and where it was captured. Then what the plan lenses found, if any ran and
any found something — each finding in a line or two, with the lens that raised it. No
jargon the reader has to decode; the summary is the thing the human approves, so it
must be readable in one pass.

In the `feature` pipeline the summary becomes the approval gate — `feature` owns those
mechanics, and the spec is drafted in this same session once the gate passes.
Standalone, hand it back and stop: the plan is the deliverable.

This skill drafts no criteria and writes no code — its only files are the decision
records above. A plan that turns out wrong at the spec or implement stage is revised
there, not defended here.
