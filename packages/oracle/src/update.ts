import { resolve } from "node:path";
import { initConfig, readConfig } from "./config.ts";
import { doctor, type DepCheck, type StackStatus } from "./doctor.ts";
import { detectPackageManager, installCommandFor } from "./init.ts";
import { materializeSkills, type SkillResult } from "./skills.ts";

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
  stack: {
    status: StackStatus;
    deps: DepCheck[];
    /** The install command that would bring behind/missing deps to the preset, or null. */
    fixCommand: string | null;
  };
}

/**
 * Brings a Speccle consumer current (#182). Only the per-repo halves are touched, and only
 * as a reviewable diff: the skills are re-materialized from the bundled copy and the anchor
 * re-stamped, while the strength stack and global binary are reported, never rewritten — the
 * ticket's principle that only the binary may update silently, and it does so through the
 * printed command, not through this deterministic tool.
 */
export async function update(target: string): Promise<UpdateReport> {
  const root = resolve(target);
  const diagnosis = await doctor(root); // validates the path, captures the pre-update state
  if ((await readConfig(root)) === undefined) {
    throw new Error("not initialized — run `speccle init` first");
  }

  const version = diagnosis.cli;
  const materialized = await materializeSkills(root);
  await initConfig(root, version); // re-stamp the anchor; the repo facts stay kept

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
      dir: materialized.dir,
      skills: materialized.skills,
    },
    stack: { status: diagnosis.stack.status, deps: diagnosis.stack.deps, fixCommand },
  };
}
