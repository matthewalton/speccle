import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { strength } from "./strength.ts";

const FIXTURE = resolve(import.meta.dirname, "../test/fixtures/strength");

const report = await strength(FIXTURE, {
  mutationReport: "mutation.json",
  coverageSummary: "coverage-summary.json",
});
const criteria = new Map(report.features.flatMap((f) => f.criteria.map((c) => [c.id, c])));

describe("oracle strength", () => {
  it("scores a criterion whose tests kill every mutant they cover", () => {
    expect(criteria.get("ALPHA-1")).toMatchObject({ covered: 2, killed: 2, strength: 1 });
  });

  it("credits a kill to every covering criterion, not only the killing one (ADR-0011)", () => {
    // Mutant 2 is covered by ALPHA-1 and ALPHA-2, and killed only by ALPHA-1's test.
    const alpha2 = criteria.get("ALPHA-2")!;
    expect(alpha2.covered).toBe(4);
    expect(alpha2.killed).toBe(2);
    expect(alpha2.strength).toBe(0.5);
    expect(alpha2.survivors.map((s) => s.line)).not.toContain(4);
  });

  it("counts a timeout as a kill", () => {
    // Mutant 4 times out under ALPHA-2's test, so it never reaches the survivor list.
    expect(criteria.get("ALPHA-2")!.survivors.map((s) => s.mutator)).toEqual([
      "StringLiteral",
      "BooleanLiteral",
    ]);
  });

  it("names the exact code change a survivor made", () => {
    expect(criteria.get("ALPHA-2")!.survivors[0]).toEqual({
      file: "features/alpha/alpha.ts",
      line: 5,
      column: 11,
      mutator: "StringLiteral",
      replacement: '""',
    });
  });

  it("orders survivors by source position, since Stryker's mutant order is not stable", () => {
    // The fixture lists the line-7 mutant before the line-5 one.
    expect(criteria.get("ALPHA-2")!.survivors.map((s) => [s.line, s.column])).toEqual([
      [5, 11],
      [7, 2],
    ]);
  });

  it("reports a criterion no test claims as unclaimed, not as zero strength", () => {
    expect(criteria.get("ALPHA-3")).toMatchObject({
      claimed: false,
      covered: 0,
      killed: 0,
      strength: null,
      survivors: [],
    });
    expect(report.unclaimed).toEqual(["ALPHA-3"]);
  });

  it("excludes mutants the run never scored", () => {
    // NoCoverage (5) and CompileError (6) sit in neither numerator nor denominator.
    expect(report.covered).toBe(5);
    expect(report.killed).toBe(3);
    expect(report.strength).toBe(0.6);
  });

  it("names each scored mutant that no criterion covers, killed or not", () => {
    // Mutant 7 (killed) is covered by a test claiming nothing; mutant 8 by one claiming BETA-9.
    expect(report.unclaimedMutants).toEqual([
      {
        file: "features/alpha/alpha.ts",
        line: 11,
        column: 3,
        mutator: "BooleanLiteral",
        replacement: "false",
      },
      {
        file: "features/alpha/alpha.ts",
        line: 12,
        column: 3,
        mutator: "ArrayDeclaration",
        replacement: "[]",
      },
    ]);
  });

  it("reports static mutants apart, keeping them out of unclaimedMutants and the totals", () => {
    // Mutants 9 (killed) and 10 (survived) are static; neither reaches any other bucket.
    expect(report.staticMutants.killed).toBe(1);
    expect(report.unclaimedMutants.map((s) => s.line)).toEqual([11, 12]);
    expect(report.covered).toBe(5);
  });

  it("names each surviving static mutant, counting the killed ones", () => {
    expect(report.staticMutants.survivors).toEqual([
      {
        file: "features/alpha/alpha.ts",
        line: 2,
        column: 14,
        mutator: "Regex",
        replacement: "/^$/",
      },
    ]);
  });

  it("surfaces tokens that claim a criterion no spec declares", () => {
    expect(report.unknownClaims).toEqual(["BETA-9"]);
  });

  it("aggregates a feature over the mutants its criteria cover, counting each once", () => {
    const [feature] = report.features;
    expect(feature).toMatchObject({ key: "ALPHA", spec: "features/alpha/SPEC.md" });
    expect(feature).toMatchObject({ covered: 5, killed: 3 });
  });

  it("reads line coverage as the naive baseline, separate from strength", () => {
    expect(report.lineCoverage).toBe(0.8);
    expect(report.features[0]!.lineCoverage).toBe(0.8);
  });

  it("orders criteria by number, not lexically", () => {
    expect(report.features[0]!.criteria.map((c) => c.id)).toEqual([
      "ALPHA-1",
      "ALPHA-2",
      "ALPHA-3",
    ]);
  });

  it("rejects a mutation report without perTest coverage analysis", async () => {
    await expect(
      strength(FIXTURE, {
        mutationReport: "mutation-all-coverage.json",
        coverageSummary: "coverage-summary.json",
      }),
    ).rejects.toThrow(/perTest/);
  });

  it("runs without a coverage summary, reporting no baseline", async () => {
    const bare = await strength(FIXTURE, {
      mutationReport: "mutation.json",
      coverageSummary: "no-such-file.json",
    });
    expect(bare.lineCoverage).toBeNull();
    expect(bare.strength).toBe(0.6);
  });

  it("fails when the mutation report is missing", async () => {
    await expect(strength(FIXTURE, { mutationReport: "no-such-file.json" })).rejects.toThrow(
      /report not found/,
    );
  });

  it("fails on a path that does not exist", async () => {
    await expect(strength(resolve(FIXTURE, "nope"))).rejects.toThrow(/path not found/);
  });
});
