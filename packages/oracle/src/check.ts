import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { discoverFiles, discoverSpecs } from "./discover.ts";
import { DEFAULT_COVERAGE_SUMMARY, DEFAULT_MUTATION_REPORT } from "./strength.ts";

export type ReportStatus = "fresh" | "stale" | "missing";

export interface ReportCheck {
  /** Root-relative path of the report. */
  path: string;
  status: ReportStatus;
  /** The newest slice file post-dating the report, when stale. */
  staleAgainst?: string;
}

/** The JSON contract of `speccle-oracle strength --check --json`. */
export interface CheckReport {
  root: string;
  mutation: ReportCheck;
  coverage: ReportCheck;
  /** True when the marker post-dates both reports: this heatmap was already read. */
  evaluated: boolean;
  /** Root-relative marker path — touch it after evaluating the heatmap. */
  marker: string;
}

export interface CheckOptions {
  mutationReport?: string;
  coverageSummary?: string;
}

export async function check(target: string, options: CheckOptions = {}): Promise<CheckReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const mutationPath = resolve(root, options.mutationReport ?? DEFAULT_MUTATION_REPORT);
  const coveragePath = resolve(root, options.coverageSummary ?? DEFAULT_COVERAGE_SUMMARY);
  const markerPath = join(dirname(mutationPath), ".speccle-evaluated");

  const newest = await newestSliceFile(root, new Set([mutationPath, coveragePath, markerPath]));
  const mutation = await checkReport(root, mutationPath, newest);
  const coverage = await checkReport(root, coveragePath, newest);

  const markerTime = await mtime(markerPath);
  const mutationTime = await mtime(mutationPath);
  const coverageTime = await mtime(coveragePath);
  const evaluated =
    markerTime !== undefined &&
    mutationTime !== undefined &&
    coverageTime !== undefined &&
    markerTime >= mutationTime &&
    markerTime >= coverageTime;

  return { root, mutation, coverage, evaluated, marker: rel(root, markerPath) };
}

interface SliceFile {
  file: string;
  mtimeMs: number;
}

/** The newest file in any spec's folder subtree — what a report must post-date. */
async function newestSliceFile(root: string, exclude: Set<string>): Promise<SliceFile | undefined> {
  const folders = new Set((await discoverSpecs(root)).map((spec) => dirname(spec)));
  const seen = new Set<string>();
  let newest: SliceFile | undefined;

  for (const folder of folders) {
    const abs = folder === "." ? root : join(root, folder);
    for (const file of await discoverFiles(abs, () => true)) {
      const relPath = folder === "." ? file : `${folder}/${file}`;
      const absPath = join(abs, file);
      if (seen.has(relPath) || exclude.has(absPath)) continue;
      seen.add(relPath);
      const mtimeMs = await mtime(absPath);
      if (mtimeMs === undefined) continue;
      if (newest === undefined || mtimeMs > newest.mtimeMs) newest = { file: relPath, mtimeMs };
    }
  }
  return newest;
}

async function checkReport(
  root: string,
  path: string,
  newest: SliceFile | undefined,
): Promise<ReportCheck> {
  const reportTime = await mtime(path);
  if (reportTime === undefined) return { path: rel(root, path), status: "missing" };
  if (newest !== undefined && newest.mtimeMs > reportTime) {
    return { path: rel(root, path), status: "stale", staleAgainst: newest.file };
  }
  return { path: rel(root, path), status: "fresh" };
}

async function mtime(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return undefined;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function rel(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}
