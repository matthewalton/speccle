import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  assertPredicate,
  contentReader,
  gitChangeSet,
  isDirectory,
  matching,
  messageOf,
  type Predicate,
} from "./changeset.ts";
import { claims } from "./claims.ts";
import { readConfig } from "./config.ts";
import { DEFAULT_DIALECT, resolveDialect, type Dialect } from "./dialects.ts";
import { discoverSpecs } from "./discover.ts";
import { parseSpec } from "./spec.ts";

/** Where a repo declares its risk policy (ADR-0041) — judgement, so a single hand-edited file. */
export const RISK_POLICY_FILE = ".speccle/risk.json";

/**
 * A baseline risk signal — a spec-aware fact only Speccle can see, shipped and enforced in
 * every repo. Each maps to one of ADR-0041's enumerated examples.
 */
export type BaselineSignalId =
  "spec-silent-change" | "criterion-retired" | "criterion-reworded" | "unclaimed-change";

/** The shipped weight of each baseline signal; a repo may reweight or mute (0) in its policy. */
const BASELINE_WEIGHTS: Record<BaselineSignalId, number> = {
  "spec-silent-change": 3,
  "criterion-retired": 4,
  "criterion-reworded": 2,
  "unclaimed-change": 3,
};
const BASELINE_IDS = Object.keys(BASELINE_WEIGHTS) as BaselineSignalId[];

/** The review threshold a repo has not overridden. Low by design — most changes supervised (ADR-0041). */
export const DEFAULT_THRESHOLD = 3;

/**
 * A repo-defined risk signal: a predicate over the change set that contributes its weight when
 * any changed file matches. The escape hatch for what is consequential in this repo alone.
 */
export interface PolicySignal {
  id: string;
  weight: number;
  /** Required, and enforced by `loadPolicy` — a signal that triggers on nothing is meaningless. */
  when?: Predicate;
  /** Shown when it fires — what the change touched and why that carries risk. */
  message: string;
  /** The finding or PR that motivated the signal — its provenance. */
  because?: string;
}

/**
 * A repo's declared risk policy, held in `.speccle/risk.json`. The one sanctioned exception to
 * "no configurable judgement" (ADR-0041): what counts as consequential is repo-specific. Only a
 * human edits it, and only weights or the threshold rise — nothing here can lower supervision.
 */
export interface RiskPolicy {
  /** Reweights a baseline signal; 0 mutes it. Keys must be baseline signal ids. */
  weights?: Partial<Record<BaselineSignalId, number>>;
  /** Overrides the default review threshold. */
  threshold?: number;
  /** Repo-defined signals, each a predicate + weight. */
  signals?: PolicySignal[];
}

/** One risk signal that fired on this change, carrying the evidence that makes the score auditable. */
export interface FiredSignal {
  id: string;
  weight: number;
  /** `baseline` — shipped and spec-aware; `policy` — repo-declared. */
  source: "baseline" | "policy";
  /** Human-legible account of why it fired. */
  reason: string;
  /** The changed files, criterion ids, or slices the signal fired on. */
  evidence: string[];
  because?: string;
}

/** The JSON contract of `speccle risk --json`. */
export interface RiskReport {
  root: string;
  /** Root-relative changed paths the signals ran against. */
  changed: string[];
  /** Only the signals that fired, baseline before policy. */
  signals: FiredSignal[];
  /** The weighted sum of the fired signals — the deterministic floor (ADR-0041). */
  score: number;
  threshold: number;
  /** score ≥ threshold: a human is required and `review` stops at findings, never fixing unasked. */
  humanRequired: boolean;
}

export interface RiskOptions {
  /**
   * Override the change set with root-relative posix paths, skipping git. The driver `risk` runs
   * under owns how the change set is computed; the default reads the working tree's pending change.
   */
  changed?: string[];
  /**
   * The pre-change content of a root-relative path, or undefined when it is new — the baseline a
   * criterion diff needs. Defaults to `git show HEAD:<file>`; injectable so the core stays git-free.
   */
  baseline?: (file: string) => string | undefined | Promise<string | undefined>;
  /** Test dialect. Overrides `.speccle/config.json`; both fall back to the default. */
  dialect?: string;
}

export async function risk(target: string, options: RiskOptions = {}): Promise<RiskReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const policy = await loadPolicy(root);
  const threshold = policy.threshold ?? DEFAULT_THRESHOLD;
  const weightOf = (id: BaselineSignalId): number => policy.weights?.[id] ?? BASELINE_WEIGHTS[id];

  const changed = (options.changed ?? gitChangeSet(root)).slice().sort();
  const declared = options.dialect ?? (await readConfig(root))?.dialect;
  const dialect = resolveDialect(declared ?? DEFAULT_DIALECT);
  const baseline = options.baseline ?? ((file: string) => gitBaseline(root, file));
  const read = contentReader(root);

  const signals: FiredSignal[] = [];
  const fireBaseline = (id: BaselineSignalId, reason: string, evidence: string[]): void => {
    const weight = weightOf(id);
    if (weight > 0 && evidence.length > 0) {
      signals.push({ id, weight, source: "baseline", reason, evidence: unique(evidence) });
    }
  };

  // Baseline signals — the spec-aware facts only Speccle can see. A muted (0-weight) signal is
  // not computed at all, keeping the git and claims work off the path when a repo has opted out.
  if (weightOf("spec-silent-change") > 0) {
    fireBaseline(
      "spec-silent-change",
      "production source changed in a governed slice whose SPEC.md did not",
      await specSilentChanges(root, changed, dialect),
    );
  }
  if (weightOf("criterion-retired") > 0 || weightOf("criterion-reworded") > 0) {
    const { retired, reworded } = await criterionDiffs(changed, read, baseline);
    fireBaseline("criterion-retired", "a criterion was retired from a changed SPEC.md", retired);
    fireBaseline("criterion-reworded", "a criterion's statement was reworded", reworded);
  }
  if (weightOf("unclaimed-change") > 0) {
    fireBaseline(
      "unclaimed-change",
      "changed code lives in a slice with a criterion no test claims",
      await unclaimedChanges(root, changed, dialect.name),
    );
  }

  // Policy signals — repo-defined predicates over the change set.
  for (const signal of policy.signals ?? []) {
    if (signal.weight === 0) continue;
    const hits = await matching(signal.when!, changed, read); // when: present, enforced by loadPolicy.
    if (hits.length === 0) continue;
    signals.push({
      id: signal.id,
      weight: signal.weight,
      source: "policy",
      reason: signal.message,
      evidence: hits,
      ...(signal.because !== undefined && { because: signal.because }),
    });
  }

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  return { root, changed, signals, score, threshold, humanRequired: score >= threshold };
}

/** Governed-slice production source that changed while the slice's SPEC.md stayed silent. */
async function specSilentChanges(
  root: string,
  changed: string[],
  dialect: Dialect,
): Promise<string[]> {
  const specs = await discoverSpecs(root);
  const silent: string[] = [];
  for (const spec of specs) {
    const folder = dirname(spec);
    if (changed.includes(spec)) continue; // the spec moved with its code — not silent.
    for (const file of changed) {
      if (!underFolder(file, folder)) continue;
      if (isContractFile(file, folder) || dialect.isTestFile(file)) continue;
      silent.push(file);
    }
  }
  return silent;
}

/** Criterion ids retired or reworded between each changed SPEC.md's baseline and its current text. */
async function criterionDiffs(
  changed: string[],
  read: (file: string) => Promise<string | undefined>,
  baseline: (file: string) => string | undefined | Promise<string | undefined>,
): Promise<{ retired: string[]; reworded: string[] }> {
  const retired: string[] = [];
  const reworded: string[] = [];
  for (const spec of changed.filter(isSpecPath)) {
    const before = await baseline(spec);
    if (before === undefined) continue; // a newly added spec retires and rewords nothing.
    const past = criteriaOf(before, spec);
    const now = criteriaOf((await read(spec)) ?? "", spec); // deleted spec → every criterion retired.
    for (const [id, statement] of past) {
      if (!now.has(id)) retired.push(id);
      else if (now.get(id) !== statement) reworded.push(id);
    }
  }
  return { retired, reworded };
}

/** Unclaimed criterion ids in the governed slices this change touched. */
async function unclaimedChanges(
  root: string,
  changed: string[],
  dialect: string,
): Promise<string[]> {
  const report = await claims(root, { dialect });
  const unclaimed: string[] = [];
  for (const feature of report.features) {
    const folder = dirname(feature.spec);
    if (!changed.some((file) => underFolder(file, folder))) continue;
    for (const criterion of feature.criteria) {
      if (!criterion.claimed) unclaimed.push(criterion.id);
    }
  }
  return unclaimed;
}

/** The well-formed criteria of a SPEC.md, id → statement. */
function criteriaOf(content: string, file: string): Map<string, string> {
  const criteria = new Map<string, string>();
  for (const criterion of parseSpec(content, file).criteria) {
    if (criterion.wellFormed) criteria.set(criterion.id, criterion.statement);
  }
  return criteria;
}

/** The review threshold in force at a repo — its policy override, or the shipped default. */
export async function reviewThreshold(root: string): Promise<number> {
  return (await loadPolicy(root)).threshold ?? DEFAULT_THRESHOLD;
}

async function loadPolicy(root: string): Promise<RiskPolicy> {
  let raw: string;
  try {
    raw = await readFile(resolve(root, RISK_POLICY_FILE), "utf8");
  } catch {
    return {}; // no policy: the conservative baseline defaults apply.
  }
  let policy: RiskPolicy;
  try {
    policy = JSON.parse(raw) as RiskPolicy;
  } catch (err) {
    throw new Error(`${RISK_POLICY_FILE} is not valid JSON: ${messageOf(err)}`);
  }
  assertPolicy(policy);
  return policy;
}

// A malformed policy must fail loudly: a silently-ignored weight or signal is exactly the
// quiet reduction of supervision ADR-0041 is designed to prevent.
function assertPolicy(policy: RiskPolicy): void {
  const file = RISK_POLICY_FILE;
  if (policy.threshold !== undefined && !isNonNegativeNumber(policy.threshold)) {
    throw new Error(`${file}: "threshold" must be a non-negative number`);
  }
  for (const [id, weight] of Object.entries(policy.weights ?? {})) {
    if (!BASELINE_IDS.includes(id as BaselineSignalId)) {
      throw new Error(
        `${file}: unknown baseline signal in "weights": ${id} — known: ${BASELINE_IDS.join(", ")}`,
      );
    }
    if (!isNonNegativeNumber(weight)) {
      throw new Error(`${file}: weight for "${id}" must be a non-negative number`);
    }
  }
  const seen = new Set<string>();
  for (const signal of policy.signals ?? []) {
    if (typeof signal.id !== "string" || signal.id === "") {
      throw new Error(`${file}: a signal needs a non-empty "id"`);
    }
    if (BASELINE_IDS.includes(signal.id as BaselineSignalId)) {
      throw new Error(
        `${file}: signal id "${signal.id}" collides with a baseline signal — reweight it in "weights" instead`,
      );
    }
    if (seen.has(signal.id)) throw new Error(`${file}: duplicate signal id "${signal.id}"`);
    seen.add(signal.id);
    if (!isNonNegativeNumber(signal.weight)) {
      throw new Error(`${file}: signal "${signal.id}" needs a non-negative "weight"`);
    }
    if (typeof signal.message !== "string" || signal.message === "") {
      throw new Error(`${file}: signal "${signal.id}" needs a non-empty "message"`);
    }
    if (signal.when === undefined) {
      throw new Error(`${file}: signal "${signal.id}" needs a "when" predicate`);
    }
    assertPredicate(signal.when, "when", file);
  }
}

/** Committed content of a path, or undefined when git has no baseline for it (new or no commits). */
function gitBaseline(root: string, file: string): string | undefined {
  const result = spawnSync("git", ["show", `HEAD:./${file}`], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout : undefined;
}

function isSpecPath(file: string): boolean {
  return file === "SPEC.md" || file.endsWith("/SPEC.md");
}

function isContractFile(file: string, folder: string): boolean {
  const base = file.slice(file.lastIndexOf("/") + 1);
  if (base === "SPEC.md" || base === "CONTEXT.md" || base === "AGENTS.md") return true;
  return file.startsWith(folder === "." ? "decisions/" : `${folder}/decisions/`);
}

function underFolder(file: string, folder: string): boolean {
  return folder === "." || file === folder || file.startsWith(`${folder}/`);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
