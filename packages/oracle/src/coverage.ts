import { isAbsolute, relative, resolve } from "node:path";

export interface LineCoverage {
  covered: number;
  total: number;
}

export interface CoverageSummary {
  /** Root-relative posix path → line coverage. Istanbul writes absolute keys. */
  files: ReadonlyMap<string, LineCoverage>;
  /** The report's own `total` row, if it carried one. */
  total: LineCoverage | undefined;
}

export function parseCoverageSummary(json: unknown, root: string, source: string): CoverageSummary {
  if (!isRecord(json)) {
    throw new Error(`${source} is not an Istanbul json-summary report: expected a JSON object`);
  }

  const files = new Map<string, LineCoverage>();
  let total: LineCoverage | undefined;
  for (const [key, entry] of Object.entries(json)) {
    const lines = isRecord(entry) ? readLines(entry.lines) : undefined;
    if (!lines) continue;
    if (key === "total") total = lines;
    else files.set(toRootRelative(key, root), lines);
  }
  return { files, total };
}

/** Sums the files under `dir`; undefined when the summary knows nothing about it. */
export function coverageUnder(summary: CoverageSummary, dir: string): LineCoverage | undefined {
  const prefix = dir === "" ? "" : `${dir}/`;
  let covered = 0;
  let total = 0;
  let matched = false;
  for (const [file, lines] of summary.files) {
    if (!file.startsWith(prefix)) continue;
    matched = true;
    covered += lines.covered;
    total += lines.total;
  }
  return matched ? { covered, total } : undefined;
}

function readLines(value: unknown): LineCoverage | undefined {
  if (!isRecord(value)) return undefined;
  const { covered, total } = value;
  if (typeof covered !== "number" || typeof total !== "number") return undefined;
  return { covered, total };
}

function toRootRelative(key: string, root: string): string {
  const rel = isAbsolute(key) ? relative(root, key) : relative(root, resolve(root, key));
  return rel.split(/[\\/]/).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
