import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDirectory, messageOf } from "./changeset.ts";
import { reviewThreshold, risk, type RiskOptions } from "./risk.ts";

/** Where the meta loop keeps its calibration record (ADR-0042): append-only, one entry per line. */
export const CALIBRATION_FILE = ".speccle/calibration.jsonl";

/**
 * The human's honest verdict on a reviewed change (ADR-0042). Both are the human's call, not
 * the floor's: recording the automatic gate verdict as if it were the human's is exactly the
 * dishonest data a threshold must never rise on.
 */
export interface HumanVerdict {
  /** Did this change actually need a human, whatever the floor said? */
  neededHuman: boolean;
  /** Did the review find something real? */
  foundReal: boolean;
}

/** One reviewed change in the calibration record — the deterministic floor plus the human's verdict. */
export interface CalibrationEntry {
  /** ISO-8601 stamp; ordering and "surface often enough", never part of the arithmetic. */
  at: string;
  /** The deterministic floor score at review time (ADR-0041). */
  score: number;
  /** The review threshold in force when this change was reviewed. */
  threshold: number;
  /** score ≥ threshold — the automatic gate's verdict, kept apart from the human's. */
  humanRequired: boolean;
  /** A risk lens escalated beyond the floor (ADR-0041) — free supervision, tracked so the report can see it. */
  escalated: boolean;
  /** The ids of the signals that fired, for the report's per-signal correlation. */
  signals: string[];
  verdict: HumanVerdict;
  /** Free-text context for the entry. */
  note?: string;
}

/** The verdict and annotations a caller supplies; the floor facts are computed, never passed in. */
export interface RecordInput extends HumanVerdict {
  escalated?: boolean;
  note?: string;
}

export interface RecordOptions extends RiskOptions {
  /** Injectable clock for a deterministic stamp in tests; defaults to the wall clock. */
  now?: () => string;
}

/** The JSON contract of `speccle calibrate record --json`. */
export interface RecordReport {
  root: string;
  /** Root-relative path of the record file. */
  file: string;
  entry: CalibrationEntry;
  /** Total entries in the record after this append. */
  count: number;
}

/**
 * Appends one calibration entry: `risk` computes the deterministic floor (score, signals,
 * threshold, humanRequired) over the change set, the caller supplies the honest human verdict.
 * The floor and the verdict are recorded side by side and never conflated.
 */
export async function recordCalibration(
  target: string,
  input: RecordInput,
  options: RecordOptions = {},
): Promise<RecordReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const { now, ...riskOptions } = options;
  const assessment = await risk(root, riskOptions);
  const stamp = (now ?? (() => new Date().toISOString()))();

  const entry: CalibrationEntry = {
    at: stamp,
    score: assessment.score,
    threshold: assessment.threshold,
    humanRequired: assessment.humanRequired,
    escalated: input.escalated ?? false,
    signals: assessment.signals.map((signal) => signal.id),
    verdict: { neededHuman: input.neededHuman, foundReal: input.foundReal },
    ...(input.note !== undefined && input.note !== "" && { note: input.note }),
  };

  const file = join(root, CALIBRATION_FILE);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(entry) + "\n");

  return { root, file: CALIBRATION_FILE, entry, count: (await readEntries(root)).length };
}

/** How one signal has correlated with reality across the record — the weight-move evidence. */
export interface SignalCalibration {
  id: string;
  /** Entries in which this signal fired. */
  fired: number;
  /** Of those, how many were on a change that mattered (needed a human or found something real). */
  firedOnMattered: number;
  /**
   * Fired at least once, but never on a change that mattered. A prompt to weigh its weight,
   * never a licence to delete it (ADR-0042).
   */
  neverUseful: boolean;
  /** Fired on every change the human said needed one — a reliable predictor. False when none did. */
  firedOnEveryNeeded: boolean;
}

/** The JSON contract of `speccle calibrate report --json`. */
export interface CalibrationReport {
  root: string;
  file: string;
  /** Entries analysed. */
  count: number;
  /** Entries whose honest verdict said a human was genuinely needed. */
  neededByHuman: number;
  /** Entries the deterministic floor gated (humanRequired). */
  gatedByFloor: number;
  /** Needed a human, but the floor did not require one and no lens escalated — the dangerous misses. */
  floorMisses: number;
  /** The floor required a human the verdict says was not needed — the friction the record can retire. */
  overSupervised: number;
  /** The review threshold in force now, read from the risk policy. */
  currentThreshold: number;
  /**
   * The highest floor threshold that would still gate every change that needed a human — the
   * cheapest such change's score. Null when no change has needed one, so nothing supports a move.
   */
  supportedThreshold: number | null;
  signals: SignalCalibration[];
  /** Human-legible and evidence-framed — never instructions; only a human reduces supervision (ADR-0042). */
  proposals: string[];
}

/**
 * Reads the calibration record and answers ADR-0042's three questions deterministically: which
 * signals never corresponded to a real problem, which fired on every change a human was needed
 * for, and the threshold the record would support. It proposes; it never applies.
 */
export async function calibrationReport(target: string): Promise<CalibrationReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const entries = await readEntries(root);
  const currentThreshold = await reviewThreshold(root);

  const mattered = (entry: CalibrationEntry): boolean =>
    entry.verdict.neededHuman || entry.verdict.foundReal;
  const neededEntries = entries.filter((entry) => entry.verdict.neededHuman);

  const ids = [...new Set(entries.flatMap((entry) => entry.signals))].sort();
  const signals: SignalCalibration[] = ids.map((id) => {
    const fired = entries.filter((entry) => entry.signals.includes(id));
    const firedOnMattered = fired.filter(mattered).length;
    return {
      id,
      fired: fired.length,
      firedOnMattered,
      neverUseful: fired.length > 0 && firedOnMattered === 0,
      firedOnEveryNeeded:
        neededEntries.length > 0 && neededEntries.every((entry) => entry.signals.includes(id)),
    };
  });

  // Conservative on purpose (ADR-0041 favours more supervision): the floor could rise no higher
  // than the cheapest change that genuinely needed a human, or the floor alone would have missed
  // it. Escalation is ignored here — a safety net must not be the reason a floor sits high.
  const supportedThreshold =
    neededEntries.length === 0 ? null : Math.min(...neededEntries.map((entry) => entry.score));

  const floorMisses = entries.filter(
    (entry) => entry.verdict.neededHuman && !entry.humanRequired && !entry.escalated,
  ).length;
  const overSupervised = entries.filter(
    (entry) => entry.humanRequired && !entry.verdict.neededHuman,
  ).length;

  return {
    root,
    file: CALIBRATION_FILE,
    count: entries.length,
    neededByHuman: neededEntries.length,
    gatedByFloor: entries.filter((entry) => entry.humanRequired).length,
    floorMisses,
    overSupervised,
    currentThreshold,
    supportedThreshold,
    signals,
    proposals: proposalsFrom(entries.length, signals, currentThreshold, supportedThreshold),
  };
}

function proposalsFrom(
  count: number,
  signals: SignalCalibration[],
  currentThreshold: number,
  supportedThreshold: number | null,
): string[] {
  if (count === 0) return ["no calibration entries yet — review some changes to build the record"];

  const out: string[] = [];
  const never = signals.filter((signal) => signal.neverUseful).map((signal) => signal.id);
  if (never.length > 0) {
    out.push(
      `${and(never)} fired but never on a change that mattered — weigh their weight, not a licence to delete`,
    );
  }
  const reliable = signals.filter((signal) => signal.firedOnEveryNeeded).map((signal) => signal.id);
  if (reliable.length > 0) {
    out.push(`${and(reliable)} fired on every change that needed a human — reliable so far`);
  }

  if (supportedThreshold === null) {
    out.push("no change has needed a human yet — the record cannot support a threshold move");
  } else if (supportedThreshold > currentThreshold) {
    out.push(
      `the record would support a review threshold up to ${supportedThreshold} (now ${currentThreshold}) — only a human may raise it`,
    );
  } else if (supportedThreshold < currentThreshold) {
    out.push(
      `a change that needed a human scored ${supportedThreshold}, below the threshold of ${currentThreshold} — the floor would miss it; only a human may lower the threshold`,
    );
  } else {
    out.push(`the threshold of ${currentThreshold} matches the record — no move indicated`);
  }
  return out;
}

async function readEntries(root: string): Promise<CalibrationEntry[]> {
  let raw: string;
  try {
    raw = await readFile(join(root, CALIBRATION_FILE), "utf8");
  } catch {
    return []; // no record yet: nothing has been calibrated.
  }

  const entries: CalibrationEntry[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    let entry: CalibrationEntry;
    try {
      entry = JSON.parse(line) as CalibrationEntry;
    } catch (err) {
      throw new Error(`${CALIBRATION_FILE}:${i + 1} is not valid JSON: ${messageOf(err)}`);
    }
    assertEntry(entry, i + 1);
    entries.push(entry);
  }
  return entries;
}

// A malformed entry must fail loudly, naming the line — a silently-dropped entry is dishonest
// calibration data, the one thing ADR-0042 will not tolerate in the record.
function assertEntry(entry: CalibrationEntry, line: number): void {
  const at = `${CALIBRATION_FILE}:${line}`;
  const isNumber = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
  if (!isNumber(entry.score) || !isNumber(entry.threshold)) {
    throw new Error(`${at}: "score" and "threshold" must be numbers`);
  }
  if (typeof entry.humanRequired !== "boolean" || typeof entry.escalated !== "boolean") {
    throw new Error(`${at}: "humanRequired" and "escalated" must be booleans`);
  }
  if (!Array.isArray(entry.signals) || entry.signals.some((id) => typeof id !== "string")) {
    throw new Error(`${at}: "signals" must be an array of signal ids`);
  }
  const verdict = entry.verdict as unknown;
  const fields = verdict as Partial<HumanVerdict>;
  if (
    typeof verdict !== "object" ||
    verdict === null ||
    typeof fields.neededHuman !== "boolean" ||
    typeof fields.foundReal !== "boolean"
  ) {
    throw new Error(`${at}: "verdict" needs boolean "neededHuman" and "foundReal"`);
  }
}

function and(ids: string[]): string {
  return ids.length <= 1 ? (ids[0] ?? "") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
}
