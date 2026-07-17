import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discoverSpecs, discoverTests } from "./discover.ts";
import { CLAIM_TOKEN, compareCriterionIds, parseSpec } from "./spec.ts";

/** One test-name occurrence of a criterion's token. */
export interface TestClaim {
  /** Root-relative posix path of the test file. */
  file: string;
  /** The describe/it/test title carrying the token. */
  name: string;
}

export interface CriterionClaims {
  id: string;
  statement: string;
  claimed: boolean;
  tests: TestClaim[];
}

export interface FeatureClaims {
  key: string | undefined;
  /** Root-relative path of the feature's SPEC.md. */
  spec: string;
  criteria: CriterionClaims[];
}

/** The JSON contract of `speccle-oracle claims --json`. */
export interface ClaimsReport {
  root: string;
  testFiles: string[];
  features: FeatureClaims[];
  /** Well-formed criteria no test name claims. */
  unclaimed: string[];
  /** Tokens claimed by test names that match no criterion in any spec. */
  unknownClaims: { id: string; tests: TestClaim[] }[];
  /** True when every criterion is claimed and every claim names a real criterion. */
  clean: boolean;
}

/**
 * Titles are read statically, so only string-literal describe/it/test names count.
 * A dynamically built title the scan misses shows up as unclaimed — the failure mode
 * is a false alarm, never a silent pass.
 */
const TEST_TITLE = /\b(?:describe|it|test)(?:\.[\w.]+)*\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;

export function extractTestNames(source: string): string[] {
  return [...source.matchAll(TEST_TITLE)].map((m) => m[2]!);
}

export async function claims(target: string): Promise<ClaimsReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const specFiles = await discoverSpecs(root);
  const specs = await Promise.all(
    specFiles.map(async (file) => parseSpec(await readFile(join(root, file), "utf8"), file)),
  );

  const criteria = new Map<string, { statement: string; spec: string }>();
  for (const spec of specs) {
    for (const criterion of spec.criteria) {
      if (criterion.wellFormed && !criteria.has(criterion.id)) {
        criteria.set(criterion.id, { statement: criterion.statement, spec: spec.file });
      }
    }
  }

  const testFiles = await discoverTests(root);
  const claimsById = new Map<string, TestClaim[]>();
  for (const file of testFiles) {
    for (const name of extractTestNames(await readFile(join(root, file), "utf8"))) {
      for (const match of name.matchAll(CLAIM_TOKEN)) {
        const id = match[1]!;
        const entry = claimsById.get(id) ?? [];
        entry.push({ file, name });
        claimsById.set(id, entry);
      }
    }
  }

  const features: FeatureClaims[] = specs.map((spec) => ({
    key: spec.key?.raw,
    spec: spec.file,
    criteria: [...criteria.entries()]
      .filter(([, value]) => value.spec === spec.file)
      .map(([id, value]) => ({
        id,
        statement: value.statement,
        claimed: claimsById.has(id),
        tests: claimsById.get(id) ?? [],
      }))
      .sort((a, b) => compareCriterionIds(a.id, b.id)),
  }));

  const unclaimed = [...criteria.keys()]
    .filter((id) => !claimsById.has(id))
    .sort(compareCriterionIds);
  const unknownClaims = [...claimsById.entries()]
    .filter(([id]) => !criteria.has(id))
    .map(([id, tests]) => ({ id, tests }))
    .sort((a, b) => compareCriterionIds(a.id, b.id));

  return {
    root,
    testFiles,
    features,
    unclaimed,
    unknownClaims,
    clean: unclaimed.length === 0 && unknownClaims.length === 0,
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
