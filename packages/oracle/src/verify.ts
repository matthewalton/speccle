import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  anyMatches,
  assertPredicate,
  contentReader,
  gitChangeSet,
  isDirectory,
  matching,
  messageOf,
  type Predicate,
} from "./changeset.ts";

/** Where a repo keeps its hand- and meta-loop-authored checks (ADR-0043). */
export const CHECKS_DIR = ".speccle/checks";

/**
 * One cross-file invariant, one `.speccle/checks/*.json` file. Its reason to exist is the
 * class of relationship no linter can hold — a whole-change-set predicate like "a changed
 * `@Model` requires a round-trip test in the same change" (ADR-0043).
 */
export interface Check {
  /** Stable id; defaults to the check file's basename without `.json`. */
  id?: string;
  /** Trigger: the requirement is enforced only when a changed file matches. Absent = always. */
  when?: Predicate;
  /** Requirement — breach when no changed file matches. Exactly one of require/forbid. */
  require?: Predicate;
  /** Requirement — breach when any changed file matches. Exactly one of require/forbid. */
  forbid?: Predicate;
  /** Shown on breach. */
  message: string;
  /** The finding or PR that created the check — its provenance, surfaced in the report. */
  because?: string;
}

/** `pass` — enforced and satisfied. `breach` — enforced and violated. `inactive` — `when` never fired. */
export type CheckStatus = "pass" | "breach" | "inactive";

export interface CheckResult {
  id: string;
  /** Root-relative path of the check file. */
  file: string;
  status: CheckStatus;
  message: string;
  because?: string;
  /** For a `forbid` breach: the changed files that matched the forbidden predicate. */
  offenders?: string[];
}

/** The JSON contract of `speccle verify --json`. */
export interface VerifyReport {
  root: string;
  /** Root-relative changed paths the checks ran against. */
  changed: string[];
  checks: CheckResult[];
  breaches: number;
  /** True when no enforced check was breached. */
  clean: boolean;
}

export interface VerifyOptions {
  /**
   * Override the change set with root-relative posix paths, skipping git. The driver a check
   * runs under (the checks-gate, a branch review) owns how the change set is computed; the
   * default reads the working tree's pending change.
   */
  changed?: string[];
}

export async function verify(target: string, options: VerifyOptions = {}): Promise<VerifyReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const checks = await loadChecks(root);
  const changed = (options.changed ?? gitChangeSet(root)).slice().sort();
  const read = contentReader(root);

  const results: CheckResult[] = [];
  for (const { check, file } of checks) {
    results.push(await evaluate(check, file, changed, read));
  }

  const breaches = results.filter((result) => result.status === "breach").length;
  return { root, changed, checks: results, breaches, clean: breaches === 0 };
}

async function evaluate(
  check: Check,
  file: string,
  changed: string[],
  read: (file: string) => Promise<string | undefined>,
): Promise<CheckResult> {
  const base = {
    id: check.id ?? basename(file),
    file,
    message: check.message,
    ...(check.because !== undefined && { because: check.because }),
  };

  if (check.when !== undefined && !(await anyMatches(check.when, changed, read))) {
    return { ...base, status: "inactive" };
  }

  if (check.forbid !== undefined) {
    const offenders = await matching(check.forbid, changed, read);
    return offenders.length === 0
      ? { ...base, status: "pass" }
      : { ...base, status: "breach", offenders };
  }

  // require: enforced above by loadChecks, so it is defined here.
  const satisfied = await anyMatches(check.require!, changed, read);
  return { ...base, status: satisfied ? "pass" : "breach" };
}

interface LoadedCheck {
  check: Check;
  /** Root-relative path of the check file. */
  file: string;
}

async function loadChecks(root: string): Promise<LoadedCheck[]> {
  let entries: string[];
  try {
    entries = await readdir(join(root, CHECKS_DIR));
  } catch {
    return []; // no checks dir: a repo that has authored none passes trivially.
  }

  const loaded: LoadedCheck[] = [];
  for (const name of entries.filter((name) => name.endsWith(".json")).sort()) {
    const file = `${CHECKS_DIR}/${name}`;
    const raw = await readFile(join(root, file), "utf8");
    let check: Check;
    try {
      check = JSON.parse(raw) as Check;
    } catch (err) {
      throw new Error(`${file} is not valid JSON: ${messageOf(err)}`);
    }
    assertCheck(check, file);
    loaded.push({ check, file });
  }
  return loaded;
}

// A malformed check must fail loudly, naming the file — a check that silently does nothing is
// worse than no check, because the meta loop trusts it to hold the invariant.
function assertCheck(check: Check, file: string): void {
  if (typeof check.message !== "string" || check.message === "") {
    throw new Error(`${file}: a check needs a non-empty "message"`);
  }
  const requirements = [check.require, check.forbid].filter((r) => r !== undefined);
  if (requirements.length !== 1) {
    throw new Error(`${file}: a check needs exactly one of "require" or "forbid"`);
  }
  assertPredicate(check.when, "when", file);
  assertPredicate(check.require, "require", file);
  assertPredicate(check.forbid, "forbid", file);
}

function basename(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return name.endsWith(".json") ? name.slice(0, -".json".length) : name;
}
