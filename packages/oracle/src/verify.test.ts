import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Check, verify } from "./verify.ts";

describe("verify", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function scaffold(files: Record<string, string>, checks: Record<string, Check> = {}) {
    const root = await mkdtemp(join(tmpdir(), "speccle-verify-"));
    roots.push(root);
    for (const [file, body] of Object.entries(files)) await write(root, file, body);
    for (const [name, check] of Object.entries(checks)) {
      await write(root, `.speccle/checks/${name}.json`, JSON.stringify(check));
    }
    return root;
  }

  async function write(root: string, file: string, body: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body);
  }

  it("passes when no checks are authored", async () => {
    const root = await scaffold({ "src/a.ts": "" });
    const report = await verify(root, { changed: ["src/a.ts"] });
    expect(report.clean).toBe(true);
    expect(report.checks).toEqual([]);
  });

  it("passes a require check when a changed file matches", async () => {
    const root = await scaffold(
      { "docs/changelog.md": "line" },
      { changelog: { require: { path: "docs/changelog.md" }, message: "update the changelog" } },
    );
    const report = await verify(root, { changed: ["docs/changelog.md", "src/a.ts"] });
    expect(report.clean).toBe(true);
    expect(report.checks[0]).toMatchObject({ id: "changelog", status: "pass" });
  });

  it("breaches a require check when no changed file matches", async () => {
    const root = await scaffold(
      { "src/a.ts": "" },
      { changelog: { require: { path: "docs/changelog.md" }, message: "update the changelog" } },
    );
    const report = await verify(root, { changed: ["src/a.ts"] });
    expect(report.clean).toBe(false);
    expect(report.breaches).toBe(1);
    expect(report.checks[0]).toMatchObject({ status: "breach", message: "update the changelog" });
  });

  it("breaches a forbid check and names the offending changed files", async () => {
    const root = await scaffold(
      { "src/a.ts": "const x = 1;\nconsole.log(x);\n", "src/b.ts": "export const y = 2;\n" },
      {
        "no-debug": {
          forbid: { path: "src/**/*.ts", contains: "console\\.log" },
          message: "no console.log in shipped source",
        },
      },
    );
    const report = await verify(root, { changed: ["src/a.ts", "src/b.ts"] });
    expect(report.clean).toBe(false);
    expect(report.checks[0]).toMatchObject({ status: "breach", offenders: ["src/a.ts"] });
  });

  it("passes a path-only forbid when nothing in scope changed", async () => {
    const root = await scaffold(
      { "src/a.ts": "" },
      { "no-gen": { forbid: { path: "generated/**" }, message: "do not hand-edit generated/" } },
    );
    const report = await verify(root, { changed: ["src/a.ts"] });
    expect(report.checks[0]).toMatchObject({ status: "pass" });
  });

  describe("the @Model round-trip invariant (the canonical cross-file check)", () => {
    const check: Check = {
      when: { path: "**/*.swift", contains: "@Model" },
      require: { path: "**/*RoundTripTests.swift" },
      message: "a changed @Model needs a persistence round-trip test in the same change",
      because: "Ladder rule #4",
    };

    it("is inactive when no @Model file changed", async () => {
      const root = await scaffold({ "Sources/Plain.swift": "struct Plain {}" }, { model: check });
      const report = await verify(root, { changed: ["Sources/Plain.swift"] });
      expect(report.checks[0]).toMatchObject({ status: "inactive" });
      expect(report.clean).toBe(true);
    });

    it("breaches when a @Model changed with no round-trip test in the change", async () => {
      const root = await scaffold(
        { "Sources/User.swift": "@Model class User {}" },
        { model: check },
      );
      const report = await verify(root, { changed: ["Sources/User.swift"] });
      expect(report.checks[0]).toMatchObject({ status: "breach", because: "Ladder rule #4" });
    });

    it("passes when the @Model change also changes a round-trip test", async () => {
      const root = await scaffold(
        {
          "Sources/User.swift": "@Model class User {}",
          "Tests/UserRoundTripTests.swift": "func test() {}",
        },
        { model: check },
      );
      const report = await verify(root, {
        changed: ["Sources/User.swift", "Tests/UserRoundTripTests.swift"],
      });
      expect(report.checks[0]).toMatchObject({ status: "pass" });
    });

    it("stays inactive when only the round-trip test changed but no @Model did", async () => {
      const root = await scaffold(
        { "Tests/UserRoundTripTests.swift": "func test() {}" },
        { model: check },
      );
      const report = await verify(root, { changed: ["Tests/UserRoundTripTests.swift"] });
      expect(report.checks[0]).toMatchObject({ status: "inactive" });
    });
  });

  it("matches ** across directory boundaries and * within a segment", async () => {
    const root = await scaffold(
      { "src/deep/nested/x.ts": "", "src/y.ts": "", "src/z.tsx": "" },
      { ts: { forbid: { path: "src/**/*.ts" }, message: "no ts changes" } },
    );
    const report = await verify(root, {
      changed: ["src/deep/nested/x.ts", "src/y.ts", "src/z.tsx"],
    });
    // ** spans src/deep/nested; *.ts excludes the .tsx.
    expect(report.checks[0]?.offenders).toEqual(["src/deep/nested/x.ts", "src/y.ts"]);
  });

  it("does not read content for a require that is only a path glob", async () => {
    const root = await scaffold(
      {},
      { present: { require: { path: "MIGRATION.md" }, message: "note the migration" } },
    );
    // No MIGRATION.md written, yet the path is in the change set: a path-only require is
    // satisfied by the path alone, never by reading a file that may not exist.
    const report = await verify(root, { changed: ["MIGRATION.md"] });
    expect(report.checks[0]).toMatchObject({ status: "pass" });
  });

  it("sorts the change set in the report", async () => {
    const root = await scaffold({});
    const report = await verify(root, { changed: ["z.ts", "a.ts", "m.ts"] });
    expect(report.changed).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("defaults a check id to its filename", async () => {
    const root = await scaffold(
      { "src/a.ts": "" },
      { "my-rule": { forbid: { path: "nothing/**" }, message: "x" } },
    );
    const report = await verify(root, { changed: ["src/a.ts"] });
    expect(report.checks[0]?.id).toBe("my-rule");
  });

  it("throws on a check that is not valid JSON, naming the file", async () => {
    const root = await scaffold({});
    await write(root, ".speccle/checks/broken.json", "{ not json");
    await expect(verify(root, { changed: [] })).rejects.toThrow(
      ".speccle/checks/broken.json is not valid JSON",
    );
  });

  it("throws on a check with neither require nor forbid", async () => {
    const root = await scaffold({}, { bad: { message: "x" } });
    await expect(verify(root, { changed: [] })).rejects.toThrow(
      'exactly one of "require" or "forbid"',
    );
  });

  it("throws on a check with both require and forbid", async () => {
    const root = await scaffold(
      {},
      { bad: { require: { path: "a" }, forbid: { path: "b" }, message: "x" } },
    );
    await expect(verify(root, { changed: [] })).rejects.toThrow(
      'exactly one of "require" or "forbid"',
    );
  });

  it("throws on a check with an empty message", async () => {
    const root = await scaffold({}, { bad: { require: { path: "a" }, message: "" } });
    await expect(verify(root, { changed: [] })).rejects.toThrow('non-empty "message"');
  });

  it("throws on a predicate with an invalid contains regex", async () => {
    const root = await scaffold(
      {},
      { bad: { forbid: { path: "a", contains: "(" }, message: "x" } },
    );
    await expect(verify(root, { changed: [] })).rejects.toThrow('"forbid.contains" is not a valid');
  });

  it("throws on a missing path", async () => {
    await expect(verify("/no/such/dir")).rejects.toThrow("path not found");
  });

  it("reads the pending change set from git when none is injected", async () => {
    const root = await scaffold(
      { "committed.ts": "" },
      {
        "no-debug": { forbid: { path: "**/*.ts", contains: "console\\.log" }, message: "no logs" },
      },
    );
    const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("add", ".");
    git("commit", "-qm", "init");
    // A new, uncommitted file with a forbidden pattern is the pending change verify must see.
    await write(root, "src/new.ts", "console.log('debug')");
    const report = await verify(root);
    expect(report.changed).toContain("src/new.ts");
    expect(report.checks[0]).toMatchObject({ status: "breach", offenders: ["src/new.ts"] });
  });
});
