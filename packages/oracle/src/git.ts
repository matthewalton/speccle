import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Spawning by name makes every call walk PATH, and the misses are what cost — measured at ~8ms
 * each on macOS, against ~2ms for git itself. Under `npx`/`pnpm` the caller's PATH puts a dozen
 * or more entries ahead of git's, so `risk`, which reads a baseline once per changed spec file,
 * paid that walk per file. Resolved once here instead: the binary is fixed at module load rather
 * than per call, which suits a short-lived CLI but means a PATH edit mid-process is not seen.
 */
const GIT =
  (process.env.PATH ?? "")
    .split(delimiter)
    .map((dir) => join(dir, "git"))
    .find((candidate) => existsSync(candidate)) ?? "git";

/** Run one git command in `root`, with the binary resolved once. */
export function git(root: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(GIT, args, { cwd: root, encoding: "utf8" });
}

/** Git's stdout, or undefined when the command could not run or failed. */
export function gitStdout(root: string, args: string[]): string | undefined {
  const result = git(root, args);
  return result.error === undefined && result.status === 0 ? result.stdout : undefined;
}
