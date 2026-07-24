import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * A predicate over the change set: files whose root-relative path matches `path` and, when
 * `contains` is set, whose current content matches that regex. A path-only predicate asks
 * only whether such a file changed at all. Shared by `verify` checks and `risk` policy signals.
 */
export interface Predicate {
  /** Glob over root-relative posix paths. `**` spans directories, `*`/`?` stay in a segment. */
  path: string;
  /** JavaScript regex source the file's content must match to qualify. */
  contains?: string;
}

/** The changed files a predicate matches — by path glob, then by content when `contains` is set. */
export async function matching(
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

export async function anyMatches(
  predicate: Predicate,
  changed: string[],
  read: (file: string) => Promise<string | undefined>,
): Promise<boolean> {
  return (await matching(predicate, changed, read)).length > 0;
}

/**
 * A reader for the change set's current content, caching each file so a file read by several
 * predicates is only touched once. Missing files read as undefined rather than throwing.
 */
export function contentReader(root: string): (file: string) => Promise<string | undefined> {
  const cache = new Map<string, string | undefined>();
  return async (file) => {
    if (!cache.has(file)) cache.set(file, await readMaybe(join(root, file)));
    return cache.get(file);
  };
}

/** The pending change set: everything the working tree differs from its last commit by. */
export function gitChangeSet(root: string): string[] {
  // --untracked-files=all lists new files individually; the default collapses a wholly
  // untracked directory to its name, hiding the files that must be seen.
  const args = ["status", "--porcelain", "--untracked-files=all"];
  const stdout = git(root, args);
  if (stdout === undefined) {
    throw new Error("could not read a change set from git — run this inside a git repository");
  }
  const changed = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    // Porcelain: two status chars, a space, then the path — or "old -> new" for a rename.
    const path = line.slice(3);
    changed.add(path.includes(" -> ") ? path.slice(path.indexOf(" -> ") + 4) : path);
  }
  return [...changed];
}

/** A committed change set, and the commit its content baseline reads from. */
export interface RangeChangeSet {
  changed: string[];
  /** The merge base: the commit the change set is measured from, and its content baseline. */
  baseline: string;
}

/**
 * The committed change set between a base ref and HEAD — the change set a CI driver reviews,
 * where the working tree is clean and the change lives in commits instead. Measured from the
 * **merge base**, not the base's tip, so commits that landed on the base after this branch
 * left it are not attributed to this change; that is the set a pull request shows.
 */
export function gitRangeChangeSet(root: string, base: string): RangeChangeSet {
  const mergeBase = git(root, ["merge-base", base, "HEAD"])?.trim();
  if (mergeBase === undefined || mergeBase === "") {
    // The likeliest cause in CI by far: a shallow checkout that fetched no shared history.
    throw new Error(
      `no merge base between "${base}" and HEAD — fetch enough history for the two to share a commit`,
    );
  }
  // A rename reports its destination path only, matching the working tree's "old -> new".
  const stdout = git(root, ["diff", "--name-only", mergeBase, "HEAD"]);
  if (stdout === undefined) throw new Error(`could not diff "${base}" against HEAD`);
  const changed = stdout.split("\n").filter((line) => line !== "");
  return { changed: [...new Set(changed)], baseline: mergeBase };
}

/** Git's stdout, or undefined when the command could not run or failed. */
function git(root: string, args: string[]): string | undefined {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.error === undefined && result.status === 0 ? result.stdout : undefined;
}

/** Validates a predicate's shape, naming the offending file — a silently broken predicate is worse than none. */
export function assertPredicate(predicate: Predicate | undefined, key: string, file: string): void {
  if (predicate === undefined) return;
  if (typeof predicate.path !== "string" || predicate.path === "") {
    throw new Error(`${file}: "${key}" needs a non-empty "path" glob`);
  }
  if (predicate.contains !== undefined) {
    try {
      new RegExp(predicate.contains);
    } catch (err) {
      throw new Error(`${file}: "${key}.contains" is not a valid regex: ${messageOf(err)}`);
    }
  }
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

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
