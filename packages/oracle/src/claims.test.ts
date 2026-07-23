import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claims } from "./claims.ts";

describe("claims", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function scaffold(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-claims-"));
    roots.push(root);
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), content);
    }
    return root;
  }

  const SPEC = `---
key: BASKET
---

# Basket

## [BASKET-1] Adding an item increments its quantity by exactly 1

## [BASKET-2] Removing the last item leaves the basket empty
`;

  it("joins criteria to the test names that carry their tokens", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        describe("[BASKET-1] adding", () => { it("adds", () => {}); });
        it("[BASKET-2] empties the basket and [BASKET-9] phantom", () => {});
      `,
    });
    const report = await claims(root);
    expect(report.testFiles).toEqual(["features/basket/src/basket.test.ts"]);
    expect(report.features).toHaveLength(1);
    expect(report.features[0]!.criteria).toEqual([
      expect.objectContaining({ id: "BASKET-1", claimed: true }),
      expect.objectContaining({ id: "BASKET-2", claimed: true }),
    ]);
    expect(report.features[0]!.criteria[0]!.tests).toEqual([
      { file: "features/basket/src/basket.test.ts", name: "[BASKET-1] adding" },
    ]);
    expect(report.unclaimed).toEqual([]);
    expect(report.unknownClaims).toEqual([
      {
        id: "BASKET-9",
        tests: [
          {
            file: "features/basket/src/basket.test.ts",
            name: "[BASKET-2] empties the basket and [BASKET-9] phantom",
          },
        ],
      },
    ]);
    expect(report.clean).toBe(false);
  });

  it("reports an unclaimed criterion and stays clean:false", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `it("[BASKET-1] adds", () => {});`,
    });
    const report = await claims(root);
    expect(report.unclaimed).toEqual(["BASKET-2"]);
    expect(report.features[0]!.criteria[1]!.claimed).toBe(false);
    expect(report.clean).toBe(false);
  });

  it("is clean when every criterion is claimed and no claim is unknown", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        it("[BASKET-1] adds", () => {});
        it("[BASKET-2] empties", () => {});
      `,
    });
    const report = await claims(root);
    expect(report.clean).toBe(true);
    expect(report.unclaimed).toEqual([]);
    expect(report.unknownClaims).toEqual([]);
  });

  it("never reads test files inside skipped directories", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `it("[BASKET-1] adds", () => {});`,
      "features/basket/fixtures/decoy.test.ts": `it("[BASKET-2] decoy claim", () => {});`,
      "node_modules/pkg/pkg.test.ts": `it("[BASKET-2] dependency claim", () => {});`,
    });
    const report = await claims(root);
    expect(report.testFiles).toEqual(["features/basket/src/basket.test.ts"]);
    expect(report.unclaimed).toEqual(["BASKET-2"]);
  });

  it("only test files under a spec's folder count", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `it("[BASKET-1] adds", () => {});`,
      "tools/scanner.test.ts": `it("[BASKET-2] phantom from tooling", () => {});`,
    });
    const report = await claims(root);
    expect(report.testFiles).toEqual(["features/basket/src/basket.test.ts"]);
    expect(report.unclaimed).toEqual(["BASKET-2"]);
    expect(report.unknownClaims).toEqual([]);
  });

  it("throws on a missing path", async () => {
    await expect(claims("/no/such/dir")).rejects.toThrow("path not found");
  });

  it("runs the ts-vitest dialect unless told otherwise, and records which ran", async () => {
    const root = await scaffold({ "features/basket/SPEC.md": SPEC });
    expect((await claims(root)).dialect).toBe("ts-vitest");
    expect((await claims(root, { dialect: "swift" })).dialect).toBe("swift");
  });

  it("rejects an unsupported dialect before reading anything", async () => {
    await expect(claims(".", { dialect: "kotlin" })).rejects.toThrow(
      "unknown test dialect: kotlin",
    );
  });

  it("joins a Swift slice through both of the dialect's spellings", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/BasketTests.swift": `
        final class BasketTests: XCTestCase {
          func test_BASKET_1_addingIncrementsQuantity() {}
        }
      `,
      "features/basket/src/BasketSuiteTests.swift": `
        @Suite struct BasketSuite {
          @Test("[BASKET-2] removing the last item empties the basket")
          func removesLast() {}
        }
      `,
    });
    const report = await claims(root, { dialect: "swift" });
    expect(report.testFiles).toEqual([
      "features/basket/src/BasketSuiteTests.swift",
      "features/basket/src/BasketTests.swift",
    ]);
    expect(report.features[0]!.criteria[0]!.tests).toEqual([
      {
        file: "features/basket/src/BasketTests.swift",
        name: "test_BASKET_1_addingIncrementsQuantity",
      },
    ]);
    expect(report.clean).toBe(true);
  });

  // The identifier spelling is the swift dialect's, not everyone's: a TS title naming a
  // constant must never phantom-claim (ADR-0038 — a clean run means one thing).
  it("never reads the identifier spelling under ts-vitest", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        it("[BASKET-1] adds", () => {});
        it("[BASKET-2] rejects the BASKET_9 quantity code", () => {});
      `,
    });
    const report = await claims(root);
    expect(report.unknownClaims).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("finds no test files when the declared dialect is the wrong one", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        it("[BASKET-1] adds", () => {});
        it("[BASKET-2] empties", () => {});
      `,
    });
    const report = await claims(root, { dialect: "swift" });
    expect(report.testFiles).toEqual([]);
    expect(report.unclaimed).toEqual(["BASKET-1", "BASKET-2"]);
  });
});
