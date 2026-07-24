import { access, cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Where materialized skills land in a target repo — the path Claude Code loads them from. */
export const SKILLS_DIR = ".claude/skills";

export interface SkillResult {
  name: string;
  action: "written" | "refreshed";
}

export interface SkillsInitReport {
  root: string;
  /** Root-relative directory the skills were written into. */
  dir: string;
  /** Absolute path the skills were copied from. */
  source: string;
  skills: SkillResult[];
}

/**
 * Copies every bundled skill into the target's `.claude/skills/<name>/`, refreshing an
 * existing copy rather than merging into it, so the materialized tree mirrors the tarball
 * exactly and a re-run's git diff is the whole change a human reviews (ADR-0046, ADR-0040).
 * Only the skills Speccle ships are touched, by name; any other skill in the folder is left
 * alone.
 */
export async function materializeSkills(root: string, source?: string): Promise<SkillsInitReport> {
  const from = source ?? (await bundledSkillsDir());
  const names = await skillNames(from);
  const target = join(root, SKILLS_DIR);
  await mkdir(target, { recursive: true });

  const skills: SkillResult[] = [];
  for (const name of names) {
    const dest = join(target, name);
    const existed = await exists(dest);
    await rm(dest, { recursive: true, force: true });
    await cp(join(from, name), dest, { recursive: true });
    skills.push({ name, action: existed ? "refreshed" : "written" });
  }
  return { root, dir: SKILLS_DIR, source: from, skills };
}

async function skillNames(source: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch {
    throw new Error(`no bundled skills to materialize at ${source}`);
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * The shipped skills: a top-level `skills/` beside `dist/` in the published tarball
 * (ADR-0046). Running from source there is no bundled copy yet, so fall back to the
 * plugin's skill dirs — the very files the build copies into the tarball.
 */
async function bundledSkillsDir(): Promise<string> {
  const bundled = fileURLToPath(new URL("../skills", import.meta.url));
  if (await exists(bundled)) return bundled;
  const pluginSource = fileURLToPath(new URL("../../plugin/skills", import.meta.url));
  if (await exists(pluginSource)) return pluginSource;
  throw new Error(`no bundled skills found — expected them beside the CLI at ${bundled}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
