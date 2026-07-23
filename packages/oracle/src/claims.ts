import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_DIALECT, resolveDialect } from "./dialects.ts";
import { discoverSpecs, discoverTests } from "./discover.ts";
import { compareCriterionIds, parseSpec, readClaimedIds } from "./spec.ts";

/** One test-name occurrence of a criterion's token. */
export interface TestClaim {
  /** Root-relative posix path of the test file. */
  file: string;
  /** The test's full name, as its dialect reads it. */
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

/** The JSON contract of `speccle claims --json`. */
export interface ClaimsReport {
  root: string;
  /** The test dialect the join ran under. */
  dialect: string;
  testFiles: string[];
  features: FeatureClaims[];
  /** Well-formed criteria no test name claims. */
  unclaimed: string[];
  /** Tokens claimed by test names that match no criterion in any spec. */
  unknownClaims: { id: string; tests: TestClaim[] }[];
  /** True when every criterion is claimed and every claim names a real criterion. */
  clean: boolean;
}

export interface ClaimsOptions {
  /** Test dialect name (default: `ts-vitest`). */
  dialect?: string;
}

export async function claims(target: string, options: ClaimsOptions = {}): Promise<ClaimsReport> {
  const dialect = resolveDialect(options.dialect ?? DEFAULT_DIALECT);
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

  // A slice's tests live in its own folder: only test files under a spec's folder
  // count, so unrelated tooling tests can never claim (or phantom-claim) a criterion.
  const folders = [...new Set(specFiles.map((file) => dirname(file)))];
  const found = new Set<string>();
  for (const folder of folders) {
    const abs = folder === "." ? root : join(root, folder);
    for (const file of await discoverTests(abs, dialect)) {
      found.add(folder === "." ? file : `${folder}/${file}`);
    }
  }
  const testFiles = [...found].sort();
  const claimsById = new Map<string, TestClaim[]>();
  for (const file of testFiles) {
    const source = await readFile(join(root, file), "utf8");
    for (const { name, spelling } of dialect.readTestNames(source)) {
      for (const id of readClaimedIds(name, spelling)) {
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
    dialect: dialect.name,
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
