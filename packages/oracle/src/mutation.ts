/**
 * The slice of the Stryker JSON report (mutation-testing-elements schema) the join needs.
 * `killedBy` is deliberately absent: a kill counts for every covering criterion, so only
 * the status matters (ADR-0011).
 */

/** Every status the schema defines. Killed and Timeout are kills; the rest are not. */
const STATUSES = [
  "Killed",
  "Survived",
  "NoCoverage",
  "CompileError",
  "RuntimeError",
  "Timeout",
  "Ignored",
  "Pending",
] as const;

export type MutantStatus = (typeof STATUSES)[number];

const KILLED: ReadonlySet<MutantStatus> = new Set<MutantStatus>(["Killed", "Timeout"]);

/** A mutant Stryker actually ran: it either died or survived. The others cannot be scored. */
const SCORED: ReadonlySet<MutantStatus> = new Set<MutantStatus>(["Killed", "Survived", "Timeout"]);

export interface Mutant {
  id: string;
  /** Project-relative posix path, as the report writes it. */
  file: string;
  line: number;
  column: number;
  mutator: string;
  replacement: string | undefined;
  status: MutantStatus;
  /** Runs at module load, so per-test coverage cannot attribute it to any test. */
  static: boolean;
  /** Test ids, into `MutationReport.testNames`. */
  coveredBy: readonly string[];
}

export interface MutationReport {
  mutants: readonly Mutant[];
  /** Test id → full concatenated test name, describe titles included (ADR-0004). */
  testNames: ReadonlyMap<string, string>;
  coverageAnalysis: string | undefined;
}

export function isKill(status: MutantStatus): boolean {
  return KILLED.has(status);
}

export function isScored(status: MutantStatus): boolean {
  return SCORED.has(status);
}

export function parseMutationReport(json: unknown, source: string): MutationReport {
  const fail = (detail: string): never => {
    throw new Error(`${source} is not a Stryker mutation report: ${detail}`);
  };

  if (!isRecord(json)) return fail("expected a JSON object");
  const files = json.files;
  if (!isRecord(files)) return fail("missing `files`");

  const mutants: Mutant[] = [];
  for (const [file, entry] of Object.entries(files)) {
    if (!isRecord(entry)) return fail(`\`files["${file}"]\` is not an object`);
    const list = entry.mutants;
    if (!Array.isArray(list)) return fail(`\`files["${file}"].mutants\` is not an array`);
    for (const raw of list) {
      if (!isRecord(raw)) return fail(`a mutant in "${file}" is not an object`);
      const id = raw.id;
      if (typeof id !== "string") return fail(`a mutant in "${file}" has no string \`id\``);

      const status = raw.status;
      if (!isStatus(status)) return fail(`mutant ${id} has unknown status ${String(status)}`);

      const start = isRecord(raw.location) ? raw.location.start : undefined;
      if (!isRecord(start) || typeof start.line !== "number") {
        return fail(`mutant ${id} has no \`location.start.line\``);
      }

      const replacement = raw.replacement;
      mutants.push({
        id,
        file,
        line: start.line,
        column: typeof start.column === "number" ? start.column : 0,
        mutator: typeof raw.mutatorName === "string" ? raw.mutatorName : "unknown",
        replacement: typeof replacement === "string" ? replacement : undefined,
        status,
        static: raw.static === true,
        coveredBy: stringArray(raw.coveredBy),
      });
    }
  }

  const testNames = new Map<string, string>();
  const testFiles = json.testFiles;
  if (isRecord(testFiles)) {
    for (const entry of Object.values(testFiles)) {
      if (!isRecord(entry)) continue;
      const tests = entry.tests;
      if (!Array.isArray(tests)) continue;
      for (const test of tests) {
        if (!isRecord(test)) continue;
        const { id, name } = test;
        if (typeof id === "string" && typeof name === "string") testNames.set(id, name);
      }
    }
  }

  const config = json.config;
  const coverageAnalysis = isRecord(config) ? config.coverageAnalysis : undefined;

  return {
    mutants,
    testNames,
    coverageAnalysis: typeof coverageAnalysis === "string" ? coverageAnalysis : undefined,
  };
}

function isStatus(value: unknown): value is MutantStatus {
  return STATUSES.includes(value as MutantStatus);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
