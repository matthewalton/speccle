import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { next } from "./next.ts";

describe("next", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function scaffold(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-next-"));
    roots.push(root);
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), content);
    }
    return root;
  }

  /** BASKET-3 sits first in the document, which is what an amendment does to id order. */
  const SPEC = `---
key: BASKET
---

# Basket

## [BASKET-3] When an item is added twice, its quantity increments by exactly 1

## [BASKET-1] When the last item is removed, the basket totals zero

## [BASKET-2] When a coupon is applied, the basket shows the discounted total
`;

  it("finds no slice in a folder with neither a spec nor a plan's decisions", async () => {
    const root = await scaffold({ "README.md": "# nothing governed here\n" });
    const report = await next(root);
    expect(report.slices).toEqual([]);
    expect(report.inFlight).toEqual([]);
    expect(report.stage).toBeUndefined();
    expect(report.done).toBe(false);
  });

  it("puts a folder a plan created but no spec landed in at the spec stage", async () => {
    const root = await scaffold({ "decisions/0001-rounding.md": "# 0001 — rounding\n" });
    const report = await next(root);
    expect(report.slices).toEqual([
      expect.objectContaining({ folder: ".", spec: undefined, stage: "spec" }),
    ]);
    expect(report.stage).toBe("spec");
    expect(report.slice).toBe(".");
  });

  it("holds a spec that does not lint at the spec stage, carrying what is wrong with it", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": `---
key: BASKET
---

# Basket

## A heading with no criterion id
`,
    });
    const report = await next(root);
    expect(report.stage).toBe("spec");
    expect(report.slices[0]!.violations).toEqual([
      expect.objectContaining({ rule: "malformed-id", file: "features/basket/SPEC.md" }),
    ]);
  });

  it("holds a criterion-less spec at the spec stage rather than calling it done", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": `---
key: BASKET
---

# Basket
`,
    });
    const report = await next(root);
    expect(report.stage).toBe("spec");
    expect(report.done).toBe(false);
  });

  it("names the first unclaimed criterion in document order, not id order", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `it("[BASKET-1] empties", () => {});`,
    });
    const report = await next(root);
    expect(report.stage).toBe("implement");
    expect(report.slices[0]!.criterion).toEqual({
      id: "BASKET-3",
      statement: "When an item is added twice, its quantity increments by exactly 1",
      order: 1,
    });
    expect(report.slices[0]!.unclaimed.map((c) => c.id)).toEqual(["BASKET-3", "BASKET-2"]);
  });

  it("owes a tracer while nothing is claimed, and stops owing one once something is", async () => {
    const bare = await scaffold({ "features/basket/SPEC.md": SPEC });
    expect((await next(bare)).slices[0]!.tracerOwed).toBe(true);

    const started = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `it("[BASKET-1] empties", () => {});`,
    });
    expect((await next(started)).slices[0]!.tracerOwed).toBe(false);
  });

  it("routes to the stale claims ahead of any unclaimed criterion", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        it("[BASKET-1] empties", () => {});
        it("[BASKET-9] a criterion no spec declares", () => {});
      `,
    });
    const report = await next(root);
    expect(report.stage).toBe("stale-claims");
    expect(report.slices[0]!.staleClaims).toEqual(["BASKET-9"]);
    // The criterion is withheld until the lie is cleared, so no session implements past it.
    expect(report.slices[0]!.criterion).toBeUndefined();
    expect(report.slices[0]!.unclaimed.map((c) => c.id)).toEqual(["BASKET-3", "BASKET-2"]);
  });

  it("charges a stale claim to the slice whose test file carries it", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        it("[BASKET-1] empties", () => {});
        it("[BASKET-2] discounts", () => {});
        it("[BASKET-3] increments", () => {});
      `,
      "features/pricing/SPEC.md": `---
key: PRICING
---

# Pricing

## [PRICING-1] When a price is quoted, it carries the tax rate it was quoted under
`,
      "features/pricing/src/pricing.test.ts": `
        it("[PRICING-1] quotes", () => {});
        it("[PRICING-7] a criterion no spec declares", () => {});
      `,
    });
    const report = await next(root);
    expect(report.slices.map((slice) => [slice.folder, slice.stage, slice.staleClaims])).toEqual([
      ["features/basket", "done", []],
      ["features/pricing", "stale-claims", ["PRICING-7"]],
    ]);
    expect(report.inFlight).toEqual(["features/pricing"]);
    expect(report.stage).toBe("stale-claims");
  });

  it("is done when every criterion of every slice is claimed", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/basket/src/basket.test.ts": `
        it("[BASKET-1] empties", () => {});
        it("[BASKET-2] discounts", () => {});
        it("[BASKET-3] increments", () => {});
      `,
    });
    const report = await next(root);
    expect(report.done).toBe(true);
    expect(report.stage).toBe("done");
    expect(report.slice).toBeUndefined();
    expect(report.inFlight).toEqual([]);
  });

  it("refuses to pick between two slices in flight", async () => {
    const root = await scaffold({
      "features/basket/SPEC.md": SPEC,
      "features/pricing/SPEC.md": `---
key: PRICING
---

# Pricing

## [PRICING-1] When a price is quoted, it carries the tax rate it was quoted under
`,
    });
    const report = await next(root);
    expect(report.inFlight).toEqual(["features/basket", "features/pricing"]);
    expect(report.stage).toBeUndefined();
    expect(report.slice).toBeUndefined();
    expect(report.done).toBe(false);
  });

  it("throws on a missing path", async () => {
    await expect(next(join(tmpdir(), "speccle-next-absent"))).rejects.toThrow("path not found");
  });
});
