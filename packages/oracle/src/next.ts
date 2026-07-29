import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { claims, type ClaimsOptions } from "./claims.ts";
import { lint } from "./lint.ts";
import { compareCriterionIds } from "./spec.ts";
import type { Violation } from "./violation.ts";

/**
 * The stages a slice's folder can put it at. Never `plan`: before planning there is no folder to
 * read, so routing new-versus-amend stays with the plan. Never `review` either — review's unit is
 * the change set rather than the slice, so the derivation stops at `done` and the session points.
 */
export type Stage = "spec" | "stale-claims" | "implement" | "done";

export interface NextCriterion {
  id: string;
  statement: string;
  /** 1-based position in its spec, as the document reads. */
  order: number;
}

export interface SliceStage {
  /** Root-relative feature folder; `.` when the target itself is the slice. */
  folder: string;
  /** Root-relative `SPEC.md`; undefined when a plan made the folder but no spec landed in it. */
  spec: string | undefined;
  key: string | undefined;
  stage: Stage;
  /** What makes the spec stage unfinished — empty at every other stage. */
  violations: Violation[];
  /** The criterion an implement session takes: the first unclaimed one in document order. */
  criterion: NextCriterion | undefined;
  /** Every unclaimed criterion in document order; at the implement stage `criterion` is its head. */
  unclaimed: NextCriterion[];
  /** Ids this slice's test names claim that no criterion declares — cleared before any criterion. */
  staleClaims: string[];
  /**
   * No criterion here is claimed, so nothing is built yet and the session owes a tracer. Which
   * criterion traces the thinnest complete path is judgement, so the session picks it; the folder
   * only ever knows that one is owed.
   */
  tracerOwed: boolean;
}

/** The JSON contract of `speccle next --json`. */
export interface NextReport {
  root: string;
  /** Every slice under the target, in folder order. */
  slices: SliceStage[];
  /** The folders with work left. One means resume it; several mean the session asks which. */
  inFlight: string[];
  /**
   * The one answer: the in-flight slice's stage when exactly one slice is in flight, `done` when
   * every slice is finished. Undefined when several are in flight — there is no single answer, and
   * inventing one would pick a slice the session should be asked about.
   */
  stage: Stage | undefined;
  /** The folder `stage` belongs to; undefined when `stage` is `done` or several are in flight. */
  slice: string | undefined;
  /** Every slice under the target is done — the pipeline's terminal condition. */
  done: boolean;
}

export type NextOptions = ClaimsOptions;

export async function next(target: string, options: NextOptions = {}): Promise<NextReport> {
  const root = resolve(target);
  // Both checks read the same markdown and neither needs the other's answer, so they run together:
  // the pair costs about what one Node startup does, which is what makes deriving beat storing.
  const [lintReport, claimsReport] = await Promise.all([lint(target), claims(target, options)]);

  const folders = claimsReport.features.map((feature) => dirname(feature.spec));
  const staleByFolder = new Map<string, string[]>();
  for (const claim of claimsReport.unknownClaims) {
    for (const test of claim.tests) {
      // `unknownClaims` is reported across the whole target, but a stale claim is one slice's
      // problem — the slice whose folder holds the lying test.
      const owner = owningFolder(folders, test.file);
      if (owner === undefined) continue;
      const entry = staleByFolder.get(owner) ?? [];
      if (!entry.includes(claim.id)) entry.push(claim.id);
      staleByFolder.set(owner, entry);
    }
  }

  const slices: SliceStage[] = claimsReport.features.map((feature) => {
    const folder = dirname(feature.spec);
    const violations = lintReport.violations.filter((violation) => violation.file === feature.spec);
    const unclaimed = feature.criteria
      .filter((criterion) => !criterion.claimed)
      .sort((a, b) => a.order - b.order)
      .map(({ id, statement, order }) => ({ id, statement, order }));
    const staleClaims = (staleByFolder.get(folder) ?? []).sort(compareCriterionIds);
    // The derivation, in precedence order. A criterion-less spec is the spec stage too: it lints
    // clean and claims clean, and calling that done would have the one command that answers "is
    // this slice finished?" say yes about a slice that promises nothing.
    const stage: Stage =
      violations.length > 0 || feature.criteria.length === 0
        ? "spec"
        : staleClaims.length > 0
          ? "stale-claims"
          : unclaimed.length > 0
            ? "implement"
            : "done";
    return {
      folder,
      spec: feature.spec,
      key: feature.key,
      stage,
      violations,
      criterion: stage === "implement" ? unclaimed[0] : undefined,
      unclaimed,
      staleClaims,
      tracerOwed: !feature.criteria.some((criterion) => criterion.claimed),
    };
  });

  // A folder a plan created and no spec landed in. `decisions/` is the marker, because the
  // convention reserves it for a slice's own ADRs and a plan captures its first decision there
  // before any contract exists. Asked of the target only: with no spec and no decisions there is
  // no slice here to derive a stage from, and the session plans one rather than specifying nothing.
  if (slices.length === 0 && (await isDirectory(join(root, "decisions")))) {
    slices.push({
      folder: ".",
      spec: undefined,
      key: undefined,
      stage: "spec",
      violations: [],
      criterion: undefined,
      unclaimed: [],
      staleClaims: [],
      tracerOwed: true,
    });
  }

  const inFlight = slices.filter((slice) => slice.stage !== "done").map((slice) => slice.folder);
  const resume = inFlight.length === 1 ? slices.find((slice) => slice.stage !== "done") : undefined;
  const done = slices.length > 0 && inFlight.length === 0;
  return {
    root,
    slices,
    inFlight,
    stage: resume?.stage ?? (done ? "done" : undefined),
    slice: resume?.folder,
    done,
  };
}

/** The deepest slice folder holding `file` — the same most-specific-path rule the config resolves under. */
function owningFolder(folders: string[], file: string): string | undefined {
  let best: string | undefined;
  for (const folder of folders) {
    const within = folder === "." || file.startsWith(`${folder}/`);
    if (within && (best === undefined || folder.length > best.length)) best = folder;
  }
  return best;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
