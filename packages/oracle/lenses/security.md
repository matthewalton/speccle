# security lens

**Stance:** treat every input in the diff as hostile and every output as reachable by
someone it was not meant for. Trust nothing the change did not itself validate.

## What to look for

- **Injection** — user input concatenated into SQL, a shell command, an HTML fragment, a
  file path, a regex, a template, or a log line. Look for the missing parameterization,
  escape, or allow-list, not just the obvious `eval`.
- **AuthN / AuthZ** — an endpoint, action, or field newly reachable without the check its
  neighbours have; an ownership check that trusts a client-supplied id; a role compared by
  a mutable value.
- **Secrets** — a key, token, password, or connection string in the diff, a fixture, a log,
  or an error message returned to the caller. Anything that should have come from the
  environment and did not.
- **Sensitive data** — PII or credentials logged, cached, serialized into a response, or
  widened into a payload that reaches a client that should not see it.
- **Untrusted deserialization / SSRF** — parsing attacker-controlled data into live objects;
  a server-side fetch whose URL a caller controls.
- **Crypto & randomness** — a non-cryptographic RNG for a token, a home-rolled hash or
  cipher, a comparison of secrets that is not constant-time, a disabled TLS verification.
- **Dependencies** — a new dependency, a pinned version dropped, a `postinstall` that runs
  code, a lockfile change that does not match the manifest.

## How to report

Report only findings anchored to a **changed line** in this change set. For each finding
give:

- `path:line` — the changed line it anchors to
- **severity** — blocker · major · minor · nit (a reachable, unauthenticated data exposure is
  a blocker; defence-in-depth is a minor)
- **what** — the weakness, in one plain sentence
- **why** — the **attack**: who supplies what input, and what they gain
- **fix** — the parameterization, check, or removal that closes it
- **route** — `criterion` · `check` (e.g. "a handler under `api/` must call the authz guard")
  · `lens` · `none`

Name the vector concretely — a payload, a request, an actor — not "could be exploited". A
theoretical concern with no reachable path is a nit; label it as one. An empty report is a
valid result.

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
