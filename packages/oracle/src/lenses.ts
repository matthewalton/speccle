import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Where materialized lenses land in a target repo — the dimensions `review` fans out over. */
export const LENSES_DIR = ".speccle/lenses";

/**
 * The one lens that ships as a template and is the repo's own to author (ADR-0043) — its
 * house-conventions lens is the real IP Speccle cannot write. It is written once, when
 * absent, and a refresh never overwrites it: clobbering an authored lens would be exactly
 * the data loss the "with a lock" property exists to prevent.
 */
export const TEMPLATE_LENS = "house-conventions.md";

export interface LensResult {
  name: string;
  /** `written` — newly placed. `refreshed` — a baseline lens overwritten. `kept` — the template left as-is. */
  action: "written" | "refreshed" | "kept";
}

export interface LensesInitReport {
  root: string;
  /** Root-relative directory the lenses were written into. */
  dir: string;
  /** Absolute path the lenses were copied from. */
  source: string;
  lenses: LensResult[];
}

/**
 * Vendors the baseline lenses into the target's `.speccle/lenses/`, so `review` has a panel
 * to fan out over on any repo day one (ADR-0043). The baseline lenses are Speccle's and are
 * overwritten on every run — the same "the tarball is the source of truth" posture the skills
 * take (ADR-0046) — but the house-conventions template is the repo's own and is only ever
 * written when absent. Any lens the repo authored itself is left untouched: only the bundled
 * names are considered, so a repo-added lens is never seen, let alone removed.
 */
export async function materializeLenses(root: string, source?: string): Promise<LensesInitReport> {
  const from = source ?? bundledLensesDir();
  const names = await lensNames(from);
  const target = join(root, LENSES_DIR);
  await mkdir(target, { recursive: true });

  const lenses: LensResult[] = [];
  for (const name of names) {
    const dest = join(target, name);
    const present = await exists(dest);
    if (name === TEMPLATE_LENS) {
      if (!present) await copyFile(join(from, name), dest);
      lenses.push({ name, action: present ? "kept" : "written" });
      continue;
    }
    await copyFile(join(from, name), dest);
    lenses.push({ name, action: present ? "refreshed" : "written" });
  }
  return { root, dir: LENSES_DIR, source: from, lenses };
}

async function lensNames(source: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(source);
  } catch {
    throw new Error(`no bundled lenses to materialize at ${source}`);
  }
  return entries.filter((entry) => entry.endsWith(".md")).sort();
}

/**
 * The shipped lenses: a top-level `lenses/` beside `dist/` in the published tarball. Unlike
 * the skills — copied in from the plugin at build time — the lens sources live in this
 * package already, so the same relative path resolves whether the CLI runs from `dist/` or
 * straight from `src/`; no build-time bundle and no source fallback are needed.
 */
function bundledLensesDir(): string {
  return fileURLToPath(new URL("../lenses", import.meta.url));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
