import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { initConfig } from "./config.ts";
import { SKILLS_DIR, materializeSkills } from "./skills.ts";

const dirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function writeTree(root: string, files: Record<string, string>): Promise<string> {
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}

/** A stand-in bundled skills payload: two skill dirs, one carrying a references/ file. */
async function fixtureSource(files: Record<string, string>): Promise<string> {
  return writeTree(await tempDir("speccle-skills-src-"), files);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("materializeSkills", () => {
  it("copies every bundled skill, references included, into .claude/skills/", async () => {
    const source = await fixtureSource({
      "feature/SKILL.md": "feature body",
      "strengthen/SKILL.md": "strengthen body",
      "strengthen/references/heatmap.md": "heatmap doc",
    });
    const root = await tempDir("speccle-skills-target-");

    const report = await materializeSkills(root, source);

    expect(report.dir).toBe(SKILLS_DIR);
    expect(report.skills).toEqual([
      { name: "feature", action: "written" },
      { name: "strengthen", action: "written" },
    ]);
    expect(await readFile(join(root, SKILLS_DIR, "feature/SKILL.md"), "utf8")).toBe("feature body");
    expect(await readFile(join(root, SKILLS_DIR, "strengthen/references/heatmap.md"), "utf8")).toBe(
      "heatmap doc",
    );
  });

  it("refreshes an existing copy on re-run, mirroring the source exactly", async () => {
    const root = await tempDir("speccle-skills-target-");
    const first = await fixtureSource({
      "feature/SKILL.md": "v1",
      "feature/references/stale.md": "gone next time",
    });
    await materializeSkills(root, first);

    // The source moves on: the reference is dropped, the body rewritten.
    const second = await fixtureSource({ "feature/SKILL.md": "v2" });
    const report = await materializeSkills(root, second);

    expect(report.skills).toEqual([{ name: "feature", action: "refreshed" }]);
    expect(await readFile(join(root, SKILLS_DIR, "feature/SKILL.md"), "utf8")).toBe("v2");
    expect(await exists(join(root, SKILLS_DIR, "feature/references/stale.md"))).toBe(false);
  });

  it("leaves skills it does not ship untouched", async () => {
    const source = await fixtureSource({ "feature/SKILL.md": "ours" });
    const root = await tempDir("speccle-skills-target-");
    await writeTree(root, { [`${SKILLS_DIR}/mine/SKILL.md`]: "hand-written" });

    await materializeSkills(root, source);

    expect(await readFile(join(root, SKILLS_DIR, "mine/SKILL.md"), "utf8")).toBe("hand-written");
    expect(await exists(join(root, SKILLS_DIR, "feature/SKILL.md"))).toBe(true);
  });

  it("writes the skills alongside .speccle/config.json when init does both", async () => {
    const source = await fixtureSource({ "feature/SKILL.md": "ours" });
    const root = await writeTree(await tempDir("speccle-skills-target-"), { "package.json": "{}" });

    await initConfig(root);
    await materializeSkills(root, source);

    expect(await exists(join(root, ".speccle/config.json"))).toBe(true);
    expect(await exists(join(root, SKILLS_DIR, "feature/SKILL.md"))).toBe(true);
  });

  it("falls back to the plugin's skills when no source is given", async () => {
    const root = await tempDir("speccle-skills-target-");

    const report = await materializeSkills(root);

    const names = report.skills.map((skill) => skill.name);
    expect(names).toContain("feature");
    const pluginSkill = fileURLToPath(
      new URL("../../plugin/skills/feature/SKILL.md", import.meta.url),
    );
    expect(await readFile(join(root, SKILLS_DIR, "feature/SKILL.md"), "utf8")).toBe(
      await readFile(pluginSkill, "utf8"),
    );
  });
});
