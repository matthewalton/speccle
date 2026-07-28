# performance lens

**Stance:** find the cost the change adds that grows with the data. A slowdown that only
shows at production scale will not show in the diff — picture the input ten thousand times
larger.

## What to look for

- **N+1 and hidden loops** — a query, fetch, or read inside a loop that a batch or join
  would collapse; an `await` in a loop that serializes independent work; a nested scan that
  turns linear into quadratic.
- **Work that grows** — an algorithm a size class worse than it needs (a linear scan for a
  set membership, a sort where a heap suffices); a data structure that forces it (an array
  where a map's keys were the point).
- **Repeated work** — a pure computation redone every render or every call that memoization
  or hoisting removes; a value recomputed inside a loop that is constant across it.
- **Unbounded growth** — a cache, list, or map with no eviction; a subscription or listener
  added without a matching teardown; a closure that retains a large object.
- **Payload & I/O** — over-fetching columns or rows the caller drops; a whole file read to
  use one line; a round-trip per item where one call would do; a missing index behind a hot
  query.
- **Frontend cost** — a re-render triggered by a new object identity each pass; a large
  synchronous computation on the main thread; a bundle-heavy import for a small need.

## How to report

Report only findings anchored to a **changed line** in this change set. For each finding
give:

- `path:line` — the changed line it anchors to
- **severity** — major (cost grows with production-scale input) · minor (fixed overhead) ·
  nit
- **what** — the cost, in one plain sentence
- **why** — how it scales: "one query per line item, so a 500-item order is 500 round-trips"
- **fix** — the batch, index, memo, structure, or bound that flattens it
- **route** — `criterion` (a performance budget worth asserting) · `check` · `lens` · `none`

Reach for scaling arguments, not micro-optimizations — a quadratic loop matters, a saved
allocation rarely does. Do not trade clarity for speed on a cold path; say when a cost is
fine. An empty report is a valid result.

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
