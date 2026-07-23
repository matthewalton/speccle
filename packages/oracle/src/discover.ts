import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Dialect } from "./dialects.ts";

const SKIP_DIRS = new Set(["node_modules", "dist", "fixtures", "__fixtures__"]);

export function discoverSpecs(root: string): Promise<string[]> {
  return discoverFiles(root, (file) => basename(file) === "SPEC.md");
}

export function discoverTests(root: string, dialect: Dialect): Promise<string[]> {
  return discoverFiles(root, (file) => dialect.isTestFile(file));
}

/** `keep` receives each file's posix path relative to `root`. */
export async function discoverFiles(
  root: string,
  keep: (file: string) => boolean,
): Promise<string[]> {
  const found: string[] = [];

  async function walk(abs: string, rel: string): Promise<void> {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(abs, entry.name), rel === "" ? entry.name : `${rel}/${entry.name}`);
      } else if (entry.isFile()) {
        const file = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (keep(file)) found.push(file);
      }
    }
  }

  await walk(root, "");
  return found.sort();
}
