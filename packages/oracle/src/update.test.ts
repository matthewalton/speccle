import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ownVersion } from "./init.ts";
import { update } from "./update.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scaffold(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "speccle-update-"));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}

function config(skillsVersion: string): string {
  return JSON.stringify({ dialect: "ts-vitest", suite: "pnpm test", skillsVersion });
}

async function recordedVersion(root: string): Promise<string | undefined> {
  const raw = await readFile(join(root, ".speccle/config.json"), "utf8");
  return (JSON.parse(raw) as { skillsVersion?: string }).skillsVersion;
}

describe("update: skills", () => {
  it("re-stamps a stale anchor forward to the CLI version", async () => {
    const version = await ownVersion();
    const root = await scaffold({
      "package.json": "{}",
      ".speccle/config.json": config("0.0.1"),
      ".claude/skills/feature/SKILL.md": "old",
    });
    const report = await update(root);
    expect(report.skills.from).toBe("0.0.1");
    expect(report.skills.to).toBe(version);
    expect(await recordedVersion(root)).toBe(version);
  });

  it("materializes the bundled skills into the repo", async () => {
    const root = await scaffold({ "package.json": "{}", ".speccle/config.json": config("0.0.1") });
    await update(root);
    expect(await readFile(join(root, ".claude/skills/feature/SKILL.md"), "utf8")).toContain("---");
  });

  it("keeps the repo facts while moving the stamp", async () => {
    const root = await scaffold({
      "package.json": "{}",
      ".speccle/config.json": JSON.stringify({
        dialect: "swift",
        suite: "xcodebuild test -scheme App",
        skillsVersion: "0.0.1",
      }),
    });
    await update(root);
    const raw = await readFile(join(root, ".speccle/config.json"), "utf8");
    const written = JSON.parse(raw) as { dialect: string; suite: string; skillsVersion: string };
    expect(written.dialect).toBe("swift");
    expect(written.suite).toBe("xcodebuild test -scheme App");
    expect(written.skillsVersion).toBe(await ownVersion());
  });

  it("reports an unstamped repo's from as null", async () => {
    const root = await scaffold({
      "package.json": "{}",
      ".speccle/config.json": JSON.stringify({ dialect: "ts-vitest", suite: "pnpm test" }),
    });
    expect((await update(root)).skills.from).toBeNull();
  });
});

describe("update: stack", () => {
  it("builds a fix command for the behind and missing deps", async () => {
    const root = await scaffold({
      ".speccle/config.json": config("0.0.1"),
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({ devDependencies: { "@stryker-mutator/core": "^8.0.0" } }),
    });
    const report = await update(root);
    expect(report.stack.status).toBe("drift");
    expect(report.stack.fixCommand).toContain("@stryker-mutator/core@^9");
    expect(report.stack.fixCommand).toContain("vitest@^4");
  });

  it("uses the target's package manager for the fix command", async () => {
    const root = await scaffold({
      ".speccle/config.json": config("0.0.1"),
      "pnpm-lock.yaml": "",
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({ devDependencies: { "@stryker-mutator/core": "^8.0.0" } }),
    });
    expect((await update(root)).stack.fixCommand).toMatch(/^pnpm add -D /);
  });

  it("offers no fix command when the stack is not provisioned", async () => {
    const root = await scaffold({ "package.json": "{}", ".speccle/config.json": config("0.0.1") });
    const report = await update(root);
    expect(report.stack.status).toBe("absent");
    expect(report.stack.fixCommand).toBeNull();
  });

  it("offers no fix command when every dep already meets the preset", async () => {
    const root = await scaffold({
      ".speccle/config.json": config("0.0.1"),
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({
        devDependencies: {
          vitest: "^4.0.0",
          "@vitest/coverage-istanbul": "^4.0.0",
          "@stryker-mutator/core": "^9.0.0",
          "@stryker-mutator/vitest-runner": "^9.0.0",
        },
      }),
    });
    const report = await update(root);
    expect(report.stack.status).toBe("current");
    expect(report.stack.fixCommand).toBeNull();
  });
});

describe("update", () => {
  it("prints the binary update command rather than running it", async () => {
    const root = await scaffold({ "package.json": "{}", ".speccle/config.json": config("0.0.1") });
    expect((await update(root)).cli.command).toBe("npm install -g speccle@latest");
  });

  it("refuses a repo with no config, pointing at init", async () => {
    const root = await scaffold({ "package.json": "{}" });
    await expect(update(root)).rejects.toThrow("run `speccle init` first");
  });

  it("throws on a path that is not a directory", async () => {
    await expect(update(join(tmpdir(), "speccle-update-nonexistent-xyz"))).rejects.toThrow(
      "path not found",
    );
  });
});
