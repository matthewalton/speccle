import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", "fixtures", "__fixtures__"]);

export async function discoverSpecs(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(abs: string, rel: string): Promise<void> {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(abs, entry.name), rel === "" ? entry.name : `${rel}/${entry.name}`);
      } else if (entry.isFile() && entry.name === "SPEC.md") {
        found.push(rel === "" ? "SPEC.md" : `${rel}/SPEC.md`);
      }
    }
  }

  await walk(root, "");
  return found.sort();
}
