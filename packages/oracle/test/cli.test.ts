import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LintReport } from "../src/lint.ts";

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
    expect(report.files).toEqual([
      "features/basket/spec.md",
      "features/checkout/spec.md",
    ]);
    expect(report.violations).toEqual([]);
  });

  it("finds every violation in the dirty fixture with exit code 1", () => {
    const { status, stdout } = run("lint", DIRTY, "--json");
    expect(status).toBe(1);
    const report = JSON.parse(stdout) as LintReport;
    expect(report.clean).toBe(false);
    expect(
      report.violations.map((v) => ({ rule: v.rule, file: v.file, line: v.line })),
    ).toEqual([
      { rule: "key-collision", file: "features/alpha/spec.md", line: 2 },
      { rule: "duplicate-id", file: "features/alpha/spec.md", line: 13 },
      { rule: "empty-statement", file: "features/alpha/spec.md", line: 15 },
      { rule: "key-mismatch", file: "features/alpha/spec.md", line: 17 },
      { rule: "malformed-id", file: "features/alpha/spec.md", line: 19 },
      { rule: "malformed-id", file: "features/alpha/spec.md", line: 21 },
      { rule: "weasel-wording", file: "features/alpha/spec.md", line: 23 },
      { rule: "compound-criterion", file: "features/alpha/spec.md", line: 25 },
      { rule: "unmeasurable", file: "features/alpha/spec.md", line: 27 },
      { rule: "key-collision", file: "features/beta/spec.md", line: 2 },
      { rule: "missing-key", file: "features/delta/spec.md", line: 1 },
      { rule: "missing-key", file: "features/gamma/spec.md", line: 2 },
    ]);
  });

  it("renders violations grouped per file for humans", () => {
    const { status, stdout } = run("lint", DIRTY);
    expect(status).toBe(1);
    expect(stdout).toContain("features/alpha/spec.md");
    expect(stdout).toContain("weasel-wording");
    expect(stdout).toContain("4 spec files, 12 violations");
  });

  it("lints a single spec file when given a file path", () => {
    const { status, stdout } = run("lint", resolve(DIRTY, "features/gamma/spec.md"), "--json");
    expect(status).toBe(1);
    const report = JSON.parse(stdout) as LintReport;
    expect(report.files).toEqual(["spec.md"]);
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

  it("exits 2 for the unimplemented strength command", () => {
    const { status, stderr } = run("strength");
    expect(status).toBe(2);
    expect(stderr).toContain("not implemented");
  });
});
