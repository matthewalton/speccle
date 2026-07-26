import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git, gitStdout } from "./git.ts";

describe("gitStdout", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function repo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-git-"));
    roots.push(root);
    git(root, ["init", "-q", "-b", "main"]);
    return root;
  }

  it("returns stdout when the command succeeds", async () => {
    const root = await repo();
    // `symbolic-ref`, not `rev-parse --abbrev-ref`: HEAD is unborn until the first commit.
    expect(gitStdout(root, ["symbolic-ref", "--short", "HEAD"])?.trim()).toBe("main");
  });

  it("returns undefined when git runs but fails", async () => {
    const root = await repo();
    expect(gitStdout(root, ["show", "no-such-ref:./nothing"])).toBeUndefined();
  });

  it("returns undefined when git could not run at all", () => {
    // A missing cwd fails the spawn itself, so `status` is null rather than non-zero.
    expect(gitStdout(join(tmpdir(), "speccle-git-absent"), ["status"])).toBeUndefined();
  });
});
