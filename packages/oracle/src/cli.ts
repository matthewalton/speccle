#!/usr/bin/env node
import { calibrationReport, recordCalibration } from "./calibration.ts";
import { check } from "./check.ts";
import { claims } from "./claims.ts";
import { initConfig } from "./config.ts";
import { DEFAULT_DIALECT, DIALECT_NAMES } from "./dialects.ts";
import { doctor } from "./doctor.ts";
import { detectDoubleLoad, init, ownVersion } from "./init.ts";
import { materializeLenses } from "./lenses.ts";
import { lint } from "./lint.ts";
import { next } from "./next.ts";
import { recallRemedy, recordRemedy, REMEDY_ROUTES, type RemedyRoute } from "./remedy.ts";
import {
  renderCalibrateRecord,
  renderCalibrateReport,
  renderCheck,
  renderClaims,
  renderConfigInit,
  renderDoctor,
  renderDoubleLoad,
  renderHuman,
  renderInit,
  renderLensesInit,
  renderNext,
  renderRemedyRecall,
  renderRemedyRecord,
  renderReviewFindings,
  renderReviewInit,
  renderReviewRun,
  renderRisk,
  renderSkillsInit,
  renderStrength,
  renderUpdate,
  renderVerify,
} from "./render.ts";
import { reviewFindings } from "./reviewfindings.ts";
import { scaffoldReviewWorkflow } from "./reviewinit.ts";
import { reviewRun } from "./reviewrun.ts";
import { risk } from "./risk.ts";
import { materializeSkills } from "./skills.ts";
import { DEFAULT_COVERAGE_SUMMARY, DEFAULT_MUTATION_REPORT, strength } from "./strength.ts";
import { update } from "./update.ts";
import { verify } from "./verify.ts";

const USAGE = `Usage: speccle <command> [options]

Commands:
  init [path] [--json]           Record repo facts in .speccle/config.json, materialize the
                                 skills into .claude/skills/ and the lenses into .speccle/lenses/
  doctor [path] [--json]         Report staleness across the CLI, skills, lenses, the CI driver's
                                 pin, and the strength stack
  update [path] [--json]         Refresh the skills and lenses as a diff, and an already-installed
                                 CI driver's pin; report stack and binary fixes
  lint [path] [--json]           Lint every SPEC.md under path (default: current directory)
  claims [path] [--json]         Join criteria to the test names that claim them — no reports needed
  next [path] [--json]           Derive the pipeline's stage from the folder: which slice, which
                                 criterion. Runs no test suite, and never routes to plan or review
  verify [path] [--json]         Run .speccle/checks/ against the change set: cross-file invariants
  risk [path] [--json]           Score the change set from spec-aware signals; gate on the review threshold
  calibrate record [path]        Append a calibration entry: the risk floor + your honest verdict
  calibrate report [path]        Read the calibration record: signal reliability + the supported threshold
  remedy record [path]           Record a remedy: the finding, the fix, and the prevention artefact
  remedy recall [path]           Recall the known remedy for a finding's class — fix consistently
  review init [path] [--json]    Scaffold the opt-in CI driver: a GitHub Actions workflow, pinned
  review run [path]              Review a pull request with the lens panel and post one review.
                                 The one command here that calls a model — needs a metered key
  review findings [path]         Read back the findings the CI driver posted on a pull request,
                                 so the local driver fixes those instead of re-running the panel
  strength [path] [--json]       Oracle-strength heatmap: per-criterion killed ÷ covered
  strength init [path] [--json]  Provision the strength stack: devDependencies + configs
  --version, -v                  Print the installed CLI version

claims / next / risk options:
  --dialect <name>    Test dialect: ${DIALECT_NAMES.join(", ")} (default: ${DEFAULT_DIALECT})

verify / risk / calibrate record options:
  --base <ref>        Read the change set from the commits between <ref> and HEAD, instead of the
                      working tree's pending change — what a CI driver needs, where the tree is
                      clean. Measured from the merge base, so it needs their shared history

risk exit codes: 0 below the review threshold (review may fix), 1 at or above it (human required)

calibrate record options:
  --needed-human <true|false>  Did this change actually need a human? (required — the honest verdict)
  --found-real <true|false>    Did the review find something real? (required)
  --escalated                  A risk lens escalated beyond the deterministic floor
  --floor <score>              The floor the review gated on; refuses to write when re-measuring
                               disagrees, rather than recording a change nobody reviewed
  --note <text>                Free-text context for the entry
  --dialect <name>             Test dialect: ${DIALECT_NAMES.join(", ")} (default: ${DEFAULT_DIALECT})

remedy record options:
  --class <handle>             Short, stable handle for the finding's class (required — the recall key)
  --finding <text>             What the finding is (required)
  --fix <text>                 The fix applied to the code (required)
  --route <route>              Prevention route: ${REMEDY_ROUTES.join(", ")} (required)
  --artefact <ref>             The prevention artefact: a .speccle/checks|lenses path or a SPEC
                               criterion id (required for every route but none)
  --note <text>                Free-text context for the entry

remedy recall options:
  --class <handle>             The finding's class to look up (required)

review run options:
  --pr <number>                The pull request to review (required)
  --repo <owner/name>          Defaults to GITHUB_REPOSITORY
  --base <ref>                 Base ref for the risk verdict (default: origin/<the PR's base>)
  --force                      Review again even if this driver already reviewed the PR
  --model <id>                 Overrides SPECCLE_REVIEW_MODEL
  --dry-run                    Report what would be posted, and post nothing
  Reads ANTHROPIC_API_KEY and GITHUB_TOKEN from the environment

review findings options:
  --pr <number>                The pull request whose review to read (required)
  --repo <owner/name>          Defaults to GITHUB_REPOSITORY, then the \`origin\` remote
  Calls no model. Reads GITHUB_TOKEN, or falls back to \`gh auth token\`

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
  if (command === "next") return runNext(rest);
  if (command === "verify") return runVerify(rest);
  if (command === "risk") return runRisk(rest);
  if (command === "calibrate" && rest[0] === "record") return runCalibrateRecord(rest.slice(1));
  if (command === "calibrate" && rest[0] === "report") return runCalibrateReport(rest.slice(1));
  if (command === "calibrate") {
    console.error(`calibrate needs a subcommand: record or report\n\n${USAGE}`);
    return 2;
  }
  if (command === "remedy" && rest[0] === "record") return runRemedyRecord(rest.slice(1));
  if (command === "remedy" && rest[0] === "recall") return runRemedyRecall(rest.slice(1));
  if (command === "remedy") {
    console.error(`remedy needs a subcommand: record or recall\n\n${USAGE}`);
    return 2;
  }
  if (command === "review" && rest[0] === "init") return runReviewInit(rest.slice(1));
  if (command === "review" && rest[0] === "run") return runReviewRun(rest.slice(1));
  if (command === "review" && rest[0] === "findings") return runReviewFindings(rest.slice(1));
  if (command === "review") {
    console.error(`review needs a subcommand: init, run, or findings\n\n${USAGE}`);
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

async function runNext(args: string[]): Promise<number> {
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
    console.error(`next takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await next(positional[0] ?? ".", { ...(dialect !== undefined && { dialect }) });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderNext(report));
  // A stage is what this command is for, so reporting one is success. Work remaining is not a
  // failure — every skill that shells out here would read a non-zero exit as one.
  return 0;
}

async function runVerify(args: string[]): Promise<number> {
  let json = false;
  let base: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--base") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`--base needs a git ref\n\n${USAGE}`);
        return 2;
      }
      base = value;
    } else if (arg.startsWith("-")) {
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
    report = await verify(positional[0] ?? ".", { ...(base !== undefined && { base }) });
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
  let base: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--dialect" || arg === "--base") {
      const value = args[++i];
      if (value === undefined) {
        console.error(
          `${arg} needs ${arg === "--base" ? "a git ref" : "a dialect name"}\n\n${USAGE}`,
        );
        return 2;
      }
      if (arg === "--dialect") dialect = value;
      else base = value;
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
    report = await risk(positional[0] ?? ".", {
      ...(dialect !== undefined && { dialect }),
      ...(base !== undefined && { base }),
    });
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
  let base: string | undefined;
  let floor: number | undefined;
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
    } else if (arg === "--floor") {
      const value = Number(args[++i]);
      if (!Number.isFinite(value)) {
        console.error(`--floor needs the risk score the review gated on\n\n${USAGE}`);
        return 2;
      }
      floor = value;
    } else if (arg === "--note" || arg === "--dialect" || arg === "--base") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`${arg} needs a value\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--note") note = value;
      else if (arg === "--base") base = value;
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
      {
        neededHuman,
        foundReal,
        escalated,
        ...(floor !== undefined && { floor }),
        ...(note !== undefined && { note }),
      },
      { ...(dialect !== undefined && { dialect }), ...(base !== undefined && { base }) },
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

async function runRemedyRecord(args: string[]): Promise<number> {
  let json = false;
  let classHandle: string | undefined;
  let finding: string | undefined;
  let fix: string | undefined;
  let route: string | undefined;
  let artefact: string | undefined;
  let note: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (
      arg === "--class" ||
      arg === "--finding" ||
      arg === "--fix" ||
      arg === "--route" ||
      arg === "--artefact" ||
      arg === "--note"
    ) {
      const value = args[++i];
      if (value === undefined) {
        console.error(`${arg} needs a value\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--class") classHandle = value;
      else if (arg === "--finding") finding = value;
      else if (arg === "--fix") fix = value;
      else if (arg === "--route") route = value;
      else if (arg === "--artefact") artefact = value;
      else note = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`remedy record takes at most one path\n\n${USAGE}`);
    return 2;
  }
  if (
    classHandle === undefined ||
    finding === undefined ||
    fix === undefined ||
    route === undefined
  ) {
    console.error(`remedy record needs --class, --finding, --fix, and --route\n\n${USAGE}`);
    return 2;
  }
  if (!REMEDY_ROUTES.includes(route as RemedyRoute)) {
    console.error(`--route must be one of ${REMEDY_ROUTES.join(", ")}\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await recordRemedy(positional[0] ?? ".", {
      class: classHandle,
      finding,
      fix,
      route: route as RemedyRoute,
      ...(artefact !== undefined && { artefact }),
      ...(note !== undefined && { note }),
    });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderRemedyRecord(report));
  return 0;
}

async function runRemedyRecall(args: string[]): Promise<number> {
  let json = false;
  let classHandle: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--class") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`--class needs a value\n\n${USAGE}`);
        return 2;
      }
      classHandle = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`remedy recall takes at most one path\n\n${USAGE}`);
    return 2;
  }
  if (classHandle === undefined) {
    console.error(`remedy recall needs --class\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await recallRemedy(positional[0] ?? ".", classHandle);
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderRemedyRecall(report));
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
  let doubleLoad;
  try {
    // Materialize first, then stamp the version onto the config — so the recorded anchors
    // only ever name the skills and lenses that actually landed on disk.
    skills = await materializeSkills(root);
    lenses = await materializeLenses(root);
    config = await initConfig(root, await ownVersion());
    // Asked after materializing: this run is what makes the repo a project-level vendor, so
    // the double-load it may have just created is exactly what the human needs told (#183).
    doubleLoad = await detectDoubleLoad(root);
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  if (json) {
    console.log(JSON.stringify({ config, skills, lenses, doubleLoad }, null, 2));
  } else {
    console.log(renderConfigInit(config));
    console.log("");
    console.log(renderSkillsInit(skills));
    console.log("");
    console.log(renderLensesInit(lenses));
    if (doubleLoad) {
      console.log("");
      console.log(renderDoubleLoad());
    }
  }
  return 0;
}

async function runReviewInit(args: string[]): Promise<number> {
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
    console.error(`review init takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await scaffoldReviewWorkflow(positional[0] ?? ".");
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderReviewInit(report));
  return 0;
}

async function runReviewRun(args: string[]): Promise<number> {
  let json = false;
  let force = false;
  let dryRun = false;
  let pr: number | undefined;
  let repo: string | undefined;
  let base: string | undefined;
  let model: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--force") force = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--pr" || arg === "--repo" || arg === "--base" || arg === "--model") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`${arg} needs a value\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--pr") {
        const number = Number(value);
        if (!Number.isInteger(number) || number <= 0) {
          console.error(`--pr needs a pull request number\n\n${USAGE}`);
          return 2;
        }
        pr = number;
      } else if (arg === "--repo") repo = value;
      else if (arg === "--base") base = value;
      else model = value;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`review run takes at most one path\n\n${USAGE}`);
    return 2;
  }
  if (pr === undefined) {
    console.error(`review run needs --pr\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await reviewRun(positional[0] ?? ".", {
      pr,
      force,
      dryRun,
      ...(repo !== undefined && { repo }),
      ...(base !== undefined && { base }),
      ...(model !== undefined && { model }),
    });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderReviewRun(report));
  // Posting findings is not a failure: the risk gate is the check, and it runs as its own step.
  return 0;
}

async function runReviewFindings(args: string[]): Promise<number> {
  let json = false;
  let pr: number | undefined;
  let repo: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--pr" || arg === "--repo") {
      const value = args[++i];
      if (value === undefined) {
        console.error(`${arg} needs a value\n\n${USAGE}`);
        return 2;
      }
      if (arg === "--repo") repo = value;
      else {
        const number = Number(value);
        if (!Number.isInteger(number) || number <= 0) {
          console.error(`--pr needs a pull request number\n\n${USAGE}`);
          return 2;
        }
        pr = number;
      }
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`review findings takes at most one path\n\n${USAGE}`);
    return 2;
  }
  if (pr === undefined) {
    console.error(`review findings needs --pr\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await reviewFindings(positional[0] ?? ".", {
      pr,
      ...(repo !== undefined && { repo }),
    });
  } catch (err) {
    console.error(message(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderReviewFindings(report));
  // Findings are what this command is for, so reporting them is success. The gate is `risk`.
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
