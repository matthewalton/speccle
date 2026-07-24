import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CALIBRATION_FILE,
  calibrationReport,
  type CalibrationEntry,
  type HumanVerdict,
  recordCalibration,
} from "./calibration.ts";

describe("calibration", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function scaffold(files: Record<string, string>, policy?: unknown) {
    const root = await mkdtemp(join(tmpdir(), "speccle-calibration-"));
    roots.push(root);
    for (const [file, body] of Object.entries(files)) await write(root, file, body);
    if (policy !== undefined) await write(root, ".speccle/risk.json", JSON.stringify(policy));
    return root;
  }

  async function write(root: string, file: string, body: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body);
  }

  const spec = (...criteria: string[]) => criteria.map((c) => `## ${c}`).join("\n\n") + "\n";
  const claiming = (...ids: string[]) => ids.map((id) => `it("[${id}] ok", () => {});`).join("\n");
  const noBaseline = () => undefined;
  const fixedClock = () => "2026-07-24T00:00:00Z";

  /** A calibration entry with sensible defaults, overridable per field — the record's line format. */
  const line = (entry: Partial<CalibrationEntry> & { verdict: HumanVerdict }) =>
    JSON.stringify({
      at: "2026-01-01T00:00:00Z",
      score: 0,
      threshold: 3,
      humanRequired: false,
      escalated: false,
      signals: [],
      ...entry,
    }) + "\n";

  const record = (root: string, ...entries: string[]) =>
    write(root, CALIBRATION_FILE, entries.join(""));

  describe("recordCalibration", () => {
    it("records the risk floor together with the honest human verdict", async () => {
      const root = await scaffold({
        "checkout/SPEC.md": spec("[CHECKOUT-1] a"),
        "checkout/tax.test.ts": claiming("CHECKOUT-1"),
        "checkout/tax.ts": "export const t = 1;",
      });
      const report = await recordCalibration(
        root,
        { neededHuman: true, foundReal: true },
        { changed: ["checkout/tax.ts"], baseline: noBaseline, now: fixedClock },
      );
      expect(report.entry).toMatchObject({
        at: "2026-07-24T00:00:00Z",
        score: 3, // spec-silent-change: source moved, the claimed slice stays quiet on unclaimed
        threshold: 3,
        humanRequired: true,
        escalated: false,
        signals: ["spec-silent-change"],
        verdict: { neededHuman: true, foundReal: true },
      });
      expect(report.file).toBe(CALIBRATION_FILE);
      expect(report.count).toBe(1);
    });

    it("appends without dropping earlier entries", async () => {
      const root = await scaffold({ "README.md": "docs" });
      const options = { changed: ["README.md"], baseline: noBaseline, now: fixedClock };
      await recordCalibration(root, { neededHuman: false, foundReal: false }, options);
      const second = await recordCalibration(
        root,
        { neededHuman: true, foundReal: false },
        options,
      );
      expect(second.count).toBe(2);
      const raw = await readFile(join(root, CALIBRATION_FILE), "utf8");
      expect(raw.trimEnd().split("\n")).toHaveLength(2);
    });

    it("carries escalation and a note when given, and omits an empty note", async () => {
      const root = await scaffold({ "README.md": "docs" });
      const options = { changed: ["README.md"], baseline: noBaseline, now: fixedClock };
      const annotated = await recordCalibration(
        root,
        { neededHuman: true, foundReal: false, escalated: true, note: "risky refactor" },
        options,
      );
      expect(annotated.entry).toMatchObject({ escalated: true, note: "risky refactor" });
      const empty = await recordCalibration(
        root,
        { neededHuman: false, foundReal: false, note: "" },
        options,
      );
      expect(empty.entry.note).toBeUndefined();
    });

    it("throws on a missing path", async () => {
      await expect(
        recordCalibration("/no/such/dir", { neededHuman: false, foundReal: false }),
      ).rejects.toThrow("path not found");
    });
  });

  describe("calibrationReport", () => {
    it("proposes nothing on an empty record", async () => {
      const root = await scaffold({});
      const report = await calibrationReport(root);
      expect(report.count).toBe(0);
      expect(report.supportedThreshold).toBeNull();
      expect(report.signals).toEqual([]);
      expect(report.proposals.join(" ")).toContain("no calibration entries yet");
    });

    it("flags a signal that fired but never on a change that mattered", async () => {
      const root = await scaffold({});
      await record(
        root,
        line({ signals: ["noisy"], verdict: { neededHuman: false, foundReal: false } }),
        line({ signals: ["noisy"], verdict: { neededHuman: false, foundReal: false } }),
      );
      const report = await calibrationReport(root);
      expect(report.signals.find((s) => s.id === "noisy")).toMatchObject({
        fired: 2,
        firedOnMattered: 0,
        neverUseful: true,
      });
      expect(report.proposals.join(" ")).toMatch(/noisy fired but never on a change that mattered/);
    });

    it("counts a firing on a change that found something real as mattering", async () => {
      const root = await scaffold({});
      await record(
        root,
        line({ signals: ["useful"], verdict: { neededHuman: false, foundReal: true } }),
      );
      const report = await calibrationReport(root);
      expect(report.signals.find((s) => s.id === "useful")).toMatchObject({
        firedOnMattered: 1,
        neverUseful: false,
      });
    });

    it("flags a signal that fired on every change that needed a human", async () => {
      const root = await scaffold({});
      await record(
        root,
        line({
          score: 5,
          signals: ["reliable"],
          humanRequired: true,
          verdict: { neededHuman: true, foundReal: true },
        }),
        line({
          score: 6,
          signals: ["reliable", "other"],
          humanRequired: true,
          verdict: { neededHuman: true, foundReal: false },
        }),
        line({ score: 0, signals: [], verdict: { neededHuman: false, foundReal: false } }),
      );
      const report = await calibrationReport(root);
      expect(report.signals.find((s) => s.id === "reliable")?.firedOnEveryNeeded).toBe(true);
      expect(report.signals.find((s) => s.id === "other")?.firedOnEveryNeeded).toBe(false);
      expect(report.proposals.join(" ")).toMatch(
        /reliable fired on every change that needed a human/,
      );
    });

    it("supports a threshold up to the cheapest change that needed a human", async () => {
      const root = await scaffold({});
      await record(
        root,
        line({ score: 8, humanRequired: true, verdict: { neededHuman: true, foundReal: true } }),
        line({ score: 5, humanRequired: true, verdict: { neededHuman: true, foundReal: true } }),
        line({ score: 1, humanRequired: false, verdict: { neededHuman: false, foundReal: false } }),
      );
      const report = await calibrationReport(root);
      expect(report.neededByHuman).toBe(2);
      expect(report.gatedByFloor).toBe(2);
      expect(report.currentThreshold).toBe(3);
      expect(report.supportedThreshold).toBe(5);
      expect(report.proposals.join(" ")).toMatch(/review threshold up to 5 \(now 3\)/);
    });

    it("counts floor misses and over-supervision against the verdict", async () => {
      const root = await scaffold({});
      await record(
        root,
        // Needed a human, but the floor did not require one and no lens escalated — a miss.
        line({
          score: 1,
          humanRequired: false,
          escalated: false,
          verdict: { neededHuman: true, foundReal: true },
        }),
        // Escalation caught a low-scoring change that needed a human — not a floor miss.
        line({
          score: 2,
          humanRequired: false,
          escalated: true,
          verdict: { neededHuman: true, foundReal: false },
        }),
        // The floor required a human the verdict says was not needed — over-supervision.
        line({ score: 9, humanRequired: true, verdict: { neededHuman: false, foundReal: false } }),
      );
      const report = await calibrationReport(root);
      expect(report.floorMisses).toBe(1);
      expect(report.overSupervised).toBe(1);
    });

    it("reads the review threshold from the risk policy", async () => {
      const root = await scaffold({}, { threshold: 10 });
      await record(
        root,
        line({ score: 12, humanRequired: true, verdict: { neededHuman: true, foundReal: true } }),
      );
      const report = await calibrationReport(root);
      expect(report.currentThreshold).toBe(10);
      expect(report.supportedThreshold).toBe(12);
      expect(report.proposals.join(" ")).toMatch(/review threshold up to 12 \(now 10\)/);
    });

    it("shows a floor that would miss a change when the record scores below the threshold", async () => {
      const root = await scaffold({});
      await record(
        root,
        line({ score: 1, humanRequired: false, verdict: { neededHuman: true, foundReal: true } }),
      );
      const report = await calibrationReport(root);
      expect(report.supportedThreshold).toBe(1);
      expect(report.proposals.join(" ")).toMatch(/scored 1, below the threshold of 3/);
    });

    it("throws on a malformed entry, naming the line", async () => {
      const root = await scaffold({});
      await write(root, CALIBRATION_FILE, "not json\n");
      await expect(calibrationReport(root)).rejects.toThrow(
        `${CALIBRATION_FILE}:1 is not valid JSON`,
      );
    });

    it("throws when an entry is missing its human verdict", async () => {
      const root = await scaffold({});
      await write(
        root,
        CALIBRATION_FILE,
        JSON.stringify({
          at: "t",
          score: 1,
          threshold: 3,
          humanRequired: false,
          escalated: false,
          signals: [],
        }) + "\n",
      );
      await expect(calibrationReport(root)).rejects.toThrow(
        'needs boolean "neededHuman" and "foundReal"',
      );
    });

    it("throws on a missing path", async () => {
      await expect(calibrationReport("/no/such/dir")).rejects.toThrow("path not found");
    });
  });
});
