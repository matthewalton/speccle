import { describe, expect, it } from "vitest";
import { isKill, isScored, parseMutationReport, type MutantStatus } from "./mutation.ts";

const minimal = (mutant: Record<string, unknown>): unknown => ({
  files: { "src/a.ts": { mutants: [{ location: { start: { line: 1 } }, ...mutant }] } },
});

describe("parseMutationReport", () => {
  it("flattens mutants across files, keeping the report's relative paths", () => {
    const report = parseMutationReport(
      {
        files: {
          "src/a.ts": {
            mutants: [
              {
                id: "1",
                status: "Killed",
                mutatorName: "EqualityOperator",
                replacement: ">=",
                coveredBy: ["t1"],
                location: { start: { line: 4, column: 9 } },
              },
            ],
          },
          "src/b.ts": {
            mutants: [{ id: "2", status: "Survived", location: { start: { line: 1 } } }],
          },
        },
      },
      "mutation.json",
    );

    expect(report.mutants).toEqual([
      {
        id: "1",
        file: "src/a.ts",
        line: 4,
        column: 9,
        mutator: "EqualityOperator",
        replacement: ">=",
        status: "Killed",
        coveredBy: ["t1"],
      },
      {
        id: "2",
        file: "src/b.ts",
        line: 1,
        column: 0,
        mutator: "unknown",
        replacement: undefined,
        status: "Survived",
        coveredBy: [],
      },
    ]);
  });

  it("maps every test id to its full concatenated name across test files", () => {
    const report = parseMutationReport(
      {
        files: {},
        testFiles: {
          "a.test.ts": { tests: [{ id: "0", name: "[A-1] one" }] },
          "b.test.ts": { tests: [{ id: "1", name: "[B-2] two" }] },
        },
      },
      "mutation.json",
    );
    expect([...report.testNames]).toEqual([
      ["0", "[A-1] one"],
      ["1", "[B-2] two"],
    ]);
  });

  it("reads the coverage analysis the report was produced with", () => {
    const report = parseMutationReport(
      { files: {}, config: { coverageAnalysis: "perTest" } },
      "mutation.json",
    );
    expect(report.coverageAnalysis).toBe("perTest");
  });

  it("rejects a status the schema does not define rather than silently miscounting", () => {
    expect(() => parseMutationReport(minimal({ id: "1", status: "Exploded" }), "m.json")).toThrow(
      /unknown status Exploded/,
    );
  });

  it("names the file it was given when the shape is wrong", () => {
    expect(() => parseMutationReport({}, "m.json")).toThrow(/m\.json.*missing `files`/);
    expect(() => parseMutationReport([], "m.json")).toThrow(/expected a JSON object/);
    expect(() => parseMutationReport({ files: { "a.ts": {} } }, "m.json")).toThrow(/not an array/);
  });

  it("requires a mutant to carry an id and a start line", () => {
    expect(() => parseMutationReport(minimal({ status: "Killed" }), "m.json")).toThrow(/`id`/);
    expect(() =>
      parseMutationReport({ files: { "a.ts": { mutants: [{ id: "1", status: "Killed" }] } } }, "m"),
    ).toThrow(/location\.start\.line/);
  });
});

describe("mutant status", () => {
  it("counts Killed and Timeout as kills", () => {
    expect(isKill("Killed")).toBe(true);
    expect(isKill("Timeout")).toBe(true);
    expect(isKill("Survived")).toBe(false);
  });

  it("scores only the mutants the run actually exercised", () => {
    const scored: MutantStatus[] = ["Killed", "Survived", "Timeout"];
    const unscored: MutantStatus[] = [
      "NoCoverage",
      "CompileError",
      "RuntimeError",
      "Ignored",
      "Pending",
    ];
    expect(scored.every(isScored)).toBe(true);
    expect(unscored.some(isScored)).toBe(false);
  });
});
