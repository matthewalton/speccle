import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { check } from "./check.ts";

const HOUR = 3600 * 1000;
const BASE = Date.now() - 24 * HOUR;

describe("check", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  /** Files are written with mtimes spaced an hour apart, in entry order. */
  async function scaffold(files: string[]): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-check-"));
    roots.push(root);
    for (const [index, file] of files.entries()) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), file.endsWith("SPEC.md") ? "---\nkey: A\n---\n" : "{}");
      const time = new Date(BASE + index * HOUR);
      await utimes(join(root, file), time, time);
    }
    return root;
  }

  it("reports missing when a report does not exist", async () => {
    const root = await scaffold(["features/a/SPEC.md", "features/a/src/a.ts"]);
    const report = await check(root);
    expect(report.mutation).toEqual({ path: "reports/mutation/mutation.json", status: "missing" });
    expect(report.coverage).toEqual({ path: "coverage/coverage-summary.json", status: "missing" });
    expect(report.evaluated).toBe(false);
  });

  it("reports fresh when both reports post-date every slice file", async () => {
    const root = await scaffold([
      "features/a/SPEC.md",
      "features/a/src/a.ts",
      "reports/mutation/mutation.json",
      "coverage/coverage-summary.json",
    ]);
    const report = await check(root);
    expect(report.mutation.status).toBe("fresh");
    expect(report.coverage.status).toBe("fresh");
  });

  it("reports stale and names the newer slice file", async () => {
    const root = await scaffold([
      "reports/mutation/mutation.json",
      "coverage/coverage-summary.json",
      "features/a/SPEC.md",
      "features/a/src/a.ts",
    ]);
    const report = await check(root);
    expect(report.mutation).toEqual({
      path: "reports/mutation/mutation.json",
      status: "stale",
      staleAgainst: "features/a/src/a.ts",
    });
    expect(report.coverage.status).toBe("stale");
  });

  it("only files inside spec folders count against freshness", async () => {
    const root = await scaffold([
      "features/a/SPEC.md",
      "reports/mutation/mutation.json",
      "coverage/coverage-summary.json",
      "unrelated/tool.ts",
    ]);
    const report = await check(root);
    expect(report.mutation.status).toBe("fresh");
  });

  it("is evaluated only when the marker post-dates both reports", async () => {
    const root = await scaffold([
      "features/a/SPEC.md",
      "reports/mutation/mutation.json",
      "coverage/coverage-summary.json",
      "reports/mutation/.speccle-evaluated",
    ]);
    const report = await check(root);
    expect(report.evaluated).toBe(true);
    expect(report.marker).toBe("reports/mutation/.speccle-evaluated");
  });

  it("is not evaluated when a report post-dates the marker", async () => {
    const root = await scaffold([
      "features/a/SPEC.md",
      "reports/mutation/.speccle-evaluated",
      "reports/mutation/mutation.json",
      "coverage/coverage-summary.json",
    ]);
    const report = await check(root);
    expect(report.evaluated).toBe(false);
  });

  it("resolves report paths from the strength options", async () => {
    const root = await scaffold(["features/a/SPEC.md", "m.json", "c.json"]);
    const report = await check(root, { mutationReport: "m.json", coverageSummary: "c.json" });
    expect(report.mutation).toEqual({ path: "m.json", status: "fresh" });
    expect(report.coverage).toEqual({ path: "c.json", status: "fresh" });
    expect(report.marker).toBe(".speccle-evaluated");
  });

  it("throws on a missing path", async () => {
    await expect(check("/no/such/dir")).rejects.toThrow("path not found");
  });
});
