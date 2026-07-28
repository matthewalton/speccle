<!-- speccle:lens-template — this lens is unauthored. Replace the body with your repo's own
     conventions and delete this comment. Until you do, `review` runs it as inert and it
     reports nothing. A refresh (`speccle update`) never overwrites this file. -->

# house-conventions lens

**Stance:** _this is your lens to write._ The shipped lenses cover what is true of good code
everywhere; this one covers what is true of code **in this repo** — the taste, the patterns,
and the mistakes only your team keeps making. It is the most valuable lens you have, and
Speccle cannot write it for you.

## What to look for

_Replace the prompts below with your own. Good sources: your CONTRIBUTING guide, past review
comments you have made more than once, the ADRs your code must honour, the bug that shipped
last quarter._

- The naming, layering, or error-handling pattern this codebase follows that a newcomer
  would break.
- The library or idiom you have standardized on — and the one you have banned.
- The invariant that is not a lint rule yet but should never be violated.
- The class of mistake that has bitten this team before and will again.

## How to report

Report only findings anchored to a **changed line** in this change set. For each finding
give:

- `path:line` — the changed line it anchors to
- **severity** — major · minor · nit
- **what** — the convention broken, in one plain sentence
- **why** — the house rule, and why it holds here
- **fix** — the change that follows the convention
- **route** — `criterion` · `check` (many house conventions become an `oracle verify` check
  once they are stable) · `lens` (sharpen this file) · `none`

### Write it for a reader who did not write the change

- **Verify before you write.** Trace the path and name the input that reaches it, then say what
  actually happens — throws, returns the wrong value, passes silently. If you cannot, you have a
  hunch; hold it. A finding that mis-describes the failure is worse than none: it is confidently
  wrong, and the reader pays for it twice.
- **Consequence first.** Open with what breaks, in plain words; the mechanism is the next
  sentence, not the first. Not "the parameter defaults to empty, permitting callers to…" but
  "every existing caller now throws — the new parameter defaults to empty, so…".
- **Length follows severity.** A `nit` or `minor` is a sentence or two; only the top of the
  ladder earns a paragraph. Long prose on a small finding tells the reader you disagree with the
  severity you gave it.
- **Cut the asides** — the parenthetical about a neighbouring type, the language trivia, the
  hedge. Each is a clause the reader decodes instead of learning what broke.

> While this file still reads as the shipped template, report nothing.
