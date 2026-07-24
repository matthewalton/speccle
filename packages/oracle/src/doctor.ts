import { access, readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readConfig } from "./config.ts";
import { ownVersion, STRENGTH_DEPS, STRYKER_CONFIG_NAMES } from "./init.ts";
import { LENSES_DIR } from "./lenses.ts";
import { SKILLS_DIR } from "./skills.ts";

/** How a repo's committed payload — skills or lenses — stands against the CLI's bundled copy. */
export type PayloadStatus = "current" | "stale" | "ahead" | "unstamped" | "absent";

/** Whether the strength stack matches the current preset. `absent` = never provisioned. */
export type StackStatus = "current" | "drift" | "absent";

export type DepStatus = "ok" | "behind" | "missing";

export interface DepCheck {
  name: string;
  /** The major the current preset pins (ADR-0008). */
  wantedMajor: number;
  /** The version range the target declares, or null when the dep is absent. */
  declared: string | null;
  status: DepStatus;
}

/** The JSON contract of `speccle doctor --json`. */
export interface DoctorReport {
  root: string;
  /** The installed CLI's version — the `speccle@X` running this command. */
  cli: string;
  skills: {
    /** The version recorded in `.speccle/config.json`, or null when unstamped. */
    recorded: string | null;
    /** The version this CLI would materialize — its own version. */
    bundled: string;
    status: PayloadStatus;
  };
  lenses: {
    /** The version recorded in `.speccle/config.json`, or null when unstamped. */
    recorded: string | null;
    /** The version this CLI would vendor — its own version. */
    bundled: string;
    status: PayloadStatus;
  };
  stack: {
    /** True when a stryker config exists — the marker `strength init` leaves. */
    provisioned: boolean;
    deps: DepCheck[];
    status: StackStatus;
  };
  /** True when nothing is stale, behind, or drifted — a clean bill of health. */
  ok: boolean;
}

/**
 * Reports the truth about the three things that drift in a Speccle consumer — the CLI, the
 * committed skills, and the strength stack — and never mutates a byte (#182, ADR-0046).
 * Offline and deterministic: it compares the repo against the installed CLI, not against
 * the npm registry — "is there a newer release" is `update`'s network job, not this one's.
 */
export async function doctor(target: string): Promise<DoctorReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const cli = await ownVersion();

  const config = await readConfig(root);
  const skillsRecorded = config?.skillsVersion ?? null;
  const skillsStatus = derivePayloadStatus(await hasSkills(root), skillsRecorded, cli);
  const lensesRecorded = config?.lensesVersion ?? null;
  const lensesStatus = derivePayloadStatus(await hasLenses(root), lensesRecorded, cli);

  const provisioned = await anyPresent(root, STRYKER_CONFIG_NAMES);
  const declared = await declaredDeps(root);
  const deps = STRENGTH_DEPS.map((spec) => checkDep(spec, declared));
  const stackStatus: StackStatus = !provisioned
    ? "absent"
    : deps.some((dep) => dep.status !== "ok")
      ? "drift"
      : "current";

  const current = (status: PayloadStatus): boolean => status === "current" || status === "absent";
  const ok = current(skillsStatus) && current(lensesStatus) && stackStatus !== "drift";

  return {
    root,
    cli,
    skills: { recorded: skillsRecorded, bundled: cli, status: skillsStatus },
    lenses: { recorded: lensesRecorded, bundled: cli, status: lensesStatus },
    stack: { provisioned, deps, status: stackStatus },
    ok,
  };
}

function derivePayloadStatus(
  present: boolean,
  recorded: string | null,
  bundled: string,
): PayloadStatus {
  if (!present) return "absent";
  if (recorded === null) return "unstamped";
  const order = compareVersions(recorded, bundled);
  return order === 0 ? "current" : order < 0 ? "stale" : "ahead";
}

function checkDep(spec: string, declared: Map<string, string>): DepCheck {
  const at = spec.lastIndexOf("@");
  const name = spec.slice(0, at);
  const wantedMajor = majorOf(spec.slice(at + 1)) ?? 0;
  const range = declared.get(name);
  if (range === undefined) return { name, wantedMajor, declared: null, status: "missing" };
  const declaredMajor = majorOf(range);
  // A repo ahead of the preset is the consumer's choice, not drift to nag about; only a
  // major below the preset is the "bump never propagated" bug this surface exists to catch.
  const status: DepStatus = declaredMajor !== null && declaredMajor < wantedMajor ? "behind" : "ok";
  return { name, wantedMajor, declared: range, status };
}

/** The union of a package.json's dependencies and devDependencies; empty when absent. */
async function declaredDeps(root: string): Promise<Map<string, string>> {
  let raw: string;
  try {
    raw = await readFile(join(root, "package.json"), "utf8");
  } catch {
    return new Map();
  }
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(raw) as typeof pkg;
  } catch {
    return new Map();
  }
  return new Map(Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }));
}

async function hasSkills(root: string): Promise<boolean> {
  try {
    const entries = await readdir(join(root, SKILLS_DIR), { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory());
  } catch {
    return false;
  }
}

async function hasLenses(root: string): Promise<boolean> {
  try {
    const entries = await readdir(join(root, LENSES_DIR));
    return entries.some((entry) => entry.endsWith(".md"));
  } catch {
    return false;
  }
}

async function anyPresent(root: string, names: string[]): Promise<boolean> {
  for (const name of names) {
    if (await exists(join(root, name))) return true;
  }
  return false;
}

/** The leading integer of a version or range — 4 from "^4", "4.1.0", ">=4.0.0". */
function majorOf(range: string): number | null {
  const digits = /\d+/.exec(range);
  return digits === null ? null : Number(digits[0]);
}

function compareVersions(a: string, b: string): number {
  const [pa, pb] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return 0;
}

/** [major, minor, patch] of a clean semver, prerelease and build metadata dropped. */
function parseVersion(version: string): [number, number, number] {
  const core = version.split(/[-+]/)[0] ?? "";
  const parts = core.split(".").map((part) => Number(part) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
