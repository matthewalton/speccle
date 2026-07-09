import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist"]);

/**
 * Every spec.md under root, as sorted root-relative posix paths. Skips
 * node_modules, dist, and dot-directories.
 */
export async function discoverSpecs(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(abs: string, rel: string): Promise<void> {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(abs, entry.name), rel === "" ? entry.name : `${rel}/${entry.name}`);
      } else if (entry.isFile() && entry.name === "spec.md") {
        found.push(rel === "" ? "spec.md" : `${rel}/spec.md`);
      }
    }
  }

  await walk(root, "");
  return found.sort();
}
