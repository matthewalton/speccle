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
    expect((await claims(root)).dialects).toEqual(["ts-vitest"]);
    expect((await claims(root)).features[0]!.dialect).toBe("ts-vitest");
    expect((await claims(root, { dialect: "swift" })).dialects).toEqual(["swift"]);
  });

  it("names the dialect a pass would have run under when the tree has no spec", async () => {
    const root = await scaffold({ "README.md": "# nothing governed here\n" });
    const report = await claims(root);
    expect(report.dialects).toEqual(["ts-vitest"]);
    expect(report.features).toEqual([]);
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

  describe("a mixed-language tree, joined under each folder's own dialect", () => {
    const PLAYER_SPEC = `---
key: PLAYER
---

# Player

## [PLAYER-1] Pausing playback holds the current position
`;

    const MIXED = {
      ".speccle/config.json": JSON.stringify({
        dialect: "ts-vitest",
        suite: "pnpm test",
        overrides: [{ path: "ios", dialect: "swift", suite: "swift test" }],
      }),
      "web/basket/SPEC.md": SPEC,
      "web/basket/basket.test.ts": `
        it("[BASKET-1] adds", () => {});
        it("[BASKET-2] empties", () => {});
      `,
      "ios/player/SPEC.md": PLAYER_SPEC,
      "ios/player/PlayerTests.swift": `
        @Suite struct PlayerSuite {
          @Test("[PLAYER-1] pausing holds the position")
          func pauses() {}
        }
      `,
    };

    it("resolves the override per spec folder, so both slices claim in one pass", async () => {
      const root = await scaffold(MIXED);
      const report = await claims(root);
      expect(report.dialects).toEqual(["swift", "ts-vitest"]);
      expect(report.testFiles).toEqual([
        "ios/player/PlayerTests.swift",
        "web/basket/basket.test.ts",
      ]);
      expect(report.features.map((feature) => [feature.spec, feature.dialect])).toEqual([
        ["ios/player/SPEC.md", "swift"],
        ["web/basket/SPEC.md", "ts-vitest"],
      ]);
      expect(report.unclaimed).toEqual([]);
      expect(report.clean).toBe(true);
    });

    it("an explicit dialect forces one across every folder, overriding the config", async () => {
      const root = await scaffold(MIXED);
      const report = await claims(root, { dialect: "ts-vitest" });
      expect(report.dialects).toEqual(["ts-vitest"]);
      expect(report.features.every((feature) => feature.dialect === "ts-vitest")).toBe(true);
      expect(report.testFiles).toEqual(["web/basket/basket.test.ts"]);
      expect(report.unclaimed).toEqual(["PLAYER-1"]);
    });

    // The override corrects a subtree, not the whole repo: a slice outside it keeps the
    // repo default, so its tests are still read — and a swift file under it is not a test.
    it("leaves a slice outside the override on the repo default", async () => {
      const root = await scaffold({
        ...MIXED,
        "web/basket/BasketTests.swift": `
          final class BasketTests: XCTestCase {
            func test_BASKET_9_phantom() {}
          }
        `,
      });
      const report = await claims(root);
      expect(report.testFiles).not.toContain("web/basket/BasketTests.swift");
      expect(report.unknownClaims).toEqual([]);
      expect(report.clean).toBe(true);
    });
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
