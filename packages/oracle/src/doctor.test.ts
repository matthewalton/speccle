import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { doctor } from "./doctor.ts";
import { ownVersion } from "./init.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scaffold(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "speccle-doctor-"));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}

function config(skillsVersion?: string, lensesVersion?: string): string {
  return JSON.stringify({
    dialect: "ts-vitest",
    suite: "pnpm test",
    ...(skillsVersion !== undefined && { skillsVersion }),
    ...(lensesVersion !== undefined && { lensesVersion }),
  });
}

/** Any file under .claude/skills/<name>/ makes the dir count as materialized. */
const SKILL = ".claude/skills/feature/SKILL.md";
/** Any .md under .speccle/lenses/ makes the dir count as vendored. */
const LENS = ".speccle/lenses/correctness.md";

describe("doctor: skills staleness", () => {
  it("is current when the recorded version equals the CLI's", async () => {
    const root = await scaffold({
      [SKILL]: "",
      ".speccle/config.json": config(await ownVersion()),
    });
    expect((await doctor(root)).skills.status).toBe("current");
  });

  it("is stale when the recorded version trails the CLI", async () => {
    const root = await scaffold({ [SKILL]: "", ".speccle/config.json": config("0.0.1") });
    const report = await doctor(root);
    expect(report.skills.status).toBe("stale");
    expect(report.ok).toBe(false);
  });

  it("is ahead when the recorded version outranks the CLI", async () => {
    const root = await scaffold({ [SKILL]: "", ".speccle/config.json": config("999.0.0") });
    const report = await doctor(root);
    expect(report.skills.status).toBe("ahead");
    expect(report.ok).toBe(false);
  });

  it("is unstamped when skills are present but no version was recorded", async () => {
    const root = await scaffold({ [SKILL]: "", ".speccle/config.json": config() });
    const report = await doctor(root);
    expect(report.skills.status).toBe("unstamped");
    expect(report.ok).toBe(false);
  });

  it("is absent when no skills are materialized", async () => {
    const root = await scaffold({ "package.json": "{}" });
    const report = await doctor(root);
    expect(report.skills.status).toBe("absent");
    // Absent is not a failure — a fresh repo has nothing to be stale against.
    expect(report.ok).toBe(true);
  });
});

describe("doctor: lenses staleness", () => {
  it("is current when the recorded lenses version equals the CLI's", async () => {
    const root = await scaffold({
      [LENS]: "",
      ".speccle/config.json": config(undefined, await ownVersion()),
    });
    expect((await doctor(root)).lenses.status).toBe("current");
  });

  it("is stale when the recorded lenses version trails the CLI", async () => {
    const root = await scaffold({ [LENS]: "", ".speccle/config.json": config(undefined, "0.0.1") });
    const report = await doctor(root);
    expect(report.lenses.status).toBe("stale");
    expect(report.ok).toBe(false);
  });

  it("is unstamped when lenses are present but no version was recorded", async () => {
    const root = await scaffold({ [LENS]: "", ".speccle/config.json": config() });
    const report = await doctor(root);
    expect(report.lenses.status).toBe("unstamped");
    expect(report.ok).toBe(false);
  });

  it("is absent, and not a failure, when a current repo has no lenses vendored", async () => {
    const root = await scaffold({
      [SKILL]: "",
      ".speccle/config.json": config(await ownVersion()),
    });
    const report = await doctor(root);
    expect(report.lenses.status).toBe("absent");
    expect(report.ok).toBe(true); // skills current + lenses absent → clean
  });

  it("a pre-lenses repo upgrades through skills staleness, then update vendors lenses", async () => {
    const root = await scaffold({ [SKILL]: "", ".speccle/config.json": config("0.0.1") });
    const report = await doctor(root);
    expect(report.skills.status).toBe("stale"); // trailing CLI → out of date
    expect(report.lenses.status).toBe("absent"); // never vendored before lenses existed
    expect(report.ok).toBe(false);
  });
});

describe("doctor: strength stack", () => {
  it("is absent when no stryker config is present", async () => {
    const root = await scaffold({ "package.json": "{}" });
    expect((await doctor(root)).stack.status).toBe("absent");
  });

  it("is current when every preset dep meets its major", async () => {
    const root = await scaffold({
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({
        devDependencies: {
          vitest: "^4.1.0",
          "@vitest/coverage-istanbul": "^4.0.0",
          "@stryker-mutator/core": "^9.6.1",
          "@stryker-mutator/vitest-runner": "^9.0.0",
        },
      }),
    });
    const report = await doctor(root);
    expect(report.stack.status).toBe("current");
    expect(report.stack.deps.every((dep) => dep.status === "ok")).toBe(true);
  });

  it("counts a dep at a newer major than the preset as ok, not drift", async () => {
    const root = await scaffold({
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({
        devDependencies: {
          vitest: "^5.0.0",
          "@vitest/coverage-istanbul": "^5.0.0",
          "@stryker-mutator/core": "^10.0.0",
          "@stryker-mutator/vitest-runner": "^10.0.0",
        },
      }),
    });
    expect((await doctor(root)).stack.status).toBe("current");
  });

  it("flags a dep below the preset major as behind", async () => {
    const root = await scaffold({
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({ devDependencies: { "@stryker-mutator/core": "^8.9.0" } }),
    });
    const report = await doctor(root);
    expect(report.stack.status).toBe("drift");
    const core = report.stack.deps.find((dep) => dep.name === "@stryker-mutator/core");
    expect(core?.status).toBe("behind");
    const vitest = report.stack.deps.find((dep) => dep.name === "vitest");
    expect(vitest?.status).toBe("missing");
  });

  it("reads a dep declared under dependencies, not only devDependencies", async () => {
    const root = await scaffold({
      "stryker.config.json": "{}",
      "package.json": JSON.stringify({
        dependencies: {
          vitest: "^4.0.0",
          "@vitest/coverage-istanbul": "^4.0.0",
          "@stryker-mutator/core": "^9.0.0",
          "@stryker-mutator/vitest-runner": "^9.0.0",
        },
      }),
    });
    expect((await doctor(root)).stack.status).toBe("current");
  });
});

describe("doctor", () => {
  it("reports the installed CLI version", async () => {
    const root = await scaffold({ "package.json": "{}" });
    expect((await doctor(root)).cli).toBe(await ownVersion());
  });

  it("throws on a path that is not a directory", async () => {
    await expect(doctor(join(tmpdir(), "speccle-doctor-nonexistent-xyz"))).rejects.toThrow(
      "path not found",
    );
  });
});
