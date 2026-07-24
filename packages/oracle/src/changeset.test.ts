import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitChangeSet, gitRangeChangeSet } from "./changeset.ts";

describe("gitRangeChangeSet", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  /** A repo with one commit on `main`, ready to branch from. */
  async function repo(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-changeset-"));
    roots.push(root);
    for (const [file, body] of Object.entries(files)) await write(root, file, body);
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@t.t");
    git(root, "config", "user.name", "t");
    git(root, "add", ".");
    git(root, "commit", "-qm", "init");
    return root;
  }

  function git(root: string, ...args: string[]) {
    return spawnSync("git", args, { cwd: root, encoding: "utf8" });
  }

  async function write(root: string, file: string, body: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body);
  }

  it("reports what the commits on a branch changed", async () => {
    const root = await repo({ "src/a.ts": "export const a = 1;\n" });
    git(root, "checkout", "-qb", "feature");
    await write(root, "src/a.ts", "export const a = 2;\n");
    await write(root, "src/b.ts", "export const b = 1;\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "change a, add b");

    const range = gitRangeChangeSet(root, "main");

    expect(range.changed.sort()).toEqual(["src/a.ts", "src/b.ts"]);
    // The working tree is clean, which is exactly why the range is needed at all.
    expect(gitChangeSet(root)).toEqual([]);
  });

  it("reports a rename by its destination path only, matching the working tree's change set", async () => {
    const root = await repo({ "src/old.ts": "export const a = 1;\n" });
    git(root, "checkout", "-qb", "feature");
    git(root, "mv", "src/old.ts", "src/new.ts");
    git(root, "commit", "-qm", "rename");

    expect(gitRangeChangeSet(root, "main").changed).toEqual(["src/new.ts"]);
  });

  it("includes a deleted file", async () => {
    const root = await repo({ "src/a.ts": "", "src/gone.ts": "" });
    git(root, "checkout", "-qb", "feature");
    git(root, "rm", "-q", "src/gone.ts");
    git(root, "commit", "-qm", "delete");

    expect(gitRangeChangeSet(root, "main").changed).toEqual(["src/gone.ts"]);
  });

  it("does not attribute commits that landed on the base after the branch left it", async () => {
    const root = await repo({ "src/a.ts": "" });
    git(root, "checkout", "-qb", "feature");
    await write(root, "src/mine.ts", "");
    git(root, "add", ".");
    git(root, "commit", "-qm", "mine");
    git(root, "checkout", "-q", "main");
    await write(root, "src/theirs.ts", "");
    git(root, "add", ".");
    git(root, "commit", "-qm", "theirs");
    git(root, "checkout", "-q", "feature");

    const range = gitRangeChangeSet(root, "main");

    // Measured from the merge base, not the base's tip: someone else's commit is not my change.
    expect(range.changed).toEqual(["src/mine.ts"]);
    expect(range.baseline).toBe(git(root, "merge-base", "main", "HEAD").stdout.trim());
  });

  it("raises a fetch-more-history error when the two refs share no commit", async () => {
    const root = await repo({ "src/a.ts": "" });
    git(root, "checkout", "-q", "--orphan", "unrelated");
    git(root, "commit", "-qm", "no shared history", "--allow-empty");

    expect(() => gitRangeChangeSet(root, "main")).toThrow(/no merge base between "main" and HEAD/);
  });

  it("raises the same error for a ref that does not exist", async () => {
    const root = await repo({ "src/a.ts": "" });

    expect(() => gitRangeChangeSet(root, "no-such-branch")).toThrow(/fetch enough history/);
  });
});
