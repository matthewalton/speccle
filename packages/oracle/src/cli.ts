#!/usr/bin/env node
import { check } from "./check.ts";
import { claims } from "./claims.ts";
import { initConfig } from "./config.ts";
import { DEFAULT_DIALECT, DIALECT_NAMES } from "./dialects.ts";
import { doctor } from "./doctor.ts";
import { init, ownVersion } from "./init.ts";
import { lint } from "./lint.ts";
import {
  renderCheck,
  renderClaims,
  renderConfigInit,
  renderDoctor,
  renderHuman,
  renderInit,
  renderSkillsInit,
  renderStrength,
  renderUpdate,
} from "./render.ts";
import { materializeSkills } from "./skills.ts";
import { DEFAULT_COVERAGE_SUMMARY, DEFAULT_MUTATION_REPORT, strength } from "./strength.ts";
import { update } from "./update.ts";

const USAGE = `Usage: speccle <command> [options]

Commands:
  init [path] [--json]           Record repo facts in .speccle/config.json and materialize
                                 the skills into .claude/skills/
  doctor [path] [--json]         Report staleness across the CLI, skills, and strength stack
  update [path] [--json]         Refresh the skills as a diff; report the stack and binary fixes
  lint [path] [--json]           Lint every SPEC.md under path (default: current directory)
  claims [path] [--json]         Join criteria to the test names that claim them — no reports needed
  strength [path] [--json]       Oracle-strength heatmap: per-criterion killed ÷ covered
  strength init [path] [--json]  Provision the strength stack: devDependencies + configs
  --version, -v                  Print the installed CLI version

claims options:
  --dialect <name>    Test dialect: ${DIALECT_NAMES.join(", ")} (default: ${DEFAULT_DIALECT})

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
  try {
    // Materialize first, then stamp the version onto the config — so the recorded anchor
    // only ever names skills that actually landed on disk.
    skills = await materializeSkills(root);
    config = await initConfig(root, await ownVersion());
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  if (json) {
    console.log(JSON.stringify({ config, skills }, null, 2));
  } else {
    console.log(renderConfigInit(config));
    console.log("");
    console.log(renderSkillsInit(skills));
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
