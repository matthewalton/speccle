import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Where materialized lenses land in a target repo — the dimensions `review` fans out over. */
export const LENSES_DIR = ".speccle/lenses";

/**
 * Where a repo keeps lenses aimed at a plan rather than a change set (ADR-0057). A
 * subdirectory, not a flag inside the file: `panel()` lists this directory non-recursively and
 * keeps only `*.md`, so a directory is already invisible to the review panel and its glob stays
 * as literal as it reads. A discriminator would make every reader parse each lens before it
 * could know whether to run it.
 */
export const PLAN_LENSES_DIR = `${LENSES_DIR}/plan`;

/**
 * The plan scaffold's one file, and the one name in that directory that is _not_ a lens.
 * Checks get this for free — `loadChecks` reads only `*.json`, so a `.md` there is inert — but
 * here the documentation and the content share an extension, so the exclusion has to be by
 * name and has to be stated wherever the fan-out is spelled (ADR-0057).
 */
export const PLAN_LENSES_README = "README.md";

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
  /** The plan surface beneath it: unversioned, since Speccle ships no plan lens. */
  plan: PlanLensesScaffoldReport;
}

export interface PlanLensesScaffoldReport {
  /** Root-relative directory the scaffold landed in. */
  dir: string;
  file: string;
  action: "written" | "kept";
  /** How many plan lenses the repo has authored here — 0 on a fresh scaffold. */
  authored: number;
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
  return { root, dir: LENSES_DIR, source: from, lenses, plan: await scaffoldPlanLenses(root) };
}

/**
 * Puts the plan surface on disk, because an extension point a repo cannot find is not an
 * extension point (ADR-0056). Nothing here is Speccle's: no plan lens ships, the README is
 * written only when absent, and a refresh never overwrites it — the posture the
 * house-conventions lens and `.speccle/checks/` both take. Idempotent, and reached through
 * `materializeLenses`, so `init` and `update` scaffold it without a call site of their own.
 */
export async function scaffoldPlanLenses(root: string): Promise<PlanLensesScaffoldReport> {
  const dir = join(root, PLAN_LENSES_DIR);
  await mkdir(dir, { recursive: true });

  const readme = join(dir, PLAN_LENSES_README);
  const present = await exists(readme);
  if (!present) await copyFile(bundledPlanLensesReadme(), readme);

  return {
    dir: PLAN_LENSES_DIR,
    file: PLAN_LENSES_README,
    action: present ? "kept" : "written",
    authored: (await planLensesState(root)).authored,
  };
}

/** What `doctor` reports about the surface: can the repo find it, and has it used it. */
export interface PlanLensesState {
  scaffolded: boolean;
  authored: number;
}

export async function planLensesState(root: string): Promise<PlanLensesState> {
  try {
    const entries = await readdir(join(root, PLAN_LENSES_DIR));
    return { scaffolded: true, authored: entries.filter(isPlanLens).length };
  } catch {
    return { scaffolded: false, authored: 0 };
  }
}

/** Every `*.md` here is a lens the fan-out runs — except the scaffold's own documentation. */
export function isPlanLens(name: string): boolean {
  return name.endsWith(".md") && name !== PLAN_LENSES_README;
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

/**
 * The plan scaffold's source: a top-level `templates/` beside `dist/` in the published
 * tarball, resolved the same way, and deliberately not under `lenses/` — `materializeLenses`
 * copies every `*.md` it finds there into the repo as a review lens.
 */
function bundledPlanLensesReadme(): string {
  return fileURLToPath(new URL(`../templates/plan-lenses-${PLAN_LENSES_README}`, import.meta.url));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
