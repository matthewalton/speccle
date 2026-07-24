import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDirectory, messageOf } from "./changeset.ts";

/** Where the meta loop keeps its remedy record (ADR-0043): append-only, one entry per line. */
export const REMEDY_FILE = ".speccle/remedies.jsonl";

/**
 * The prevention routes the remedy record owns — ADR-0043's routing table minus its risk-weight
 * row, which is the calibration record's ({@link ./calibration.ts}, ADR-0042). `none` is the honest
 * one-off: a finding whose class is not worth preventing, so it names no artefact.
 */
export const REMEDY_ROUTES = ["check", "criterion", "lens", "none"] as const;
export type RemedyRoute = (typeof REMEDY_ROUTES)[number];

/** Where each route's prevention artefact lives — named in the error when one is missing. */
const ARTEFACT_HOME: Record<Exclude<RemedyRoute, "none">, string> = {
  check: "a .speccle/checks/ path",
  criterion: "a SPEC.md criterion id",
  lens: "a .speccle/lenses/ path",
};

/** One remedy in the record: a finding, the fix applied to it, and the prevention artefact chosen. */
export interface RemedyEntry {
  /** ISO-8601 stamp; ordering and recency, never part of the matching. */
  at: string;
  /**
   * A short, stable handle for the finding's class — the key recall matches on. The reviewer
   * supplies it (the judgement); the tool only stores and retrieves it — the same honesty split
   * calibrate draws around the human verdict (ADR-0043/0042).
   */
  class: string;
  /** What the finding is, in the reviewer's words. */
  finding: string;
  /** The fix applied to the code this time. */
  fix: string;
  /** The prevention route chosen (ADR-0043). */
  route: RemedyRoute;
  /**
   * The prevention artefact the route names: a `.speccle/checks/*` path, a SPEC.md criterion id,
   * or a `.speccle/lenses/*` path. Present for every route but `none` — a one-off prevents nothing.
   */
  artefact?: string;
  /** Free-text context for the entry. */
  note?: string;
}

/** The finding and routing a caller supplies; the stamp is the tool's. */
export interface RemedyInput {
  class: string;
  finding: string;
  fix: string;
  route: RemedyRoute;
  artefact?: string;
  note?: string;
}

export interface RecordOptions {
  /** Injectable clock for a deterministic stamp in tests; defaults to the wall clock. */
  now?: () => string;
}

/** The JSON contract of `speccle remedy record --json`. */
export interface RemedyRecordReport {
  root: string;
  /** Root-relative path of the record file. */
  file: string;
  entry: RemedyEntry;
  /** Total remedies in the record after this append. */
  count: number;
}

/**
 * Appends one remedy: the finding, the fix applied, and the prevention route with its artefact.
 * Every route but `none` must name its artefact — the record is only worth consulting if it points
 * at the prevention it chose; a `none` remedy names nothing, because a one-off prevents nothing.
 */
export async function recordRemedy(
  target: string,
  input: RemedyInput,
  options: RecordOptions = {},
): Promise<RemedyRecordReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const classHandle = input.class.trim();
  if (classHandle === "") throw new Error("a remedy needs a --class (the finding's class handle)");
  if (input.finding.trim() === "") throw new Error("a remedy needs a --finding");
  if (input.fix.trim() === "") throw new Error("a remedy needs a --fix");
  if (!REMEDY_ROUTES.includes(input.route)) {
    throw new Error(`unknown route "${input.route}": one of ${REMEDY_ROUTES.join(", ")}`);
  }

  const artefact = (input.artefact ?? "").trim();
  if (input.route === "none" && artefact !== "") {
    throw new Error("a none remedy prevents nothing — it names no --artefact");
  }
  if (input.route !== "none" && artefact === "") {
    throw new Error(`a ${input.route} remedy needs an --artefact (${ARTEFACT_HOME[input.route]})`);
  }

  const entry: RemedyEntry = {
    at: (options.now ?? (() => new Date().toISOString()))(),
    class: classHandle,
    finding: input.finding.trim(),
    fix: input.fix.trim(),
    route: input.route,
    ...(artefact !== "" && { artefact }),
    ...(input.note !== undefined && input.note.trim() !== "" && { note: input.note.trim() }),
  };

  const file = join(root, REMEDY_FILE);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(entry) + "\n");

  return { root, file: REMEDY_FILE, entry, count: (await readEntries(root)).length };
}

/** The JSON contract of `speccle remedy recall --json`. */
export interface RemedyRecallReport {
  root: string;
  file: string;
  /** The class handle queried. */
  query: string;
  /** Prior remedies for this class, most-recent first — the known-correct response to reuse. */
  matches: RemedyEntry[];
  /** Total remedies on record, matched or not. */
  count: number;
}

/**
 * Looks up the known-correct remedy for a finding's class so a repeat gets the same answer. Matches
 * deterministically on the class handle's tokens (lowercased alphanumeric runs): an entry matches
 * when one side's tokens are a subset of the other's, so `missing-roundtrip` still recalls
 * `missing-model-roundtrip-test`. Most-recent first — the latest answer to a class wins.
 */
export async function recallRemedy(target: string, query: string): Promise<RemedyRecallReport> {
  const root = resolve(target);
  if (!(await isDirectory(root))) throw new Error(`path not found: ${target}`);

  const entries = await readEntries(root);
  const wanted = classTokens(query);
  const matches =
    wanted.size === 0
      ? []
      : entries
          .filter((entry) => {
            const have = classTokens(entry.class);
            return have.size > 0 && (isSubset(wanted, have) || isSubset(have, wanted));
          })
          .reverse();

  return { root, file: REMEDY_FILE, query, matches, count: entries.length };
}

/** A class handle's comparison tokens: lowercased alphanumeric runs, e.g. `model`, `roundtrip`. */
function classTokens(handle: string): Set<string> {
  return new Set(
    handle
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) if (!b.has(token)) return false;
  return true;
}

async function readEntries(root: string): Promise<RemedyEntry[]> {
  let raw: string;
  try {
    raw = await readFile(join(root, REMEDY_FILE), "utf8");
  } catch {
    return []; // no record yet: nothing has been remedied.
  }

  const entries: RemedyEntry[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    let entry: RemedyEntry;
    try {
      entry = JSON.parse(line) as RemedyEntry;
    } catch (err) {
      throw new Error(`${REMEDY_FILE}:${i + 1} is not valid JSON: ${messageOf(err)}`);
    }
    assertEntry(entry, i + 1);
    entries.push(entry);
  }
  return entries;
}

// A malformed entry must fail loudly, naming the line — a silently-dropped remedy is a hole in the
// memory the meta loop consults to fix consistently, exactly what ADR-0043 keeps in one place.
function assertEntry(entry: RemedyEntry, line: number): void {
  const at = `${REMEDY_FILE}:${line}`;
  const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
  if (!nonEmpty(entry.class) || !nonEmpty(entry.finding) || !nonEmpty(entry.fix)) {
    throw new Error(`${at}: "class", "finding", and "fix" must be non-empty strings`);
  }
  if (!REMEDY_ROUTES.includes(entry.route)) {
    throw new Error(`${at}: "route" must be one of ${REMEDY_ROUTES.join(", ")}`);
  }
  if (entry.route === "none" ? entry.artefact !== undefined : !nonEmpty(entry.artefact)) {
    throw new Error(
      `${at}: a ${entry.route} remedy ${entry.route === "none" ? "names no" : "needs an"} "artefact"`,
    );
  }
}
