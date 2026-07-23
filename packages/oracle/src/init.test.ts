import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectDoubleLoad, init, mutateGlobs, strykerConfig, vitestConfig } from "./init.ts";

const roots: string[] = [];

async function scaffold(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "speccle-init-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("strykerConfig", () => {
  it("carries the load-bearing preset fields: perTest and the json reporter", () => {
    const config = strykerConfig("pnpm", ["features/**/*.ts"]);
    expect(config.coverageAnalysis).toBe("perTest");
    expect(config.reporters).toContain("json");
    expect(config.jsonReporter).toEqual({ fileName: "reports/mutation/mutation.json" });
    expect(config.packageManager).toBe("pnpm");
    expect(config.mutate).toEqual(["features/**/*.ts"]);
  });
});

describe("vitestConfig", () => {
  it("splits the mutate globs into coverage include and exclude", () => {
    const source = vitestConfig(["features/**/*.ts", "!features/**/*.test.ts"]);
    expect(source).toContain('provider: "istanbul"');
    expect(source).toContain('"json-summary"');
    expect(source).toContain('include: ["features/**/*.ts"]');
    expect(source).toContain('exclude: ["features/**/*.test.ts"]');
  });
});

describe("mutateGlobs", () => {
  it("derives one glob pair per discovered feature folder", async () => {
    const root = await scaffold({});
    await mkdir(join(root, "features/basket"), { recursive: true });
    await mkdir(join(root, "features/checkout"), { recursive: true });
    await writeFile(join(root, "features/basket/SPEC.md"), "# spec\n");
    await writeFile(join(root, "features/checkout/SPEC.md"), "# spec\n");
    expect(await mutateGlobs(root)).toEqual([
      "features/basket/**/*.ts",
      "features/checkout/**/*.ts",
      "!features/basket/**/*.test.ts",
      "!features/checkout/**/*.test.ts",
    ]);
  });

  it("falls back to the conventional features glob when no spec exists yet", async () => {
    const root = await scaffold({});
    expect(await mutateGlobs(root)).toEqual(["features/**/*.ts", "!features/**/*.test.ts"]);
  });
});

describe("init", () => {
  it("writes both configs and names the missing devDependencies", async () => {
    const root = await scaffold({ "package.json": "{}" });
    const report = await init(root, { skipInstall: true });

    expect(report.files).toEqual([
      { file: "stryker.config.json", action: "written" },
      { file: "vitest.config.ts", action: "written" },
    ]);
    expect(report.missingDeps[0]).toMatch(/^speccle@\^\d+\.\d+\.\d+$/);
    expect(report.missingDeps.slice(1)).toEqual([
      "vitest@^4",
      "@vitest/coverage-istanbul@^4",
      "@stryker-mutator/core@^9",
      "@stryker-mutator/vitest-runner@^9",
    ]);
    expect(report.installRan).toBe(false);
    expect(report.installCommand).toBe(`npm install -D ${report.missingDeps.join(" ")}`);

    const written = JSON.parse(await readFile(join(root, "stryker.config.json"), "utf8")) as {
      coverageAnalysis: string;
      packageManager: string;
    };
    expect(written.coverageAnalysis).toBe("perTest");
    expect(written.packageManager).toBe("npm");
  });

  it("detects the package manager from the lockfile", async () => {
    const root = await scaffold({ "package.json": "{}", "pnpm-lock.yaml": "" });
    const report = await init(root, { skipInstall: true });
    expect(report.packageManager).toBe("pnpm");
    expect(report.installCommand).toMatch(/^pnpm add -D /);
  });

  it("keeps an existing config rather than overwriting it", async () => {
    const root = await scaffold({
      "package.json": "{}",
      "stryker.conf.json": '{ "mine": true }',
    });
    const report = await init(root, { skipInstall: true });
    expect(report.files).toEqual([
      { file: "stryker.conf.json", action: "kept" },
      { file: "vitest.config.ts", action: "written" },
    ]);
    expect(await readFile(join(root, "stryker.conf.json"), "utf8")).toBe('{ "mine": true }');
  });

  it("treats a vite.config.ts as the existing vitest config", async () => {
    const root = await scaffold({ "package.json": "{}", "vite.config.ts": "export default {};" });
    const report = await init(root, { skipInstall: true });
    expect(report.files[1]).toEqual({ file: "vite.config.ts", action: "kept" });
  });

  it("reports no missing devDependencies when the stack is already declared", async () => {
    const root = await scaffold({
      "package.json": JSON.stringify({
        devDependencies: {
          speccle: "^0.7.1",
          vitest: "^4.1.10",
          "@vitest/coverage-istanbul": "^4.1.10",
          "@stryker-mutator/core": "^9.6.1",
          "@stryker-mutator/vitest-runner": "^9.6.1",
        },
      }),
    });
    const report = await init(root, { skipInstall: true });
    expect(report.missingDeps).toEqual([]);
    expect(report.installCommand).toBeNull();
  });

  it("pins the speccle devDependency to the running oracle's own version", async () => {
    const root = await scaffold({ "package.json": "{}" });
    const report = await init(root, { skipInstall: true });
    const own = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(report.missingDeps[0]).toBe(`speccle@^${own.version}`);
  });

  it("prefers explicit mutate globs over derivation", async () => {
    const root = await scaffold({ "package.json": "{}" });
    const report = await init(root, { mutate: ["src/**/*.ts"], skipInstall: true });
    expect(report.mutate).toEqual(["src/**/*.ts"]);
  });

  it("is idempotent: a second run keeps everything the first run wrote", async () => {
    const root = await scaffold({ "package.json": "{}" });
    await init(root, { skipInstall: true });
    const second = await init(root, { skipInstall: true });
    expect(second.files.every((f) => f.action === "kept")).toBe(true);
  });

  it("refuses a root without a package.json", async () => {
    const root = await scaffold({});
    await expect(init(root, { skipInstall: true })).rejects.toThrow(/no package\.json/);
  });
});

describe("detectDoubleLoad", () => {
  async function vendorSkills(root: string): Promise<void> {
    await mkdir(join(root, ".claude/skills/feature"), { recursive: true });
    await writeFile(join(root, ".claude/skills/feature/SKILL.md"), "---\nname: feature\n---\n");
  }

  async function settingsFile(root: string, content: string): Promise<string> {
    const file = join(root, "home/.claude/settings.json");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    return file;
  }

  it("warns when vendored skills and an enabled user-level speccle plugin coexist", async () => {
    const root = await scaffold({});
    await vendorSkills(root);
    const settings = await settingsFile(
      root,
      JSON.stringify({ enabledPlugins: { "speccle@speccle-marketplace": true } }),
    );
    expect(await detectDoubleLoad(root, settings)).toBe(true);
  });

  it("stays quiet when the target has no vendored skills", async () => {
    const root = await scaffold({});
    const settings = await settingsFile(
      root,
      JSON.stringify({ enabledPlugins: { "speccle@speccle-marketplace": true } }),
    );
    expect(await detectDoubleLoad(root, settings)).toBe(false);
  });

  it("stays quiet when the user-level plugin is absent or disabled", async () => {
    const root = await scaffold({});
    await vendorSkills(root);
    const disabled = await settingsFile(
      root,
      JSON.stringify({ enabledPlugins: { "speccle@speccle-marketplace": false } }),
    );
    expect(await detectDoubleLoad(root, disabled)).toBe(false);
    expect(await detectDoubleLoad(root, join(root, "home/nowhere.json"))).toBe(false);
  });

  it("treats unreadable settings as no warning, never an error", async () => {
    const root = await scaffold({});
    await vendorSkills(root);
    const mangled = await settingsFile(root, "{not json");
    expect(await detectDoubleLoad(root, mangled)).toBe(false);
  });
});
