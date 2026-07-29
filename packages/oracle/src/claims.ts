import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { readConfig, resolveFacts } from "./config.ts";
import { DEFAULT_DIALECT, resolveDialect, type Dialect } from "./dialects.ts";
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
  /**
   * 1-based position of this criterion in its spec, as the document reads. Ids are names, not
   * order (ADR-0003), so on an amended slice a low-numbered criterion can sit last — and the
   * order the spec was written in is the order the work is taken in, so the join reports it
   * rather than losing it to the id sort below.
   */
  order: number;
  claimed: boolean;
  tests: TestClaim[];
}

export interface FeatureClaims {
  key: string | undefined;
  /** Root-relative path of the feature's SPEC.md. */
  spec: string;
  /** The test dialect this slice's folder joined under. */
  dialect: string;
  criteria: CriterionClaims[];
}

/** The JSON contract of `speccle claims --json`. */
export interface ClaimsReport {
  root: string;
  /**
   * The test dialects the join ran under, sorted — one entry unless the repo's config puts
   * a mixed-language tree in play, in which case each slice's own is on its `FeatureClaims`.
   */
  dialects: string[];
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
  /**
   * Test dialect name. Forces one dialect across every folder, overriding
   * `.speccle/config.json` and its per-path overrides; both fall back to `ts-vitest`.
   */
  dialect?: string;
}

export async function claims(target: string, options: ClaimsOptions = {}): Promise<ClaimsReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);
  // An explicit --dialect wins outright, everywhere; otherwise `.speccle/config.json` is the
  // source of truth, and its per-path overrides let one pass join a mixed-language tree under
  // each folder's own dialect (ADR-0040). The default applies only to a repo with no config.
  const forced = options.dialect === undefined ? undefined : resolveDialect(options.dialect);
  const config = forced === undefined ? await readConfig(root) : undefined;
  const dialectAt = (folder: string): Dialect =>
    forced ??
    resolveDialect(config === undefined ? DEFAULT_DIALECT : resolveFacts(config, folder).dialect);

  const specFiles = await discoverSpecs(root);
  const specs = await Promise.all(
    specFiles.map(async (file) => parseSpec(await readFile(join(root, file), "utf8"), file)),
  );

  const criteria = new Map<string, { statement: string; spec: string; order: number }>();
  for (const spec of specs) {
    let order = 0;
    for (const criterion of spec.criteria) {
      if (criterion.wellFormed && !criteria.has(criterion.id)) {
        criteria.set(criterion.id, {
          statement: criterion.statement,
          spec: spec.file,
          order: ++order,
        });
      }
    }
  }

  // A slice's tests live in its own folder: only test files under a spec's folder
  // count, so unrelated tooling tests can never claim (or phantom-claim) a criterion.
  const folders = [...new Set(specFiles.map((file) => dirname(file)))];
  const folderDialects = new Map(folders.map((folder) => [folder, dialectAt(folder)]));
  // Nested spec folders can each discover the same test file, under different dialects. The
  // deepest folder's dialect reads it — the same most-specific-path rule the config resolves
  // an override under, so walking the folders shortest-first lets the deepest one win.
  const fileDialects = new Map<string, Dialect>();
  for (const folder of [...folders].sort((a, b) => a.length - b.length)) {
    const folderDialect = folderDialects.get(folder)!;
    const abs = folder === "." ? root : join(root, folder);
    for (const file of await discoverTests(abs, folderDialect)) {
      fileDialects.set(folder === "." ? file : `${folder}/${file}`, folderDialect);
    }
  }
  const testFiles = [...fileDialects.keys()].sort();
  const claimsById = new Map<string, TestClaim[]>();
  for (const file of testFiles) {
    const source = await readFile(join(root, file), "utf8");
    for (const { name, spelling } of fileDialects.get(file)!.readTestNames(source)) {
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
    dialect: folderDialects.get(dirname(spec.file))!.name,
    criteria: [...criteria.entries()]
      .filter(([, value]) => value.spec === spec.file)
      .map(([id, value]) => ({
        id,
        statement: value.statement,
        order: value.order,
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

  // With no spec at all no folder resolved a dialect, so name the one a pass at the root
  // would have run under rather than reporting none in play.
  const inPlay = folders.length === 0 ? [dialectAt(".")] : [...folderDialects.values()];

  return {
    root,
    dialects: [...new Set(inPlay.map((entry) => entry.name))].sort(),
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
