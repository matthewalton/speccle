import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Spawning by name makes every call walk PATH, and under pnpm that is ~15 `node_modules/.bin`
 * misses before `/usr/bin`: measured at ~90ms per call, against ~8ms once resolved. The suites
 * below scaffold repos six-odd git commands at a time, so the lookup — not git, which traces at
 * ~2ms — was what pushed them towards vitest's 5s default.
 */
const GIT =
  (process.env.PATH ?? "")
    .split(delimiter)
    .map((dir) => join(dir, "git"))
    .find((candidate) => existsSync(candidate)) ?? "git";

/** Run one git command in `root`. */
export function git(root: string, ...args: string[]) {
  return spawnSync(GIT, args, { cwd: root, encoding: "utf8" });
}

/** `git`, bound to one scaffolded repo — the shape the scaffolds want. */
export function gitAt(root: string) {
  return (...args: string[]) => git(root, ...args);
}
