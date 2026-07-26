import { git as runGit } from "../../src/git.ts";

/** Run one git command in `root`. */
export const git = (root: string, ...args: string[]) => runGit(root, args);

/** `git`, bound to one scaffolded repo — the shape the scaffolds want. */
export function gitAt(root: string) {
  return (...args: string[]) => git(root, ...args);
}
