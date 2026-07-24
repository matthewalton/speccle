import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_DIALECT, DIALECT_NAMES } from "./dialects.ts";
import { detectPackageManager } from "./init.ts";

/** Where Speccle reads a repo's facts (ADR-0040). */
export const CONFIG_DIR = ".speccle";
export const CONFIG_FILE = `${CONFIG_DIR}/config.json`;

/** Corrects the repo defaults under a subtree. `path` is a root-relative posix prefix. */
export interface PathOverride {
  path: string;
  dialect?: string;
  suite?: string;
}

/**
 * The facts Speccle reads about a repo — never judgement (ADR-0040): the test dialect
 * and how to run the suite. `dialect` and `suite` are the repo defaults; `overrides`
 * correct them for a subtree of a mixed-language tree.
 */
export interface SpeccleConfig {
  dialect: string;
  suite: string;
  overrides?: PathOverride[];
  /**
   * The `speccle@X` that last materialized this repo's committed skills — the staleness
   * anchor `doctor` reads (ADR-0046). Written by `init` when it materializes; the tarball
   * version, not a content hash.
   */
  skillsVersion?: string;
  /**
   * The `speccle@X` that last vendored this repo's `.speccle/lenses/` (ADR-0043). Its own
   * anchor, not folded into `skillsVersion`, because lenses arrived after skills: a repo
   * initialized before them carries a `skillsVersion` and no `lensesVersion`, and that gap
   * is exactly the signal `doctor` needs to tell `update` to vendor them for the first time.
   */
  lensesVersion?: string;
}

/** The dialect and suite command in force at one path, overrides resolved. */
export interface ResolvedFacts {
  dialect: string;
  suite: string;
}

/** The JSON contract of `speccle init --json`. */
export interface ConfigInitReport {
  root: string;
  /** Root-relative path of the config file. */
  file: string;
  action: "written" | "kept";
  config: SpeccleConfig;
}

/** Reads `.speccle/config.json`; undefined when the repo has no config yet. */
export async function readConfig(root: string): Promise<SpeccleConfig | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(root, CONFIG_FILE), "utf8");
  } catch {
    return undefined;
  }
  let config: SpeccleConfig;
  try {
    config = JSON.parse(raw) as SpeccleConfig;
  } catch (err) {
    throw new Error(
      `${CONFIG_FILE} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // A wrong dialect must be a loud, visible failure — that is the whole point of writing
  // it down rather than guessing every time (ADR-0040).
  assertDialect(config.dialect);
  for (const override of config.overrides ?? []) {
    if (override.dialect !== undefined) assertDialect(override.dialect);
  }
  return config;
}

/**
 * The dialect and suite in force at a root-relative path. Every override whose path is a
 * prefix of `path` applies, most-specific last, so a longer override wins per field and a
 * shorter one still fills a field the longer omits.
 */
export function resolveFacts(config: SpeccleConfig, path: string): ResolvedFacts {
  let { dialect, suite } = config;
  const matching = (config.overrides ?? [])
    .filter((override) => underPath(path, override.path))
    .sort((a, b) => a.path.length - b.path.length);
  for (const override of matching) {
    if (override.dialect !== undefined) dialect = override.dialect;
    if (override.suite !== undefined) suite = override.suite;
  }
  return { dialect, suite };
}

/** Speccle's first guess at a repo's facts — written down, then corrected by hand. */
export async function detectConfig(root: string): Promise<SpeccleConfig> {
  const dialect = await detectDialect(root);
  return { dialect, suite: await detectSuite(root, dialect) };
}

/**
 * Writes `.speccle/config.json` from detection, or keeps an existing one untouched — the
 * written record is the source of truth, never the detection (ADR-0040), the same posture
 * `strength init` takes with the stack it provisions.
 *
 * When `payloadVersion` is given, it is (re)stamped onto both the skills and the lenses
 * anchors even on the kept path: `init`/`update` materialize both from the same tarball, so
 * the two anchors must move with them or a re-run would leave a recorded version behind the
 * files it just wrote. The facts themselves stay kept — only the stamps follow the payload.
 */
export async function initConfig(root: string, payloadVersion?: string): Promise<ConfigInitReport> {
  const stamped = (config: SpeccleConfig): SpeccleConfig =>
    payloadVersion === undefined
      ? config
      : { ...config, skillsVersion: payloadVersion, lensesVersion: payloadVersion };

  const existing = await readConfig(root);
  if (existing !== undefined) {
    const config = stamped(existing);
    const moved =
      payloadVersion !== undefined &&
      (existing.skillsVersion !== payloadVersion || existing.lensesVersion !== payloadVersion);
    if (moved) await writeConfig(root, config);
    return { root, file: CONFIG_FILE, action: "kept", config };
  }
  const config = stamped(await detectConfig(root));
  await writeConfig(root, config);
  return { root, file: CONFIG_FILE, action: "written", config };
}

export async function writeConfig(root: string, config: SpeccleConfig): Promise<void> {
  await mkdir(join(root, CONFIG_DIR), { recursive: true });
  await writeFile(join(root, CONFIG_FILE), JSON.stringify(config, null, 2) + "\n");
}

async function detectDialect(root: string): Promise<string> {
  if (await exists(join(root, "Package.swift"))) return "swift";
  // package.json or nothing: the TypeScript stack is the default dialect.
  return DEFAULT_DIALECT;
}

// The default suite runs the repo's own `test` script, except a swift repo, whose
// SwiftPM default cannot know an xcodebuild scheme (ADR-0040) — the human corrects it.
async function detectSuite(root: string, dialect: string): Promise<string> {
  if (dialect === "swift") return "swift test";
  const packageManager = await detectPackageManager(root);
  return packageManager === "bun" ? "bun run test" : `${packageManager} test`;
}

function assertDialect(name: string): void {
  if (!DIALECT_NAMES.includes(name)) {
    throw new Error(
      `${CONFIG_FILE}: unknown test dialect: ${name} — known dialects: ${DIALECT_NAMES.join(", ")}`,
    );
  }
}

function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
