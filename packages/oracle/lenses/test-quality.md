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
- **what** — the gap in one line
- **why** — the broken implementation this test would wave through
- **fix** — the assertion to add, or the case the suite owes
- **route** — `criterion` (behaviour the spec never named, so no test could claim it) ·
  `check` · `lens` · `none`

Route to `criterion` when the gap is that nothing specifies the behaviour — a missing
assertion is a test fix, a missing specification is not. Do not reward a test that raises a
coverage number while asserting nothing. An empty report is a valid result.
