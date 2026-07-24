import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type FiredSignal, reviewThreshold, risk, type RiskReport } from "./risk.ts";

describe("risk", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function scaffold(files: Record<string, string>, policy?: unknown) {
    const root = await mkdtemp(join(tmpdir(), "speccle-risk-"));
    roots.push(root);
    for (const [file, body] of Object.entries(files)) await write(root, file, body);
    if (policy !== undefined) await write(root, ".speccle/risk.json", JSON.stringify(policy));
    return root;
  }

  async function write(root: string, file: string, body: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body);
  }

  /** A SPEC.md body of well-formed criteria, one per H2. */
  const spec = (...criteria: string[]) => criteria.map((c) => `## ${c}`).join("\n\n") + "\n";
  /** A vitest file whose test names claim the given criterion ids. */
  const claiming = (...ids: string[]) => ids.map((id) => `it("[${id}] ok", () => {});`).join("\n");
  const noBaseline = () => undefined;
  const baselineOf = (map: Record<string, string>) => (file: string) => map[file];
  const find = (report: RiskReport, id: string): FiredSignal | undefined =>
    report.signals.find((signal) => signal.id === id);

  it("fires nothing and requires no human when nothing notable changed", async () => {
    const root = await scaffold({ "README.md": "docs" });
    const report = await risk(root, { changed: ["README.md"], baseline: noBaseline });
    expect(report.signals).toEqual([]);
    expect(report.score).toBe(0);
    expect(report.threshold).toBe(3);
    expect(report.humanRequired).toBe(false);
  });

  describe("spec-silent-change — governed source moved without its SPEC.md", () => {
    const slice = {
      "checkout/SPEC.md": spec("[CHECKOUT-1] tax rounds to the nearest cent"),
      "checkout/tax.test.ts": claiming("CHECKOUT-1"),
    };

    it("fires when production source changed but the SPEC.md did not", async () => {
      const root = await scaffold({ ...slice, "checkout/tax.ts": "export const tax = 1;" });
      const report = await risk(root, { changed: ["checkout/tax.ts"], baseline: noBaseline });
      expect(find(report, "spec-silent-change")).toMatchObject({
        weight: 3,
        source: "baseline",
        evidence: ["checkout/tax.ts"],
      });
      expect(report.humanRequired).toBe(true);
    });

    it("stays quiet when the SPEC.md changed alongside the source", async () => {
      const root = await scaffold({ ...slice, "checkout/tax.ts": "export const tax = 1;" });
      const report = await risk(root, {
        changed: ["checkout/tax.ts", "checkout/SPEC.md"],
        baseline: noBaseline,
      });
      expect(find(report, "spec-silent-change")).toBeUndefined();
    });

    it("ignores changes to tests, CONTEXT.md, and decisions/ — those are not behaviour", async () => {
      const root = await scaffold(slice);
      const report = await risk(root, {
        changed: ["checkout/tax.test.ts", "checkout/CONTEXT.md", "checkout/decisions/0001-x.md"],
        baseline: noBaseline,
      });
      expect(find(report, "spec-silent-change")).toBeUndefined();
      expect(report.signals).toEqual([]);
    });
  });

  describe("criterion-retired / criterion-reworded — a changed SPEC.md against its baseline", () => {
    it("fires criterion-retired when an id drops out of the spec", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
        "checkout/tax.test.ts": claiming("CHECKOUT-1"),
      });
      const report = await risk(root, {
        changed: ["checkout/SPEC.md"],
        baseline: baselineOf({ "checkout/SPEC.md": spec("[CHECKOUT-1] a", "[CHECKOUT-2] b") }),
      });
      expect(find(report, "criterion-retired")).toMatchObject({
        weight: 4,
        evidence: ["CHECKOUT-2"],
      });
      expect(find(report, "criterion-reworded")).toBeUndefined();
      expect(report.humanRequired).toBe(true);
    });

    it("fires criterion-reworded — below threshold on its own", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] tax rounds up"),
        "checkout/tax.test.ts": claiming("CHECKOUT-1"),
      });
      const report = await risk(root, {
        changed: ["checkout/SPEC.md"],
        baseline: baselineOf({ "checkout/SPEC.md": spec("[CHECKOUT-1] tax rounds down") }),
      });
      expect(find(report, "criterion-reworded")).toMatchObject({
        weight: 2,
        evidence: ["CHECKOUT-1"],
      });
      expect(report.score).toBe(2);
      expect(report.humanRequired).toBe(false);
    });

    it("treats an added criterion as neither retired nor reworded", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] a", "[CHECKOUT-2] b"),
        "checkout/tax.test.ts": claiming("CHECKOUT-1", "CHECKOUT-2"),
      });
      const report = await risk(root, {
        changed: ["checkout/SPEC.md"],
        baseline: baselineOf({ "checkout/SPEC.md": spec("[CHECKOUT-1] a") }),
      });
      expect(report.signals).toEqual([]);
    });

    it("fires no criterion signal for a newly added spec with no baseline", async () => {
      const root = await scaffold({
        "feature/SPEC.md": spec("[F-1] a"),
        "feature/f.test.ts": claiming("F-1"),
      });
      const report = await risk(root, { changed: ["feature/SPEC.md"], baseline: noBaseline });
      expect(find(report, "criterion-retired")).toBeUndefined();
      expect(find(report, "criterion-reworded")).toBeUndefined();
    });

    it("retires every criterion of a deleted spec", async () => {
      // The spec is gone from disk but present in the change set and the baseline.
      const root = await scaffold({});
      const report = await risk(root, {
        changed: ["checkout/SPEC.md"],
        baseline: baselineOf({ "checkout/SPEC.md": spec("[CHECKOUT-1] a", "[CHECKOUT-2] b") }),
      });
      expect(find(report, "criterion-retired")).toMatchObject({
        evidence: ["CHECKOUT-1", "CHECKOUT-2"],
      });
    });
  });

  describe("unclaimed-change — the change touched an under-defended slice", () => {
    it("fires when a touched slice has a criterion no test claims", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
        "checkout/tax.test.ts": 'it("unrelated", () => {});',
      });
      // Only a test changed, so spec-silent-change cannot fire — this isolates unclaimed-change.
      const report = await risk(root, { changed: ["checkout/tax.test.ts"], baseline: noBaseline });
      expect(find(report, "unclaimed-change")).toMatchObject({
        weight: 3,
        evidence: ["CHECKOUT-1"],
      });
      expect(report.humanRequired).toBe(true);
    });

    it("stays quiet when the under-defended slice was not touched", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
        "other/util.ts": "",
      });
      const report = await risk(root, { changed: ["other/util.ts"], baseline: noBaseline });
      expect(find(report, "unclaimed-change")).toBeUndefined();
      expect(report.signals).toEqual([]);
    });

    it("stays quiet when the touched slice is fully claimed", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
        "checkout/tax.test.ts": claiming("CHECKOUT-1"),
        "checkout/tax.ts": "",
      });
      const report = await risk(root, { changed: ["checkout/tax.ts"], baseline: noBaseline });
      expect(find(report, "unclaimed-change")).toBeUndefined();
      expect(find(report, "spec-silent-change")).toBeDefined();
    });
  });

  describe("risk policy", () => {
    it("fires a repo-defined signal, carrying its weight, source, evidence, and provenance", async () => {
      const root = await scaffold(
        { "migrations/001.sql": "" },
        {
          signals: [
            {
              id: "migration",
              weight: 5,
              when: { path: "migrations/**" },
              message: "a database migration changed",
              because: "Ladder rule #9",
            },
          ],
        },
      );
      const report = await risk(root, { changed: ["migrations/001.sql"], baseline: noBaseline });
      expect(find(report, "migration")).toMatchObject({
        weight: 5,
        source: "policy",
        reason: "a database migration changed",
        evidence: ["migrations/001.sql"],
        because: "Ladder rule #9",
      });
      expect(report.humanRequired).toBe(true);
    });

    it("reweights a baseline signal", async () => {
      const root = await scaffold(
        {
          "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
          "checkout/tax.test.ts": claiming("CHECKOUT-1"),
          "checkout/tax.ts": "",
        },
        { weights: { "spec-silent-change": 10 } },
      );
      const report = await risk(root, { changed: ["checkout/tax.ts"], baseline: noBaseline });
      expect(find(report, "spec-silent-change")?.weight).toBe(10);
      expect(report.score).toBe(10);
    });

    it("mutes a baseline signal weighted at 0", async () => {
      const root = await scaffold(
        {
          "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
          "checkout/tax.test.ts": claiming("CHECKOUT-1"),
          "checkout/tax.ts": "",
        },
        { weights: { "spec-silent-change": 0 } },
      );
      const report = await risk(root, { changed: ["checkout/tax.ts"], baseline: noBaseline });
      expect(find(report, "spec-silent-change")).toBeUndefined();
      expect(report.signals).toEqual([]);
    });

    it("raises the review threshold above a fired score, so no human is required", async () => {
      const root = await scaffold(
        {
          "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
          "checkout/tax.test.ts": claiming("CHECKOUT-1"),
          "checkout/tax.ts": "",
        },
        { threshold: 100 },
      );
      const report = await risk(root, { changed: ["checkout/tax.ts"], baseline: noBaseline });
      expect(report.score).toBe(3);
      expect(report.threshold).toBe(100);
      expect(report.humanRequired).toBe(false);
    });
  });

  it("sums every distinct fired signal, baseline before policy", async () => {
    const root = await scaffold(
      { "checkout/SPEC.md": spec("[CHECKOUT-1] a"), "checkout/tax.ts": "" },
      {
        signals: [{ id: "checkout-touch", weight: 1, when: { path: "checkout/**" }, message: "m" }],
      },
    );
    // spec-silent-change (3) + unclaimed-change (3) + the policy signal (1).
    const report = await risk(root, { changed: ["checkout/tax.ts"], baseline: noBaseline });
    expect(report.signals.map((s) => s.id)).toEqual([
      "spec-silent-change",
      "unclaimed-change",
      "checkout-touch",
    ]);
    expect(report.signals.map((s) => s.source)).toEqual(["baseline", "baseline", "policy"]);
    expect(report.score).toBe(7);
  });

  it("fires a baseline signal once, aggregating evidence across slices", async () => {
    const root = await scaffold({
      "a/SPEC.md": spec("[A-1] x"),
      "a/a.test.ts": claiming("A-1"),
      "a/a.ts": "",
      "b/SPEC.md": spec("[B-1] y"),
      "b/b.test.ts": claiming("B-1"),
      "b/b.ts": "",
    });
    const report = await risk(root, { changed: ["a/a.ts", "b/b.ts"], baseline: noBaseline });
    const silent = report.signals.filter((s) => s.id === "spec-silent-change");
    expect(silent).toHaveLength(1);
    expect(silent[0]?.evidence).toEqual(["a/a.ts", "b/b.ts"]);
    expect(report.score).toBe(3);
  });

  describe("a malformed policy fails loudly, naming the file", () => {
    it("throws on invalid JSON", async () => {
      const root = await scaffold({});
      await write(root, ".speccle/risk.json", "{ not json");
      await expect(risk(root, { changed: [], baseline: noBaseline })).rejects.toThrow(
        ".speccle/risk.json is not valid JSON",
      );
    });

    it("throws on an unknown baseline weight key", async () => {
      const root = await scaffold({}, { weights: { "spec-silent": 3 } });
      await expect(risk(root, { changed: [], baseline: noBaseline })).rejects.toThrow(
        'unknown baseline signal in "weights": spec-silent',
      );
    });

    it("throws when a policy signal id collides with a baseline signal", async () => {
      const root = await scaffold(
        {},
        {
          signals: [{ id: "criterion-retired", weight: 1, when: { path: "x" }, message: "m" }],
        },
      );
      await expect(risk(root, { changed: [], baseline: noBaseline })).rejects.toThrow(
        "collides with a baseline signal",
      );
    });

    it("throws when a policy signal omits its when predicate", async () => {
      const root = await scaffold({}, { signals: [{ id: "x", weight: 1, message: "m" }] });
      await expect(risk(root, { changed: [], baseline: noBaseline })).rejects.toThrow(
        'signal "x" needs a "when" predicate',
      );
    });

    it("throws on a negative threshold", async () => {
      const root = await scaffold({}, { threshold: -1 });
      await expect(risk(root, { changed: [], baseline: noBaseline })).rejects.toThrow(
        '"threshold" must be a non-negative number',
      );
    });

    it("throws on a duplicate policy signal id", async () => {
      const root = await scaffold(
        {},
        {
          signals: [
            { id: "dup", weight: 1, when: { path: "a" }, message: "m" },
            { id: "dup", weight: 2, when: { path: "b" }, message: "m" },
          ],
        },
      );
      await expect(risk(root, { changed: [], baseline: noBaseline })).rejects.toThrow(
        'duplicate signal id "dup"',
      );
    });
  });

  it("throws on a missing path", async () => {
    await expect(risk("/no/such/dir")).rejects.toThrow("path not found");
  });

  describe("reviewThreshold", () => {
    it("returns the policy override, else the shipped default", async () => {
      const bare = await scaffold({});
      expect(await reviewThreshold(bare)).toBe(3);
      const tuned = await scaffold({}, { threshold: 12 });
      expect(await reviewThreshold(tuned)).toBe(12);
    });
  });

  it("reads the change set and the criterion baseline from git when neither is injected", async () => {
    const root = await scaffold({
      "checkout/SPEC.md": spec("[CHECKOUT-1] a", "[CHECKOUT-2] b"),
      "checkout/tax.test.ts": claiming("CHECKOUT-1", "CHECKOUT-2"),
    });
    const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("add", ".");
    git("commit", "-qm", "init");
    // Retire CHECKOUT-2 in the working tree; risk must read both the change and its baseline.
    await write(root, "checkout/SPEC.md", spec("[CHECKOUT-1] a"));
    const report = await risk(root);
    expect(report.changed).toContain("checkout/SPEC.md");
    expect(find(report, "criterion-retired")).toMatchObject({ evidence: ["CHECKOUT-2"] });
    expect(report.humanRequired).toBe(true);
  });
});
