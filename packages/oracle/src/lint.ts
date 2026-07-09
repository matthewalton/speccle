import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { discoverSpecs } from "./discover.ts";
import { parseSpec } from "./spec.ts";
import { runRules } from "./rules/index.ts";
import type { Violation } from "./violation.ts";

/** The typed JSON contract of `speccle-oracle lint --json`. */
export interface LintReport {
  /** Absolute path the file paths are relative to. */
  root: string;
  /** Spec files linted, root-relative, sorted. */
  files: string[];
  violations: Violation[];
  clean: boolean;
}

/** Lint every spec.md under target (a directory), or target itself (a file). */
export async function lint(target: string): Promise<LintReport> {
  const abs = resolve(target);
  let stats;
  try {
    stats = await stat(abs);
  } catch {
    throw new Error(`path not found: ${target}`);
  }

  const root = stats.isFile() ? dirname(abs) : abs;
  const files = stats.isFile() ? [basename(abs)] : await discoverSpecs(root);
  const specs = await Promise.all(
    files.map(async (file) => parseSpec(await readFile(join(root, file), "utf8"), file)),
  );
  const violations = runRules(specs);
  return { root, files, violations, clean: violations.length === 0 };
}
