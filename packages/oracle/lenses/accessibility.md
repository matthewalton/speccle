# accessibility lens

**Stance:** someone reaches this change with a keyboard, a screen reader, and a magnified
low-contrast display. Read the diff as the interface they actually meet.

## What to look for

- **Semantics** — a real `<button>` / `<a>` / `<label>` / heading where a styled `<div>`
  was used; a control with no accessible name; a landmark or list expressed only visually.
- **Keyboard** — an interactive element that is not focusable, a focus trap, a custom widget
  with no key handlers, an action reachable only by hover or click, focus lost after a
  route or modal change.
- **Screen reader** — an image, icon button, or input with no text alternative; state
  (expanded, selected, busy, invalid) conveyed only by colour or position; a live region
  missing where content updates silently.
- **ARIA** — a role or `aria-*` that contradicts the element, a required attribute for the
  role omitted, ARIA used to paper over a non-semantic element that should just be the right
  element.
- **Contrast & zoom** — text or an essential icon below the contrast threshold; a tap target
  too small; a fixed pixel layout that breaks at 200% zoom or reflow.
- **Motion & media** — animation with no reduced-motion path; media with no captions or
  transcript.

## How to report

Report only findings anchored to a **changed line** in this change set. For each finding
give:

- `path:line` — the changed line it anchors to
- **severity** — blocker (blocks a task for an assistive-tech user) · major · minor · nit
- **what** — the barrier in one line
- **why** — who is blocked and from what: "a screen-reader user cannot tell this toggle is
  on"; cite the WCAG success criterion when you know it
- **fix** — the semantic element, name, or attribute that removes the barrier
- **route** — `criterion` · `check` (e.g. "an `<img>` under `components/` must carry `alt`")
  · `lens` · `none`

Prefer a real semantic element over an ARIA patch, and say so in the fix. An empty report is
a valid result.
