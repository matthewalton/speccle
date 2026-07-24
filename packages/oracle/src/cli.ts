#!/usr/bin/env node
import { calibrationReport, recordCalibration } from "./calibration.ts";
import { check } from "./check.ts";
import { claims } from "./claims.ts";
import { initConfig } from "./config.ts";
import { DEFAULT_DIALECT, DIALECT_NAMES } from "./dialects.ts";
import { doctor } from "./doctor.ts";
import { init, ownVersion } from "./init.ts";
import { materializeLenses } from "./lenses.ts";
import { lint } from "./lint.ts";
import {
  renderCalibrateRecord,
  renderCalibrateReport,
  renderCheck,
  renderClaims,
  renderConfigInit,
  renderDoctor,
  renderHuman,
  renderInit,
  renderLensesInit,
  renderRisk,
  renderSkillsInit,
  renderStrength,
  renderUpdate,
  renderVerify,
} from "./render.ts";
import { risk } from "./risk.ts";
import { materializeSkills } from "./skills.ts";
import { DEFAULT_COVERAGE_SUMMARY, DEFAULT_MUTATION_REPORT, strength } from "./strength.ts";
import { update } from "./update.ts";
import { verify } from "./verify.ts";

const USAGE = `Usage: speccle <command> [options]

Commands:
  init [path] [--json]           Record repo facts in .speccle/config.json, materialize the
                                 skills into .claude/skills/ and the lenses into .speccle/lenses/
  doctor [path] [--json]         Report staleness across the CLI, skills, lenses, and strength stack
  update [path] [--json]         Refresh the skills and lenses as a diff; report stack and binary fixes
  lint [path] [--json]           Lint every SPEC.md under path (default: current directory)
  claims [path] [--json]         Join criteria to the test names that claim them — no reports needed
  verify [path] [--json]         Run .speccle/checks/ against the change set: cross-file invariants
  risk [path] [--json]           Score the change set from spec-aware signals; gate on the review threshold
  calibrate record [path]        Append a calibration entry: the risk floor + your honest verdict
  calibrate report [path]        Read the calibration record: signal reliability + the supported threshold
  strength [path] [--json]       Oracle-strength heatmap: per-criterion killed ÷ covered
  strength init [path] [--json]  Provision the strength stack: devDependencies + configs
  --version, -v                  Print the installed CLI version

claims / risk options:
  --dialect <name>    Test dialect: ${DIALECT_NAMES.join(", ")} (default: ${DEFAULT_DIALECT})

risk exit codes: 0 below the review threshold (review may fix), 1 at or above it (human required)

calibrate record options:
  --needed-human <true|false>  Did this change actually need a human? (required — the honest verdict)
  --found-real <true|false>    Did the review find something real? (required)
  --escalated                  A risk lens escalated beyond the deterministic floor
  --note <text>                Free-text context for the entry
  --dialect <name>             Test dialect: ${DIALECT_NAMES.join(", ")} (default: ${DEFAULT_DIALECT})

strength options:
  --check             Report whether the reports are fresh, stale, or missing — never runs them
  --mutation <file>   Stryker JSON report   (default: ${DEFAULT_MUTATION_REPORT})
  --coverage <file>   Istanbul json-summary (default: ${DEFAULT_COVERAGE_SUMMARY})

strength init options:
  --mutate <glob>     Mutate glob for the Stryker config, repeatable
                      (default: derived from the SPEC.md folders under path)
  --skip-install      Report the install command instead of running it

Exit codes: 0 clean, 1 violations, 2 usage error`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "--version" || command === "-v") {
    console.log(await ownVersion());
    return 0;
  }
  if (command === "init") return runInit(rest);
  if (command === "doctor") return runDoctor(rest);
  if (command === "update") return runUpdate(rest);
  if (command === "lint") return runLint(rest);
  if (command === "claims") return runClaims(rest);
  if (command === "verify") return runVerify(rest);
  if (command === "risk") return runRisk(rest);
  if (command === "calibrate" && rest[0] === "record") return runCalibrateRecord(rest.slice(1));
  if (command === "calibrate" && rest[0] === "report") return runCalibrateReport(rest.slice(1));
  if (command === "calibrate") {
    console.error(`calibrate needs a subcommand: record or report\n\n${USAGE}`);
    return 2;
  }
  if (command === "strength" && rest[0] === "init") return runStrengthInit(rest.slice(1));
  if (command === "strength") return runStrength(rest);
  console.error(USAGE);
  return 2;
}

async function runClaims(args: string[]): Promise<number> {
  let json = false;
  let dialect: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--dialect") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`--dialect needs a dialect name\n\n${USAGE}`);
        return 2;
      }
      dialect = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`claims takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await claims(positional[0] ?? ".", { ...(dialect !== undefined && { dialect }) });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderClaims(report));
  return report.clean ? 0 : 1;
}

async function runVerify(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`verify takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await verify(positional[0] ?? ".");
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderVerify(report));
  return report.clean ? 0 : 1;
}

async function runRisk(args: string[]): Promise<number> {
  let json = false;
  let dialect: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--dialect") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`--dialect needs a dialect name\n\n${USAGE}`);
        return 2;
      }
      dialect = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`risk takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await risk(positional[0] ?? ".", { ...(dialect !== undefined && { dialect }) });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderRisk(report));
  return report.humanRequired ? 1 : 0;
}

async function runCalibrateRecord(args: string[]): Promise<number> {
  let json = false;
  let dialect: string | undefined;
  let neededHuman: boolean | undefined;
  let foundReal: boolean | undefined;
  let escalated = false;
  let note: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--escalated") escalated = true;
    else if (arg === "--needed-human" || arg === "--found-real") {
      const value = args[++i];
      if (value !== "true" && value !== "false") {
        console.error(`${arg} needs true or false\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--needed-human") neededHuman = value === "true";
      else foundReal = value === "true";
    } else if (arg === "--note" || arg === "--dialect") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`${arg} needs a value\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--note") note = value;
      else dialect = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`calibrate record takes at most one path\n\n${USAGE}`);
    return 2;
  }
  // The honest verdict is required, never defaulted — a fabricated verdict is the dishonest
  // calibration data ADR-0042 exists to keep out of the record.
  if (neededHuman === undefined || foundReal === undefined) {
    console.error(`calibrate record needs --needed-human and --found-real\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await recordCalibration(
      positional[0] ?? ".",
      { neededHuman, foundReal, escalated, ...(note !== undefined && { note }) },
      { ...(dialect !== undefined && { dialect }) },
    );
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderCalibrateRecord(report));
  return 0;
}

async function runCalibrateReport(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`calibrate report takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await calibrationReport(positional[0] ?? ".");
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderCalibrateReport(report));
  return 0;
}

async function runDoctor(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`doctor takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await doctor(positional[0] ?? ".");
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderDoctor(report));
  return report.ok ? 0 : 1;
}

async function runUpdate(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`update takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await update(positional[0] ?? ".");
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderUpdate(report));
  return 0;
}

async function runLint(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`lint takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await lint(positional[0] ?? ".");
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderHuman(report));
  return report.clean ? 0 : 1;
}

async function runStrength(args: string[]): Promise<number> {
  let json = false;
  let checkOnly = false;
  let mutationReport: string | undefined;
  let coverageSummary: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--check") checkOnly = true;
    else if (arg === "--mutation" || arg === "--coverage") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`${arg} needs a file path\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--mutation") mutationReport = value;
      else coverageSummary = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`strength takes at most one path\n\n${USAGE}`);
    return 2;
  }

  const options = {
    ...(mutationReport !== undefined && { mutationReport }),
    ...(coverageSummary !== undefined && { coverageSummary }),
  };

  if (checkOnly) {
    let checkReport;
    try {
      checkReport = await check(positional[0] ?? ".", options);
    } catch (err) {
      console.error(message(err));
      return 2;
    }
    console.log(json ? JSON.stringify(checkReport, null, 2) : renderCheck(checkReport));
    return checkReport.mutation.status === "fresh" && checkReport.coverage.status === "fresh"
      ? 0
      : 1;
  }

  let report;
  try {
    report = await strength(positional[0] ?? ".", options);
  } catch (err) {
    console.error(message(err));
    return 2;
  }

  const color = process.stdout.isTTY && process.env.NO_COLOR === undefined;
  console.log(json ? JSON.stringify(report, null, 2) : renderStrength(report, color));
  return 0;
}

async function runInit(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`init takes at most one path\n\n${USAGE}`);
    return 2;
  }

  const root = positional[0] ?? ".";
  let config;
  let skills;
  let lenses;
  try {
    // Materialize first, then stamp the version onto the config — so the recorded anchors
    // only ever name the skills and lenses that actually landed on disk.
    skills = await materializeSkills(root);
    lenses = await materializeLenses(root);
    config = await initConfig(root, await ownVersion());
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  if (json) {
    console.log(JSON.stringify({ config, skills, lenses }, null, 2));
  } else {
    console.log(renderConfigInit(config));
    console.log("");
    console.log(renderSkillsInit(skills));
    console.log("");
    console.log(renderLensesInit(lenses));
  }
  return 0;
}

async function runStrengthInit(args: string[]): Promise<number> {
  let json = false;
  let skipInstall = false;
  const mutate: string[] = [];
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--skip-install") skipInstall = true;
    else if (arg === "--mutate") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`--mutate needs a glob\n\n${USAGE}`);
        return 2;
      }
      mutate.push(value);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`strength init takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await init(positional[0] ?? ".", { mutate, skipInstall });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderInit(report));
  return 0;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

process.exitCode = await main(process.argv.slice(2));
