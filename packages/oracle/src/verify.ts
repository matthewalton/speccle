import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Where a repo keeps its hand- and meta-loop-authored checks (ADR-0043). */
export const CHECKS_DIR = ".speccle/checks";

/**
 * A predicate over the change set: files whose root-relative path matches `path` and, when
 * `contains` is set, whose current content matches that regex. A path-only predicate asks
 * only whether such a file changed at all.
 */
export interface Predicate {
  /** Glob over root-relative posix paths. `**` spans directories, `*`/`?` stay in a segment. */
  path: string;
  /** JavaScript regex source the file's content must match to qualify. */
  contains?: string;
}

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

  // Content is read once per file across every predicate that needs it.
  const content = new Map<string, string | undefined>();
  const read = async (file: string): Promise<string | undefined> => {
    if (!content.has(file)) content.set(file, await readMaybe(join(root, file)));
    return content.get(file);
  };

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

/** The changed files a predicate matches — by path glob, then by content when `contains` is set. */
async function matching(
  predicate: Predicate,
  changed: string[],
  read: (file: string) => Promise<string | undefined>,
): Promise<string[]> {
  const pattern = globToRegExp(predicate.path);
  const contains = predicate.contains === undefined ? undefined : new RegExp(predicate.contains);
  const matches: string[] = [];
  for (const file of changed) {
    if (!pattern.test(file)) continue;
    if (contains !== undefined) {
      const source = await read(file);
      if (source === undefined || !contains.test(source)) continue;
    }
    matches.push(file);
  }
  return matches;
}

async function anyMatches(
  predicate: Predicate,
  changed: string[],
  read: (file: string) => Promise<string | undefined>,
): Promise<boolean> {
  return (await matching(predicate, changed, read)).length > 0;
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
  for (const [key, predicate] of [
    ["when", check.when],
    ["require", check.require],
    ["forbid", check.forbid],
  ] as const) {
    if (predicate === undefined) continue;
    if (typeof predicate.path !== "string" || predicate.path === "") {
      throw new Error(`${file}: "${key}" needs a non-empty "path" glob`);
    }
    if (predicate.contains !== undefined) assertRegex(predicate.contains, key, file);
  }
}

function assertRegex(source: string, key: string, file: string): void {
  try {
    new RegExp(source);
  } catch (err) {
    throw new Error(`${file}: "${key}.contains" is not a valid regex: ${messageOf(err)}`);
  }
}

/** The pending change set: everything the working tree differs from its last commit by. */
function gitChangeSet(root: string): string[] {
  // --untracked-files=all lists new files individually; the default collapses a wholly
  // untracked directory to its name, hiding the files a check must see.
  const args = ["status", "--porcelain", "--untracked-files=all"];
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "verify needs a change set but could not read one from git — run it inside a git repository",
    );
  }
  const changed = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    if (line === "") continue;
    // Porcelain: two status chars, a space, then the path — or "old -> new" for a rename.
    const path = line.slice(3);
    changed.add(path.includes(" -> ") ? path.slice(path.indexOf(" -> ") + 4) : path);
  }
  return [...changed];
}

/**
 * A minimatch-style glob over posix paths: `**` spans directory boundaries, a single `*`
 * and `?` stay within one segment.
 */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?"; // `**/` also matches zero directories
        } else re += ".*";
      } else re += "[^/]*";
    } else if (char === "?") re += "[^/]";
    else re += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function basename(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return name.endsWith(".json") ? name.slice(0, -".json".length) : name;
}

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
