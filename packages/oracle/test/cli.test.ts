import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LintReport } from "../src/lint.ts";
import type { StrengthReport } from "../src/strength.ts";

const CLI = resolve(import.meta.dirname, "../src/cli.ts");
const TOY = resolve(import.meta.dirname, "../../..", "targets/checkout");
const DIRTY = resolve(import.meta.dirname, "fixtures/dirty");

function run(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

describe("speccle-oracle lint (e2e)", () => {
  it("reports the toy project clean with exit code 0", () => {
    const { status, stdout } = run("lint", TOY);
    expect(status).toBe(0);
    expect(stdout).toContain("2 spec files, clean");
  });

  it("emits the typed JSON report for the toy project", () => {
    const { status, stdout } = run("lint", TOY, "--json");
    expect(status).toBe(0);
    const report = JSON.parse(stdout) as LintReport;
    expect(report.clean).toBe(true);
    expect(report.files).toEqual(["features/basket/SPEC.md", "features/checkout/SPEC.md"]);
    expect(report.violations).toEqual([]);
  });

  it("finds every violation in the dirty fixture with exit code 1", () => {
    const { status, stdout } = run("lint", DIRTY, "--json");
    expect(status).toBe(1);
    const report = JSON.parse(stdout) as LintReport;
    expect(report.clean).toBe(false);
    expect(report.violations.map((v) => ({ rule: v.rule, file: v.file, line: v.line }))).toEqual([
      { rule: "key-collision", file: "features/alpha/SPEC.md", line: 2 },
      { rule: "duplicate-id", file: "features/alpha/SPEC.md", line: 13 },
      { rule: "empty-statement", file: "features/alpha/SPEC.md", line: 15 },
      { rule: "key-mismatch", file: "features/alpha/SPEC.md", line: 17 },
      { rule: "malformed-id", file: "features/alpha/SPEC.md", line: 19 },
      { rule: "malformed-id", file: "features/alpha/SPEC.md", line: 21 },
      { rule: "weasel-wording", file: "features/alpha/SPEC.md", line: 23 },
      { rule: "compound-criterion", file: "features/alpha/SPEC.md", line: 25 },
      { rule: "unmeasurable", file: "features/alpha/SPEC.md", line: 27 },
      { rule: "key-collision", file: "features/beta/SPEC.md", line: 2 },
      { rule: "missing-key", file: "features/delta/SPEC.md", line: 1 },
      { rule: "missing-key", file: "features/gamma/SPEC.md", line: 2 },
    ]);
  });

  it("renders violations grouped per file for humans", () => {
    const { status, stdout } = run("lint", DIRTY);
    expect(status).toBe(1);
    expect(stdout).toContain("features/alpha/SPEC.md");
    expect(stdout).toContain("weasel-wording");
    expect(stdout).toContain("4 spec files, 12 violations");
  });

  it("never enters fixtures directories when discovering specs", () => {
    const { status, stdout } = run(
      "lint",
      resolve(import.meta.dirname, "fixtures/skips"),
      "--json",
    );
    expect(status).toBe(0);
    const report = JSON.parse(stdout) as LintReport;
    expect(report.clean).toBe(true);
    expect(report.files).toEqual(["features/epsilon/SPEC.md"]);
  });

  it("lints a single spec file when given a file path", () => {
    const { status, stdout } = run("lint", resolve(DIRTY, "features/gamma/SPEC.md"), "--json");
    expect(status).toBe(1);
    const report = JSON.parse(stdout) as LintReport;
    expect(report.files).toEqual(["SPEC.md"]);
    expect(report.violations.map((v) => v.rule)).toEqual(["missing-key"]);
  });

  it("exits 2 on a missing path", () => {
    expect(run("lint", resolve(DIRTY, "no-such-dir")).status).toBe(2);
  });

  it("exits 2 on an unknown option", () => {
    expect(run("lint", "--nope").status).toBe(2);
  });

  it("exits 2 with usage when no command is given", () => {
    const { status, stderr } = run();
    expect(status).toBe(2);
    expect(stderr).toContain("Usage: speccle-oracle");
  });
});

const STRENGTH = resolve(import.meta.dirname, "fixtures/strength");
const REPORTS = ["--mutation", "mutation.json", "--coverage", "coverage-summary.json"];

describe("speccle-oracle strength (e2e)", () => {
  it("emits the typed JSON report with exit code 0", () => {
    const { status, stdout } = run("strength", STRENGTH, ...REPORTS, "--json");
    expect(status).toBe(0);
    const report = JSON.parse(stdout) as StrengthReport;
    expect(report.strength).toBe(0.6);
    expect(report.lineCoverage).toBe(0.8);
    expect(report.unclaimed).toEqual(["ALPHA-3"]);
    expect(report.unclaimedMutants.map((m) => `${m.line}:${m.column}`)).toEqual(["11:3", "12:3"]);
    expect(report.staticMutants.killed).toBe(1);
    expect(report.staticMutants.survivors.map((m) => m.mutator)).toEqual(["Regex"]);
    expect(report.features.flatMap((f) => f.criteria.map((c) => c.id))).toEqual([
      "ALPHA-1",
      "ALPHA-2",
      "ALPHA-3",
    ]);
  });

  it("renders a heatmap naming the surviving mutant and the coverage baseline", () => {
    const { status, stdout } = run("strength", STRENGTH, ...REPORTS);
    expect(status).toBe(0);
    expect(stdout).toContain("features/alpha/SPEC.md");
    expect(stdout).toContain("ALPHA-2");
    expect(stdout).toContain("50.0%");
    expect(stdout).toContain("features/alpha/alpha.ts:5:11  StringLiteral");
    expect(stdout).toContain("oracle strength 60.0% (3/5)");
    expect(stdout).toContain("line coverage 80.0%");
    expect(stdout).toContain("3 surviving mutants");
  });

  it("marks an unclaimed criterion rather than scoring it zero", () => {
    const { stdout } = run("strength", STRENGTH, ...REPORTS);
    expect(stdout).toContain("unclaimed — no test carries these tokens");
    expect(stdout).toContain("unknown claims");
  });

  it("names the unclaimed mutants, not just a count of them", () => {
    const { stdout } = run("strength", STRENGTH, ...REPORTS);
    expect(stdout).toContain("unclaimed mutants — scored mutants no criterion's tests cover");
    expect(stdout).toContain("features/alpha/alpha.ts:11:3  BooleanLiteral → false");
    expect(stdout).toContain("features/alpha/alpha.ts:12:3  ArrayDeclaration → []");
  });

  it("summarises static mutants apart from the unclaimed ones, naming only survivors", () => {
    const { stdout } = run("strength", STRENGTH, ...REPORTS);
    expect(stdout).toContain("static mutants — run at module load, attributable to no criterion");
    expect(stdout).toContain("1 killed, 1 survived");
    expect(stdout).toContain("features/alpha/alpha.ts:2:14  Regex → /^$/");
  });

  it("writes no ANSI escapes when stdout is not a terminal", () => {
    const { stdout } = run("strength", STRENGTH, ...REPORTS);
    expect(stdout).not.toContain("\x1b[");
  });

  it("exits 2 when the mutation report is missing", () => {
    const { status, stderr } = run("strength", STRENGTH);
    expect(status).toBe(2);
    expect(stderr).toContain("report not found");
  });

  it("exits 2 when an option is missing its value", () => {
    const { status, stderr } = run("strength", STRENGTH, "--mutation");
    expect(status).toBe(2);
    expect(stderr).toContain("--mutation needs a file path");
  });

  it("exits 2 on an unknown option", () => {
    expect(run("strength", STRENGTH, "--nope").status).toBe(2);
  });
});
