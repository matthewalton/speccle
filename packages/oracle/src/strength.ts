import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { coverageUnder, parseCoverageSummary, type CoverageSummary } from "./coverage.ts";
import { discoverSpecs } from "./discover.ts";
import { isKill, isScored, parseMutationReport, type Mutant } from "./mutation.ts";
import { parseSpec, type WellFormedCriterion } from "./spec.ts";

export const DEFAULT_MUTATION_REPORT = "reports/mutation/mutation.json";
export const DEFAULT_COVERAGE_SUMMARY = "coverage/coverage-summary.json";

/** A `[KEY-n]` token anywhere in a test's full concatenated name (ADR-0004). */
const CLAIM_TOKEN = /\[([A-Z][A-Z0-9]{1,9}-[1-9][0-9]*)\]/g;

/** The exact code change no test noticed. */
export interface Survivor {
  file: string;
  line: number;
  column: number;
  mutator: string;
  replacement: string | undefined;
}

export interface Score {
  covered: number;
  killed: number;
  /** `killed ÷ covered`, or null when nothing was covered. */
  strength: number | null;
}

export interface CriterionStrength extends Score {
  id: string;
  statement: string;
  /** False when no test name carries this criterion's token. */
  claimed: boolean;
  survivors: Survivor[];
}

export interface FeatureStrength extends Score {
  key: string | undefined;
  /** Root-relative path of the feature's SPEC.md. */
  spec: string;
  lineCoverage: number | null;
  criteria: CriterionStrength[];
}

/** The JSON contract of `speccle-oracle strength --json`. */
export interface StrengthReport extends Score {
  root: string;
  lineCoverage: number | null;
  features: FeatureStrength[];
  /** Well-formed criteria no test claims — the worst case, and not a zero score. */
  unclaimed: string[];
  /** Tokens claimed by tests that match no criterion in any spec. */
  unknownClaims: string[];
  /** Scored mutants no claiming test covers: code the criteria do not reach. */
  unclaimedMutants: number;
}

export interface StrengthOptions {
  mutationReport?: string;
  coverageSummary?: string;
}

export async function strength(
  target: string,
  options: StrengthOptions = {},
): Promise<StrengthReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const mutationPath = resolve(root, options.mutationReport ?? DEFAULT_MUTATION_REPORT);
  const report = parseMutationReport(await readJson(mutationPath), rel(root, mutationPath));
  if (report.coverageAnalysis !== undefined && report.coverageAnalysis !== "perTest") {
    throw new Error(
      `${rel(root, mutationPath)} was produced with coverageAnalysis "${report.coverageAnalysis}"; ` +
        `oracle strength needs "perTest" to know which tests covered each mutant`,
    );
  }

  const coveragePath = resolve(root, options.coverageSummary ?? DEFAULT_COVERAGE_SUMMARY);
  const coverage = await readCoverage(coveragePath, root);

  const specFiles = await discoverSpecs(root);
  const specs = await Promise.all(
    specFiles.map(async (file) => parseSpec(await readFile(join(root, file), "utf8"), file)),
  );

  const criteria = new Map<string, { criterion: WellFormedCriterion; spec: string }>();
  for (const spec of specs) {
    for (const criterion of spec.criteria) {
      if (criterion.wellFormed && !criteria.has(criterion.id)) {
        criteria.set(criterion.id, { criterion, spec: spec.file });
      }
    }
  }

  const claimsByTest = new Map<string, string[]>();
  const claimedIds = new Set<string>();
  for (const [id, name] of report.testNames) {
    const claims = [...name.matchAll(CLAIM_TOKEN)].map((m) => m[1]!);
    claimsByTest.set(id, claims);
    for (const claim of claims) claimedIds.add(claim);
  }

  const tally = new Map<string, { covered: number; killed: number; survivors: Survivor[] }>();
  const featureTally = new Map<string, { covered: number; killed: number }>();
  let covered = 0;
  let killed = 0;
  let unclaimedMutants = 0;

  for (const mutant of report.mutants) {
    if (!isScored(mutant.status)) continue;

    const claims = new Set<string>();
    for (const testId of mutant.coveredBy) {
      for (const claim of claimsByTest.get(testId) ?? []) {
        if (criteria.has(claim)) claims.add(claim);
      }
    }
    if (claims.size === 0) {
      unclaimedMutants++;
      continue;
    }

    // ADR-0011: any test's kill counts for every criterion whose tests covered the mutant.
    const kill = isKill(mutant.status);
    covered++;
    if (kill) killed++;

    for (const id of claims) {
      const entry = tally.get(id) ?? { covered: 0, killed: 0, survivors: [] };
      entry.covered++;
      if (kill) entry.killed++;
      else entry.survivors.push(toSurvivor(mutant));
      tally.set(id, entry);
    }

    const features = new Set([...claims].map((id) => criteria.get(id)!.spec));
    for (const spec of features) {
      const entry = featureTally.get(spec) ?? { covered: 0, killed: 0 };
      entry.covered++;
      if (kill) entry.killed++;
      featureTally.set(spec, entry);
    }
  }

  const features: FeatureStrength[] = specs.map((spec) => {
    const own = [...criteria.values()]
      .filter((c) => c.spec === spec.file)
      .map(({ criterion }) => {
        const entry = tally.get(criterion.id);
        return {
          id: criterion.id,
          statement: criterion.statement,
          claimed: claimedIds.has(criterion.id),
          covered: entry?.covered ?? 0,
          killed: entry?.killed ?? 0,
          strength: ratio(entry?.killed ?? 0, entry?.covered ?? 0),
          survivors: (entry?.survivors ?? []).sort(bySourcePosition),
        };
      })
      .sort(byCriterionId);

    const totals = featureTally.get(spec.file) ?? { covered: 0, killed: 0 };
    const lines = coverage && coverageUnder(coverage, dirname(spec.file));
    return {
      key: spec.key?.raw,
      spec: spec.file,
      covered: totals.covered,
      killed: totals.killed,
      strength: ratio(totals.killed, totals.covered),
      lineCoverage: lines ? ratio(lines.covered, lines.total) : null,
      criteria: own,
    };
  });

  const unknownClaims = [...claimedIds].filter((id) => !criteria.has(id)).sort();
  const unclaimed = [...criteria.keys()].filter((id) => !claimedIds.has(id)).sort();

  return {
    root,
    covered,
    killed,
    strength: ratio(killed, covered),
    lineCoverage: coverage?.total ? ratio(coverage.total.covered, coverage.total.total) : null,
    features,
    unclaimed,
    unknownClaims,
    unclaimedMutants,
  };
}

function toSurvivor(mutant: Mutant): Survivor {
  return {
    file: mutant.file,
    line: mutant.line,
    column: mutant.column,
    mutator: mutant.mutator,
    replacement: mutant.replacement,
  };
}

/** Stryker does not order mutants stably across runs; a Speccle tool's output must be. */
function bySourcePosition(a: Survivor, b: Survivor): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
}

function byCriterionId(a: { id: string }, b: { id: string }): number {
  const [aKey, aN] = splitId(a.id);
  const [bKey, bN] = splitId(b.id);
  return aKey === bKey ? aN - bN : aKey.localeCompare(bKey);
}

function splitId(id: string): [string, number] {
  const dash = id.lastIndexOf("-");
  return [id.slice(0, dash), Number(id.slice(dash + 1))];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`report not found: ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : ""}`);
  }
}

/** Coverage is the naïve baseline, not the measurement: its absence is not fatal. */
async function readCoverage(path: string, root: string): Promise<CoverageSummary | undefined> {
  try {
    await stat(path);
  } catch {
    return undefined;
  }
  return parseCoverageSummary(await readJson(path), root, rel(root, path));
}

function rel(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
