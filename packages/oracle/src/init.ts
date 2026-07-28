import { spawnSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readConfig, resolveFacts, scorable } from "./config.ts";
import { DEFAULT_DIALECT } from "./dialects.ts";
import { discoverSpecs } from "./discover.ts";
import {
  detectPackageManager,
  installCommandFor,
  removeCommandFor,
  type PackageManager,
} from "./packagemanager.ts";

// The one stack the oracle join is proven on (ADR-0008), pinned to those majors.
export const STRENGTH_DEPS = [
  "vitest@^4",
  "@vitest/coverage-istanbul@^4",
  "@stryker-mutator/core@^9",
  "@stryker-mutator/vitest-runner@^9",
];

// Names this CLI has published under before (ADR-0045). A repo provisioned under an old name
// keeps that package beside the current one, and `node_modules/.bin/` still exposes its stale
// binary — dead weight the ladder never picks, but weight the repo should know it is carrying.
export const SUPERSEDED_DEPS = ["speccle-oracle"];

export interface InitFileResult {
  file: string;
  action: "written" | "kept";
}

export interface InitReport {
  root: string;
  packageManager: PackageManager;
  missingDeps: string[];
  installCommand: string | null;
  installRan: boolean;
  /** Declared dependencies this CLI has since renamed past — reported, never removed for you. */
  supersededDeps: string[];
  /** The command that would drop them, or null when there is nothing superseded. */
  removeCommand: string | null;
  mutate: string[];
  files: InitFileResult[];
  doubleLoad: boolean;
}

export interface InitOptions {
  mutate?: string[];
  skipInstall?: boolean;
}

export const STRYKER_CONFIG_NAMES = ["stryker.config", "stryker.conf"].flatMap((base) =>
  ["json", "js", "mjs", "cjs"].map((ext) => `${base}.${ext}`),
);

const VITEST_CONFIG_NAMES = ["vitest.config", "vite.config"].flatMap((base) =>
  ["ts", "mts", "cts", "js", "mjs", "cjs"].map((ext) => `${base}.${ext}`),
);

export interface StrykerPreset {
  $schema: string;
  packageManager: PackageManager;
  testRunner: string;
  plugins: string[];
  coverageAnalysis: string;
  reporters: string[];
  jsonReporter: { fileName: string };
  mutate: string[];
}

export function strykerConfig(packageManager: PackageManager, mutate: string[]): StrykerPreset {
  return {
    $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
    packageManager,
    testRunner: "vitest",
    plugins: ["@stryker-mutator/vitest-runner"],
    coverageAnalysis: "perTest",
    reporters: ["json", "progress"],
    jsonReporter: { fileName: "reports/mutation/mutation.json" },
    mutate,
  };
}

export function vitestConfig(mutate: string[]): string {
  const include = mutate.filter((glob) => !glob.startsWith("!"));
  const exclude = mutate.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1));
  const list = (globs: string[]) => globs.map((g) => JSON.stringify(g)).join(", ");
  return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["json-summary", "text"],
      include: [${list(include)}],
      exclude: [${list(exclude)}],
    },
  },
});
`;
}

export async function mutateGlobs(root: string): Promise<string[]> {
  const specs = await discoverSpecs(root);
  const dirs = [...new Set(specs.map((spec) => dirname(spec)))].sort();
  if (dirs.length === 0 || dirs.includes("."))
    return ["features/**/*.ts", "!features/**/*.test.ts"];
  return [...dirs.map((dir) => `${dir}/**/*.ts`), ...dirs.map((dir) => `!${dir}/**/*.test.ts`)];
}

export async function init(root: string, options: InitOptions = {}): Promise<InitReport> {
  await assertScorable(root);
  const packageJson = await readPackageJson(root);
  const packageManager = await detectPackageManager(root);
  const mutate = options.mutate?.length ? options.mutate : await mutateGlobs(root);

  const declared = new Set([
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.dependencies ?? {}),
  ]);
  const wantedDeps = [`speccle@^${await ownVersion()}`, ...STRENGTH_DEPS];
  const missingDeps = wantedDeps.filter((spec) => !declared.has(withoutVersion(spec)));
  const installCommand =
    missingDeps.length > 0 ? installCommandFor(packageManager, missingDeps) : null;
  const supersededDeps = SUPERSEDED_DEPS.filter((name) => declared.has(name));
  const removeCommand =
    supersededDeps.length > 0 ? removeCommandFor(packageManager, supersededDeps) : null;

  const files: InitFileResult[] = [
    await provision(
      root,
      STRYKER_CONFIG_NAMES,
      "stryker.config.json",
      () => JSON.stringify(strykerConfig(packageManager, mutate), null, 2) + "\n",
    ),
    await provision(root, VITEST_CONFIG_NAMES, "vitest.config.ts", () => vitestConfig(mutate)),
  ];

  let installRan = false;
  if (installCommand !== null && !options.skipInstall) {
    runInstall(root, installCommand);
    installRan = true;
  }

  const doubleLoad = await detectDoubleLoad(root);

  return {
    root,
    packageManager,
    missingDeps,
    installCommand,
    installRan,
    supersededDeps,
    removeCommand,
    mutate,
    files,
    doubleLoad,
  };
}

/**
 * The stack this command provisions is Stryker + vitest, and only a scorable dialect can run
 * it (ADR-0008 as amended by ADR-0038). Refusing is the point: the deps would install, the
 * configs would be written, and `strength` would still never score the repo — so the failure
 * has to land here, where it names the dialect, rather than as an empty heatmap later.
 */
async function assertScorable(root: string): Promise<void> {
  const config = await readConfig(root);
  const dialect = config ? resolveFacts(config, ".").dialect : DEFAULT_DIALECT;
  if (scorable(config, dialect)) return;
  throw new Error(
    `strength init provisions the TypeScript stack (Stryker + vitest), which the "${dialect}" ` +
      `dialect cannot run — oracle strength needs per-test mutant attribution, and only ` +
      `StrykerJS produces it today. Nothing was installed or written.`,
  );
}

// The materialized copies must be the one source of truth: a target that vendors the
// skills project-level should not also load the user-level plugin. Best-effort — the
// settings shape is Claude Code's, not ours; absence of the file means no warning.
export async function detectDoubleLoad(
  root: string,
  settingsFile = join(homedir(), ".claude", "settings.json"),
): Promise<boolean> {
  if (!(await exists(join(root, ".claude", "skills", "feature", "SKILL.md")))) return false;
  let raw: string;
  try {
    raw = await readFile(settingsFile, "utf8");
  } catch {
    return false;
  }
  try {
    const settings = JSON.parse(raw) as { enabledPlugins?: Record<string, boolean> };
    return Object.entries(settings.enabledPlugins ?? {}).some(
      ([plugin, enabled]) => enabled && plugin.startsWith("speccle@"),
    );
  } catch {
    return false;
  }
}

/** The installed CLI's own version — the `speccle@X` that ships this bin and its skills. */
export async function ownVersion(): Promise<string> {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(root: string): Promise<PackageJson> {
  let raw: string;
  try {
    raw = await readFile(join(root, "package.json"), "utf8");
  } catch {
    throw new Error(`no package.json found in ${root} — run init at the target's root`);
  }
  return JSON.parse(raw) as PackageJson;
}

async function provision(
  root: string,
  existingNames: string[],
  writeName: string,
  content: () => string,
): Promise<InitFileResult> {
  for (const name of existingNames) {
    if (await exists(join(root, name))) return { file: name, action: "kept" };
  }
  await writeFile(join(root, writeName), content());
  return { file: writeName, action: "written" };
}

function runInstall(root: string, command: string): void {
  const [manager, ...args] = command.split(" ");
  const result = spawnSync(manager!, args, { cwd: root, encoding: "utf8" });
  if (result.error) throw new Error(`${command} failed: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${command} failed (exit ${result.status}):\n${result.stderr}`);
}

function withoutVersion(spec: string): string {
  return spec.slice(0, spec.lastIndexOf("@"));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
