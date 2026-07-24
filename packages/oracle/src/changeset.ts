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
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error("could not read a change set from git — run this inside a git repository");
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
