import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  recallRemedy,
  recordRemedy,
  REMEDY_FILE,
  type RemedyEntry,
  type RemedyInput,
} from "./remedy.ts";

describe("remedy", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function scaffold() {
    const root = await mkdtemp(join(tmpdir(), "speccle-remedy-"));
    roots.push(root);
    return root;
  }

  async function write(root: string, file: string, body: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body);
  }

  const fixedClock = () => "2026-07-24T00:00:00Z";

  /** A remedy input with sensible defaults, overridable per field. */
  const remedy = (over: Partial<RemedyInput> = {}): RemedyInput => ({
    class: "missing-model-roundtrip-test",
    finding: "a changed @Model has no round-trip test",
    fix: "added the round-trip test",
    route: "check",
    artefact: ".speccle/checks/model-roundtrip.md",
    ...over,
  });

  /** A persisted remedy line with sensible defaults, overridable per field — the record's format. */
  const line = (over: Partial<RemedyEntry> = {}) =>
    JSON.stringify({
      at: "2026-01-01T00:00:00Z",
      class: "missing-model-roundtrip-test",
      finding: "a changed @Model has no round-trip test",
      fix: "added the round-trip test",
      route: "check",
      artefact: ".speccle/checks/model-roundtrip.md",
      ...over,
    }) + "\n";

  const record = (root: string, ...entries: string[]) => write(root, REMEDY_FILE, entries.join(""));

  describe("recordRemedy", () => {
    it("records the finding, the fix, and the chosen prevention artefact", async () => {
      const root = await scaffold();
      const report = await recordRemedy(root, remedy(), { now: fixedClock });
      expect(report.entry).toEqual({
        at: "2026-07-24T00:00:00Z",
        class: "missing-model-roundtrip-test",
        finding: "a changed @Model has no round-trip test",
        fix: "added the round-trip test",
        route: "check",
        artefact: ".speccle/checks/model-roundtrip.md",
      });
      expect(report.file).toBe(REMEDY_FILE);
      expect(report.count).toBe(1);
    });

    it("appends without dropping earlier remedies", async () => {
      const root = await scaffold();
      await recordRemedy(root, remedy(), { now: fixedClock });
      const second = await recordRemedy(root, remedy({ class: "n-plus-one-query" }), {
        now: fixedClock,
      });
      expect(second.count).toBe(2);
      const raw = await readFile(join(root, REMEDY_FILE), "utf8");
      expect(raw.trimEnd().split("\n")).toHaveLength(2);
    });

    it("carries a note when given, and omits an empty one", async () => {
      const root = await scaffold();
      const annotated = await recordRemedy(root, remedy({ note: "seen twice this week" }), {
        now: fixedClock,
      });
      expect(annotated.entry.note).toBe("seen twice this week");
      const blank = await recordRemedy(root, remedy({ note: "   " }), { now: fixedClock });
      expect(blank.entry.note).toBeUndefined();
    });

    it("records a one-off with no artefact", async () => {
      const root = await scaffold();
      const oneOff: RemedyInput = {
        class: "comment-typo",
        finding: "a typo in a comment",
        fix: "fixed the typo",
        route: "none",
      };
      const report = await recordRemedy(root, oneOff, { now: fixedClock });
      expect(report.entry.route).toBe("none");
      expect(report.entry.artefact).toBeUndefined();
    });

    it("requires an artefact for a preventable route", async () => {
      const root = await scaffold();
      const noArtefact: RemedyInput = {
        class: "unlensed-n-plus-one",
        finding: "the perf lens missed an n+1",
        fix: "flagged it by hand",
        route: "lens",
      };
      await expect(recordRemedy(root, noArtefact)).rejects.toThrow(
        "a lens remedy needs an --artefact",
      );
    });

    it("rejects an artefact on a one-off, which prevents nothing", async () => {
      const root = await scaffold();
      await expect(
        recordRemedy(root, remedy({ route: "none", artefact: ".speccle/checks/x.md" })),
      ).rejects.toThrow("a none remedy prevents nothing");
    });

    it("rejects an empty class, finding, or fix", async () => {
      const root = await scaffold();
      await expect(recordRemedy(root, remedy({ class: "  " }))).rejects.toThrow("needs a --class");
      await expect(recordRemedy(root, remedy({ finding: "" }))).rejects.toThrow(
        "needs a --finding",
      );
      await expect(recordRemedy(root, remedy({ fix: "" }))).rejects.toThrow("needs a --fix");
    });

    it("throws on a missing path", async () => {
      await expect(recordRemedy("/no/such/dir", remedy())).rejects.toThrow("path not found");
    });
  });

  describe("recallRemedy", () => {
    it("recalls nothing from an empty record", async () => {
      const root = await scaffold();
      const report = await recallRemedy(root, "missing-model-roundtrip-test");
      expect(report.count).toBe(0);
      expect(report.matches).toEqual([]);
    });

    it("recalls a prior remedy for the same class", async () => {
      const root = await scaffold();
      await record(root, line());
      const report = await recallRemedy(root, "missing-model-roundtrip-test");
      expect(report.matches).toHaveLength(1);
      expect(report.matches[0]).toMatchObject({
        route: "check",
        artefact: ".speccle/checks/model-roundtrip.md",
      });
    });

    it("recalls across a rephrased class when one side's tokens subset the other's", async () => {
      const root = await scaffold();
      await record(root, line({ class: "missing-model-roundtrip-test" }));
      const report = await recallRemedy(root, "missing-roundtrip");
      expect(report.matches).toHaveLength(1);
    });

    it("does not recall an unrelated class", async () => {
      const root = await scaffold();
      await record(root, line({ class: "n-plus-one-query" }));
      const report = await recallRemedy(root, "missing-model-roundtrip-test");
      expect(report.matches).toEqual([]);
      expect(report.count).toBe(1);
    });

    it("returns the latest answer to a class first", async () => {
      const root = await scaffold();
      await record(
        root,
        line({ at: "2026-01-01T00:00:00Z", fix: "first pass", note: "old" }),
        line({ at: "2026-02-01T00:00:00Z", fix: "sharper pass", note: "new" }),
      );
      const report = await recallRemedy(root, "missing-model-roundtrip-test");
      expect(report.matches.map((entry) => entry.note)).toEqual(["new", "old"]);
    });

    it("recalls nothing for an empty query", async () => {
      const root = await scaffold();
      await record(root, line());
      const report = await recallRemedy(root, "   ");
      expect(report.matches).toEqual([]);
      expect(report.count).toBe(1);
    });

    it("throws on a malformed entry, naming the line", async () => {
      const root = await scaffold();
      await write(root, REMEDY_FILE, "not json\n");
      await expect(recallRemedy(root, "anything")).rejects.toThrow(
        `${REMEDY_FILE}:1 is not valid JSON`,
      );
    });

    it("throws on an unknown route in the record", async () => {
      const root = await scaffold();
      await record(root, line({ route: "sharpen" as RemedyEntry["route"] }));
      await expect(recallRemedy(root, "anything")).rejects.toThrow('"route" must be one of');
    });

    it("throws when a preventable route names no artefact", async () => {
      const root = await scaffold();
      const bare =
        JSON.stringify({ at: "t", class: "c", finding: "f", fix: "x", route: "check" }) + "\n";
      await record(root, bare);
      await expect(recallRemedy(root, "anything")).rejects.toThrow("a check remedy needs an");
    });

    it("throws on a missing path", async () => {
      await expect(recallRemedy("/no/such/dir", "anything")).rejects.toThrow("path not found");
    });
  });
});
