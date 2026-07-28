# test-quality lens

**Stance:** a test's only job is to fail when the behaviour breaks. Read each test the change
adds or touches and ask what broken code it would let through.

## What to look for

- **Asserts nothing** — a test that exercises code but checks no outcome; an `expect` with no
  matcher; a snapshot accepted without reading it; a `try/catch` that passes on either path.
- **Cannot fail** — an assertion tautologically true (`expect(x).toBe(x)`), a mock asserted
  against its own return, a condition that guards the only assertion so it never runs.
- **Tests the mock** — every collaborator stubbed until the test only proves the stubs were
  called in the order the test wrote; nothing of the real unit is left under test.
- **Behaviour changed, test did not** — production logic in the diff whose test file is
  untouched, or touched only to keep it compiling; a new branch with no case.
- **Coupled to implementation** — assertions on private internals, call order, or log
  strings rather than observable behaviour, so a safe refactor breaks the test and a real
  regression slips by.
- **Weak oracle** — asserts a value is truthy where the exact value matters; `toThrow()`
  with no error type; checks a collection's length but not its contents.
- **Missing negative space** — only the happy path; the error, the empty, and the rejected
  input the change introduced go unchecked.

## How to report

Report only findings anchored to a **changed line** — a test in the diff, or production
behaviour the diff added that no test claims. For each finding give:

- `path:line` — the test line, or the unclaimed production line
- **severity** — major (a real regression would pass) · minor · nit
- **what** — the gap, in one plain sentence
- **why** — the broken implementation this test would wave through
- **fix** — the assertion to add, or the case the suite owes
- **route** — `criterion` (behaviour the spec never named, so no test could claim it) ·
  `check` · `lens` · `none`

Route to `criterion` when the gap is that nothing specifies the behaviour — a missing
assertion is a test fix, a missing specification is not. Do not reward a test that raises a
coverage number while asserting nothing. An empty report is a valid result.

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
