import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claims, extractTestNames } from "./claims.ts";

describe("extractTestNames", () => {
  it("captures describe, it, and test titles in any quote style", () => {
    const source = `
      describe("[A-1] outer", () => {
        it('inner case', () => {});
        test(\`another [A-2] case\`, () => {});
      });
    `;
    expect(extractTestNames(source)).toEqual(["[A-1] outer", "inner case", "another [A-2] case"]);
  });

  it("captures titles behind modifiers like .skip and .only", () => {
    const source = `describe.only("[A-1] focused", () => { it.skip("later", () => {}); });`;
    expect(extractTestNames(source)).toEqual(["[A-1] focused", "later"]);
  });

  it("keeps escaped quotes inside a title", () => {
    expect(extractTestNames(`it("quotes \\"[A-1]\\" evidence", () => {})`)).toEqual([
      'quotes \\"[A-1]\\" evidence',
    ]);
  });

  it("ignores strings that are not describe/it/test titles", () => {
    const source = `expect(render("[A-9] not a claim")).toBe("[A-8] also not");`;
    expect(extractTestNames(source)).toEqual([]);
  });
});

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
});
