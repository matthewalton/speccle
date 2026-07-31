# Checks

A check is one cross-file invariant, held over a **change set** rather than over a file. It is
the class of rule no linter can express, because the fact is about the whole change: _a changed
`@Model` requires a round-trip test in the same change._

Everything in this directory is yours. Speccle ships no checks, never overwrites what you write
here, and never deletes it.

A check that breaches **fails the stage it runs in**, and that is the point: a check is
deterministic, so its verdict is a fact about the change set and can be argued with. Judgement
you want to add instead — advice rather than a gate — belongs in `../lenses/`: drop a markdown
prompt in there and the review panel picks it up.

## The shape

One check, one JSON file. The filename without `.json` is its id.

```json
{
  "when": { "path": "features/**/src/*.ts", "contains": "@Model" },
  "require": { "path": "features/**/src/*.test.ts", "contains": "roundTrip" },
  "message": "a changed @Model needs a round-trip test in the same change",
  "because": "PR #412 shipped a schema change with no round-trip coverage"
}
```

| Key       | Meaning                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `when`    | The trigger. Absent means always enforced. A check whose trigger never fires reports as **inactive**, not as a pass.                 |
| `require` | Breaches when **no** changed file matches. Exactly one of `require` or `forbid`.                                                     |
| `forbid`  | Breaches when **any** changed file matches, naming the offenders.                                                                    |
| `message` | Shown on breach. Write it as the instruction, not the complaint — someone has to know what to do about it.                           |
| `because` | Optional provenance: the finding or pull request that bought this check. Prints on breach, so a red still explains itself a year on. |
| `id`      | Optional override for the filename-derived id.                                                                                       |

Each of `when`, `require` and `forbid` is a **predicate**: a glob over root-relative posix paths
(`**` spans directories, `*` and `?` stay inside one segment), optionally narrowed by
`contains` — a JavaScript regex the file's current content must match.

A malformed check file is a hard error naming the file, not a skip. A check that silently does
nothing is worse than no check at all, because everything downstream trusts it to hold.

## Where they run

```sh
speccle verify              # the working tree's pending change
speccle verify --base main  # the commits a branch adds
```

Two callers also run it for you: the implement stage gates each criterion on it before
committing, and review gates every fix it lands.

---

This file is documentation. `verify` reads only `*.json`, so nothing here is ever enforced.
