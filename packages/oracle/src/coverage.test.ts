import { describe, expect, it } from "vitest";
import { coverageUnder, parseCoverageSummary } from "./coverage.ts";

const ROOT = "/repo";
const lines = (covered: number, total: number) => ({ lines: { covered, total } });

describe("parseCoverageSummary", () => {
  it("rewrites Istanbul's absolute keys as root-relative posix paths", () => {
    const summary = parseCoverageSummary(
      { "/repo/features/basket/basket.ts": lines(7, 7) },
      ROOT,
      "coverage-summary.json",
    );
    expect([...summary.files.keys()]).toEqual(["features/basket/basket.ts"]);
  });

  it("keeps the report's own total row apart from the per-file rows", () => {
    const summary = parseCoverageSummary(
      { total: lines(19, 19), "/repo/a.ts": lines(7, 7) },
      ROOT,
      "coverage-summary.json",
    );
    expect(summary.total).toEqual({ covered: 19, total: 19 });
    expect([...summary.files.keys()]).toEqual(["a.ts"]);
  });

  it("skips rows that carry no line counts", () => {
    const summary = parseCoverageSummary(
      { "/repo/a.ts": { branches: { covered: 1, total: 2 } } },
      ROOT,
      "coverage-summary.json",
    );
    expect(summary.files.size).toBe(0);
  });

  it("names the file it was given when the shape is wrong", () => {
    expect(() => parseCoverageSummary([], ROOT, "coverage-summary.json")).toThrow(
      /coverage-summary\.json is not an Istanbul json-summary report/,
    );
  });
});

describe("coverageUnder", () => {
  const summary = parseCoverageSummary(
    {
      "/repo/features/checkout/checkout.ts": lines(10, 12),
      "/repo/features/checkout/totals.ts": lines(2, 4),
      "/repo/features/check/other.ts": lines(1, 1),
    },
    ROOT,
    "coverage-summary.json",
  );

  it("sums every file in the feature directory", () => {
    expect(coverageUnder(summary, "features/checkout")).toEqual({ covered: 12, total: 16 });
  });

  it("matches on a directory boundary, not a bare string prefix", () => {
    expect(coverageUnder(summary, "features/check")).toEqual({ covered: 1, total: 1 });
  });

  it("returns undefined for a directory the summary never mentions", () => {
    expect(coverageUnder(summary, "features/basket")).toBeUndefined();
  });
});
