import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", "fixtures", "__fixtures__"]);

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export function discoverSpecs(root: string): Promise<string[]> {
  return discoverFiles(root, (name) => name === "SPEC.md");
}

export function discoverTests(root: string): Promise<string[]> {
  return discoverFiles(root, (name) => TEST_FILE.test(name));
}

async function discoverFiles(root: string, keep: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];

  async function walk(abs: string, rel: string): Promise<void> {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(abs, entry.name), rel === "" ? entry.name : `${rel}/${entry.name}`);
      } else if (entry.isFile() && keep(entry.name)) {
        found.push(rel === "" ? entry.name : `${rel}/${entry.name}`);
      }
    }
  }

  await walk(root, "");
  return found.sort();
}
