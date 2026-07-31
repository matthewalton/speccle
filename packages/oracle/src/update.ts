import { resolve } from "node:path";
import { initConfig, readConfig } from "./config.ts";
import { doctor, type DepCheck, type StackStatus } from "./doctor.ts";
import { materializeLenses, type LensResult, type PlanLensesScaffoldReport } from "./lenses.ts";
import { detectPackageManager, installCommandFor } from "./packagemanager.ts";
import { scaffoldReviewWorkflow } from "./reviewinit.ts";
import { materializeSkills, type SkillResult } from "./skills.ts";
import { scaffoldChecks } from "./verify.ts";

/** The global-install one-liner. npm is the portable choice: it ships with Node. */
const BINARY_UPDATE = "npm install -g speccle@latest";

/** The JSON contract of `speccle update --json`. */
export interface UpdateReport {
  root: string;
  cli: {
    version: string;
    /** The command to run to replace the global binary — printed, never executed. */
    command: string;
  };
  skills: {
    /** The version recorded before this run, or null when the repo was unstamped. */
    from: string | null;
    /** The version now stamped — the installed CLI's. */
    to: string;
    dir: string;
    skills: SkillResult[];
  };
  lenses: {
    /** The version recorded before this run, or null when lenses were never vendored here. */
    from: string | null;
    /** The version now stamped — the installed CLI's. */
    to: string;
    dir: string;
    lenses: LensResult[];
  };
  /**
   * Unversioned like `checks`, and scaffolded on the same terms — a repo initialized before the
   * plan surface existed would otherwise be told by `doctor` to run a command that never
   * creates it. It rides `materializeLenses`, which owns the directory it sits in.
   */
  plan: PlanLensesScaffoldReport;
  /**
   * Unversioned, so there is no from/to: the scaffold is only ever placed when missing. It runs
   * here at all because a repo initialized before the surface existed would otherwise be told by
   * `doctor` to run a command that never creates it.
   */
  checks: {
    dir: string;
    /** `written` — the scaffold was missing and was placed. `kept` — already there. */
    action: "written" | "kept";
    authored: number;
  };
  driver: {
    /** The version the workflow pinned before this run, or null when there is no workflow. */
    from: string | null;
    /** The version it pins now, or null when there was no workflow to refresh. */
    to: string | null;
  };
  stack: {
    status: StackStatus;
    deps: DepCheck[];
    /** The install command that would bring behind/missing deps to the preset, or null. */
    fixCommand: string | null;
  };
}

/**
 * Brings a Speccle consumer current (#182). Only the per-repo halves are touched, and only
 * as a reviewable diff: the skills and the baseline lenses are re-materialized from the
 * bundled copy and both anchors re-stamped — the house-conventions lens the repo authored is
 * left alone — while the strength stack and global binary are reported, never rewritten: the
 * ticket's principle that only the binary may update silently, and it does so through the
 * printed command, not through this deterministic tool.
 *
 * The CI driver moves only if it is already there (#187): the workflow spends a metered API
 * key per run, so scaffolding one into a repo that never asked would be opting it in silently.
 */
export async function update(target: string): Promise<UpdateReport> {
  const root = resolve(target);
  const diagnosis = await doctor(root); // validates the path, captures the pre-update state
  if ((await readConfig(root)) === undefined) {
    throw new Error("not initialized — run `speccle init` first");
  }

  const version = diagnosis.cli;
  const materializedSkills = await materializeSkills(root);
  const materializedLenses = await materializeLenses(root);
  const scaffoldedChecks = await scaffoldChecks(root);
  await initConfig(root, version); // re-stamp both anchors; the repo facts stay kept

  const hasDriver = diagnosis.driver.status !== "absent";
  if (hasDriver) await scaffoldReviewWorkflow(root, version);

  const outstanding = diagnosis.stack.deps.filter((dep) => dep.status !== "ok");
  const fixCommand =
    diagnosis.stack.status === "drift"
      ? installCommandFor(
          await detectPackageManager(root),
          outstanding.map((dep) => `${dep.name}@^${dep.wantedMajor}`),
        )
      : null;

  return {
    root,
    cli: { version, command: BINARY_UPDATE },
    skills: {
      from: diagnosis.skills.recorded,
      to: version,
      dir: materializedSkills.dir,
      skills: materializedSkills.skills,
    },
    lenses: {
      from: diagnosis.lenses.recorded,
      to: version,
      dir: materializedLenses.dir,
      lenses: materializedLenses.lenses,
    },
    plan: materializedLenses.plan,
    checks: {
      dir: scaffoldedChecks.dir,
      action: scaffoldedChecks.action,
      authored: scaffoldedChecks.authored,
    },
    driver: { from: diagnosis.driver.recorded, to: hasDriver ? version : null },
    stack: { status: diagnosis.stack.status, deps: diagnosis.stack.deps, fixCommand },
  };
}
