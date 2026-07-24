import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LENSES_DIR, TEMPLATE_LENS, materializeLenses } from "./lenses.ts";

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

/** A stand-in bundled lenses payload: a couple of baseline lenses plus the template. */
async function fixtureSource(files: Record<string, string>): Promise<string> {
  return writeTree(await tempDir("speccle-lenses-src-"), files);
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

describe("materializeLenses", () => {
  it("copies every bundled lens into .speccle/lenses/", async () => {
    const source = await fixtureSource({
      "correctness.md": "correctness body",
      "security.md": "security body",
      [TEMPLATE_LENS]: "template body",
    });
    const root = await tempDir("speccle-lenses-target-");

    const report = await materializeLenses(root, source);

    expect(report.dir).toBe(LENSES_DIR);
    // Sorted by filename: house-conventions.md falls between correctness.md and security.md.
    expect(report.lenses).toEqual([
      { name: "correctness.md", action: "written" },
      { name: TEMPLATE_LENS, action: "written" },
      { name: "security.md", action: "written" },
    ]);
    expect(await readFile(join(root, LENSES_DIR, "correctness.md"), "utf8")).toBe(
      "correctness body",
    );
    expect(await readFile(join(root, LENSES_DIR, TEMPLATE_LENS), "utf8")).toBe("template body");
  });

  it("refreshes a baseline lens on re-run, overwriting the target with the source", async () => {
    const root = await tempDir("speccle-lenses-target-");
    await materializeLenses(root, await fixtureSource({ "correctness.md": "v1" }));

    const report = await materializeLenses(root, await fixtureSource({ "correctness.md": "v2" }));

    expect(report.lenses).toEqual([{ name: "correctness.md", action: "refreshed" }]);
    expect(await readFile(join(root, LENSES_DIR, "correctness.md"), "utf8")).toBe("v2");
  });

  it("writes the house-conventions template only when it is absent", async () => {
    const root = await tempDir("speccle-lenses-target-");
    const report = await materializeLenses(
      root,
      await fixtureSource({ [TEMPLATE_LENS]: "shipped" }),
    );

    expect(report.lenses).toEqual([{ name: TEMPLATE_LENS, action: "written" }]);
    expect(await readFile(join(root, LENSES_DIR, TEMPLATE_LENS), "utf8")).toBe("shipped");
  });

  it("never clobbers an authored house-conventions lens on refresh", async () => {
    const root = await tempDir("speccle-lenses-target-");
    await writeTree(root, { [`${LENSES_DIR}/${TEMPLATE_LENS}`]: "my repo's own conventions" });

    const report = await materializeLenses(
      root,
      await fixtureSource({ [TEMPLATE_LENS]: "shipped" }),
    );

    expect(report.lenses).toEqual([{ name: TEMPLATE_LENS, action: "kept" }]);
    expect(await readFile(join(root, LENSES_DIR, TEMPLATE_LENS), "utf8")).toBe(
      "my repo's own conventions",
    );
  });

  it("leaves a lens the repo authored itself untouched", async () => {
    const source = await fixtureSource({ "correctness.md": "ours" });
    const root = await tempDir("speccle-lenses-target-");
    await writeTree(root, { [`${LENSES_DIR}/domain-rules.md`]: "repo-authored" });

    const report = await materializeLenses(root, source);

    expect(report.lenses.map((lens) => lens.name)).toEqual(["correctness.md"]);
    expect(await readFile(join(root, LENSES_DIR, "domain-rules.md"), "utf8")).toBe("repo-authored");
    expect(await exists(join(root, LENSES_DIR, "correctness.md"))).toBe(true);
  });

  it("vendors the packaged baseline lenses when no source is given", async () => {
    const root = await tempDir("speccle-lenses-target-");

    const report = await materializeLenses(root);

    const names = report.lenses.map((lens) => lens.name);
    expect(names).toContain("security.md");
    expect(names).toContain(TEMPLATE_LENS);
    expect(await readFile(join(root, LENSES_DIR, "risk.md"), "utf8")).toContain("floor");
  });
});
