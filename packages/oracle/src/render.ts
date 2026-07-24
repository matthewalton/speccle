import type { CheckReport, ReportCheck } from "./check.ts";
import type { ClaimsReport } from "./claims.ts";
import type { ConfigInitReport } from "./config.ts";
import type { DoctorReport } from "./doctor.ts";
import type { InitReport } from "./init.ts";
import type { LensesInitReport } from "./lenses.ts";
import type { SkillsInitReport } from "./skills.ts";
import type { UpdateReport } from "./update.ts";

export function renderConfigInit(report: ConfigInitReport): string {
  const lines = [
    report.action === "written"
      ? `wrote ${report.file}`
      : `kept ${report.file} — already present, left untouched`,
    `  dialect  ${report.config.dialect}`,
    `  suite    ${report.config.suite}`,
  ];
  for (const override of report.config.overrides ?? []) {
    const facts = [
      override.dialect !== undefined ? `dialect ${override.dialect}` : undefined,
      override.suite !== undefined ? `suite ${override.suite}` : undefined,
    ].filter((fact) => fact !== undefined);
    lines.push(`  ${override.path}: ${facts.join(", ")}`);
  }
  lines.push("");
  lines.push("these are facts about your repo, not judgement — edit .speccle/config.json by hand");
  if (report.config.dialect === "swift" && report.config.suite === "swift test") {
    lines.push("swift: set suite to your xcodebuild scheme if this is not a SwiftPM package");
  }
  return lines.join("\n");
}

export function renderSkillsInit(report: SkillsInitReport): string {
  const lines = [`materialized ${plural(report.skills.length, "skill")} into ${report.dir}/`];
  for (const { name, action } of report.skills) {
    lines.push(`  ${(action === "written" ? "wrote" : "refreshed").padEnd(9)} ${name}`);
  }
  lines.push("");
  lines.push("these are generated files — commit them; re-run `speccle init` to refresh");
  return lines.join("\n");
}

export function renderLensesInit(report: LensesInitReport): string {
  const lines = [`vendored ${plural(report.lenses.length, "lens", "lenses")} into ${report.dir}/`];
  for (const { name, action } of report.lenses) {
    const verb = action === "written" ? "wrote" : action;
    lines.push(`  ${verb.padEnd(9)} ${name}`);
  }
  lines.push("");
  lines.push(
    "the baseline lenses are Speccle's — refreshed each run; house-conventions.md is yours to author",
  );
  return lines.join("\n");
}

export function renderDoctor(report: DoctorReport): string {
  const lines = [
    `speccle ${report.cli}`,
    "",
    `skills   ${describePayload(report.skills, "materialized")}`,
    `lenses   ${describePayload(report.lenses, "vendored")}`,
    `stack    ${describeStack(report.stack)}`,
  ];
  if (report.stack.status === "drift") {
    const width = Math.max(...report.stack.deps.map((dep) => dep.name.length));
    for (const dep of report.stack.deps) {
      if (dep.status === "ok") continue;
      lines.push(`  ${dep.name.padEnd(width)}  ${describeDep(dep)}`);
    }
  }
  lines.push("");
  const allAbsent =
    report.skills.status === "absent" &&
    report.lenses.status === "absent" &&
    report.stack.status === "absent";
  if (allAbsent) {
    lines.push("Speccle is not set up here — run `speccle init`");
  } else if (report.ok) {
    lines.push("up to date");
  } else {
    lines.push("out of date — run `speccle update`");
  }
  return lines.join("\n");
}

function describePayload(payload: DoctorReport["skills"], verb: string): string {
  switch (payload.status) {
    case "current":
      return `current (${payload.bundled})`;
    case "stale":
      return `stale — committed ${payload.recorded}, this CLI ships ${payload.bundled}`;
    case "ahead":
      return `ahead — committed ${payload.recorded} is newer than this CLI (${payload.bundled})`;
    case "unstamped":
      return "present but unversioned — re-run `speccle init` to record the version";
    case "absent":
      return `not ${verb} — run \`speccle init\``;
  }
}

function describeStack(stack: DoctorReport["stack"]): string {
  if (stack.status === "absent") return "not provisioned — run `speccle strength init`";
  if (stack.status === "current") return "current";
  return "drift — the stack is behind the current preset";
}

function describeDep(dep: DoctorReport["stack"]["deps"][number]): string {
  return dep.status === "missing"
    ? `missing — preset wants ^${dep.wantedMajor}`
    : `behind — has ${dep.declared}, preset wants ^${dep.wantedMajor}`;
}

export function renderUpdate(report: UpdateReport): string {
  const lines: string[] = [];

  if (report.skills.from === report.skills.to) {
    lines.push(`skills   already at ${report.skills.to} — refreshed in place; review the diff`);
  } else {
    lines.push(
      `skills   ${report.skills.from ?? "unversioned"} → ${report.skills.to} — review & commit the diff`,
    );
  }

  if (report.lenses.from === null) {
    lines.push(`lenses   vendored at ${report.lenses.to} — new; review & commit the diff`);
  } else if (report.lenses.from === report.lenses.to) {
    lines.push(`lenses   already at ${report.lenses.to} — refreshed in place; review the diff`);
  } else {
    lines.push(`lenses   ${report.lenses.from} → ${report.lenses.to} — review & commit the diff`);
  }

  if (report.stack.status === "absent") {
    lines.push("stack    not provisioned — run `speccle strength init`");
  } else if (report.stack.status === "current") {
    lines.push("stack    up to date");
  } else {
    lines.push("stack    behind the preset — run:");
    lines.push(`           ${report.stack.fixCommand}`);
  }

  lines.push(`cli      ${report.cli.version} installed — update the binary with:`);
  lines.push(`           ${report.cli.command}`);

  return lines.join("\n");
}

export function renderCheck(report: CheckReport): string {
  const lines = [
    `mutation  ${describeReport(report.mutation)}`,
    `coverage  ${describeReport(report.coverage)}`,
  ];
  const ready = report.mutation.status === "fresh" && report.coverage.status === "fresh";
  if (!ready) {
    lines.push("reports must be regenerated before the heatmap is worth reading");
  } else if (report.evaluated) {
    lines.push("already evaluated — nothing new to read");
  } else {
    lines.push(`fresh and unread — touch ${report.marker} after evaluating the heatmap`);
  }
  return lines.join("\n");
}

function describeReport(check: ReportCheck): string {
  if (check.status === "missing") return `${check.path} — missing`;
  if (check.status === "stale") return `${check.path} — stale (${check.staleAgainst} is newer)`;
  return `${check.path} — fresh`;
}
import type { LintReport } from "./lint.ts";
import type { RiskReport } from "./risk.ts";
import type { CriterionStrength, MutantSite, StrengthReport } from "./strength.ts";
import type { CheckResult, VerifyReport } from "./verify.ts";

export function renderVerify(report: VerifyReport): string {
  const enforced = report.checks.filter((check) => check.status !== "inactive");
  if (enforced.length === 0) {
    const scanned = plural(report.changed.length, "changed file");
    const authored = report.checks.length === 0 ? "no checks authored" : "no check applied";
    return `${authored} — ${scanned} scanned`;
  }

  const lines: string[] = [];
  for (const check of enforced.filter((check) => check.status === "breach")) {
    lines.push(renderBreach(check));
  }
  if (lines.length > 0) lines.push("");

  const breaches = report.breaches;
  const checks = plural(enforced.length, "check");
  lines.push(
    report.clean ? `${checks}, clean` : `${checks}, ${plural(breaches, "breach", "breaches")}`,
  );
  return lines.join("\n");
}

function renderBreach(check: CheckResult): string {
  const lines = [`${check.id}  ${check.message}`];
  for (const offender of check.offenders ?? []) lines.push(`  ${offender}`);
  if (check.because !== undefined) lines.push(`  because ${check.because}`);
  return lines.join("\n");
}

export function renderRisk(report: RiskReport): string {
  const lines: string[] = [];
  for (const signal of report.signals) {
    lines.push(`${signal.id}  +${signal.weight}  ${signal.reason}`);
    for (const item of signal.evidence) lines.push(`  ${item}`);
    if (signal.because !== undefined) lines.push(`  because ${signal.because}`);
  }
  if (report.signals.length > 0) lines.push("");
  else
    lines.push(`no risk signals fired — ${plural(report.changed.length, "changed file")} scanned`);

  lines.push(
    report.humanRequired
      ? `score ${report.score} ≥ threshold ${report.threshold} — human required, review stops at findings`
      : `score ${report.score} < threshold ${report.threshold} — review may fix and report`,
  );
  // Legibility (ADR-0041): the computed score is a floor a risk lens may raise, never lower.
  lines.push("this score is a floor — a risk lens may escalate it, never lower it");
  return lines.join("\n");
}

export function renderClaims(report: ClaimsReport): string {
  if (report.features.length === 0) return "No SPEC.md files found.";

  const idWidth = Math.max(...report.features.flatMap((f) => f.criteria.map((c) => c.id.length)));
  const lines: string[] = [];
  for (const feature of report.features) {
    lines.push(feature.spec);
    for (const c of feature.criteria) {
      const status = c.claimed ? plural(c.tests.length, "test name") : "unclaimed";
      lines.push(`  ${c.id.padEnd(idWidth)}  ${status.padEnd(13)}  ${c.statement}`);
    }
    lines.push("");
  }

  if (report.testFiles.length === 0) {
    lines.push(`no test files matched the ${report.dialect} dialect`);
    lines.push("");
  }

  if (report.unclaimed.length > 0) {
    lines.push("unclaimed — no test name carries these tokens");
    for (const id of report.unclaimed) lines.push(`  ${id}`);
    lines.push("");
  }
  if (report.unknownClaims.length > 0) {
    lines.push("unknown claims — test names claim criteria that no spec declares");
    for (const claim of report.unknownClaims) {
      lines.push(`  ${claim.id}  ${[...new Set(claim.tests.map((t) => t.file))].join(", ")}`);
    }
    lines.push("");
  }

  const total = report.features.reduce((n, f) => n + f.criteria.length, 0);
  const claimed = report.features.reduce(
    (n, f) => n + f.criteria.filter((c) => c.claimed).length,
    0,
  );
  const criteria = `${total} ${total === 1 ? "criterion" : "criteria"}`;
  const specs = plural(report.features.length, "spec file");
  const counts = `${report.dialect} — ${specs}, ${criteria}, ${claimed} claimed`;
  lines.push(report.clean ? `${counts}, clean` : counts);
  return lines.join("\n");
}

export function renderInit(report: InitReport): string {
  const lines: string[] = [];
  for (const { file, action } of report.files) {
    lines.push(
      action === "written" ? `wrote ${file}` : `kept ${file} — already present, left untouched`,
    );
  }
  if (report.missingDeps.length === 0) {
    lines.push("devDependencies already present");
  } else if (report.installRan) {
    lines.push(`installed ${report.missingDeps.join(", ")}`);
  } else {
    lines.push(`missing devDependencies — run: ${report.installCommand}`);
  }
  if (report.files.some((f) => f.action === "kept")) {
    lines.push("");
    lines.push("kept files must carry the strength stack themselves:");
    lines.push('  stryker config: coverageAnalysis "perTest", the json reporter');
    lines.push("  vitest config:  istanbul provider, json-summary reporter");
  }
  if (report.doubleLoad) {
    lines.push("");
    lines.push("warning: this repo vendors the speccle skills project-level AND the");
    lines.push("speccle plugin is enabled user-level — two copies of every skill will");
    lines.push("load. Disable one: /plugin (user-level) or remove .claude/skills/ here.");
  }
  return lines.join("\n");
}

export function renderHuman(report: LintReport): string {
  if (report.files.length === 0) return "No SPEC.md files found.";

  const lines: string[] = [];
  if (report.violations.length > 0) {
    const lineWidth = Math.max(...report.violations.map((v) => String(v.line).length));
    const ruleWidth = Math.max(...report.violations.map((v) => v.rule.length));
    let currentFile: string | undefined;
    for (const v of report.violations) {
      if (v.file !== currentFile) {
        if (currentFile !== undefined) lines.push("");
        lines.push(v.file);
        currentFile = v.file;
      }
      lines.push(
        `  ${String(v.line).padStart(lineWidth)}  ${v.rule.padEnd(ruleWidth)}  ${v.message}`,
      );
    }
    lines.push("");
  }

  const files = plural(report.files.length, "spec file");
  lines.push(
    report.clean ? `${files}, clean` : `${files}, ${plural(report.violations.length, "violation")}`,
  );
  return lines.join("\n");
}

const BAR_WIDTH = 20;
const STRONG = 0.9;
const WEAK = 0.7;

export function renderStrength(report: StrengthReport, color = false): string {
  if (report.features.length === 0) return "No SPEC.md files found.";

  const paint = color ? ansi : (text: string, _code: string) => text;
  const dim = (text: string): string => paint(text, "2");
  const tint = (value: number | null, text: string): string =>
    value === null ? dim(text) : paint(text, value >= STRONG ? "32" : value >= WEAK ? "33" : "31");

  const idWidth = Math.max(
    ...report.features.flatMap((f) => f.criteria.map((c) => c.id.length)),
    0,
  );
  const out: string[] = [];

  for (const feature of report.features) {
    out.push(bold(feature.spec, color));
    for (const criterion of feature.criteria) {
      out.push(renderCriterion(criterion, idWidth, tint, dim));
      for (const survivor of criterion.survivors) out.push(`      ${renderSite(survivor, dim)}`);
    }
    out.push(`  ${dim(`line coverage ${percent(feature.lineCoverage)}`)}`);
    out.push("");
  }

  if (report.unclaimed.length > 0) {
    out.push(`${tint(0, "unclaimed")} ${dim("— no test carries these tokens")}`);
    for (const id of report.unclaimed) out.push(`  ${id}`);
    out.push("");
  }
  if (report.unknownClaims.length > 0) {
    out.push(`${tint(0, "unknown claims")} ${dim("— tests claim criteria that no spec declares")}`);
    for (const id of report.unknownClaims) out.push(`  ${id}`);
    out.push("");
  }
  if (report.unclaimedMutants.length > 0) {
    out.push(
      `${tint(0, "unclaimed mutants")} ${dim("— scored mutants no criterion's tests cover")}`,
    );
    for (const site of report.unclaimedMutants) out.push(`  ${renderSite(site, dim)}`);
    out.push("");
  }
  const staticSurvived = report.staticMutants.survivors.length;
  const staticTotal = report.staticMutants.killed + staticSurvived;
  if (staticTotal > 0) {
    out.push(
      `${tint(staticSurvived === 0 ? 1 : 0, "static mutants")} ` +
        dim("— run at module load, attributable to no criterion"),
    );
    out.push(`  ${report.staticMutants.killed} killed, ${staticSurvived} survived`);
    for (const site of report.staticMutants.survivors) out.push(`  ${renderSite(site, dim)}`);
    out.push("");
  }

  const survivors = report.covered - report.killed + staticSurvived;
  out.push(
    `oracle strength ${tint(report.strength, percent(report.strength))} ` +
      `${dim(`(${report.killed}/${report.covered})`)}   ` +
      `line coverage ${dim(percent(report.lineCoverage))}`,
  );
  out.push(
    survivors === 0
      ? dim("no surviving mutants")
      : `${plural(survivors, "surviving mutant")}${dim(" — each one a change no test noticed")}`,
  );
  return out.join("\n");
}

function renderCriterion(
  criterion: CriterionStrength,
  idWidth: number,
  tint: (value: number | null, text: string) => string,
  dim: (text: string) => string,
): string {
  const id = criterion.id.padEnd(idWidth);
  const counts = `${criterion.killed}/${criterion.covered}`.padStart(7);
  if (!criterion.claimed) {
    return `  ${id}  ${dim("░".repeat(BAR_WIDTH))}  ${tint(0, "unclaimed".padStart(6))}  ${dim(counts)}  ${criterion.statement}`;
  }
  return (
    `  ${id}  ${tint(criterion.strength, bar(criterion.strength))}  ` +
    `${tint(criterion.strength, percent(criterion.strength).padStart(6))}  ` +
    `${dim(counts)}  ${criterion.statement}`
  );
}

function renderSite(site: MutantSite, dim: (text: string) => string): string {
  const at = `${site.file}:${site.line}:${site.column}`;
  const change = site.replacement === undefined ? "" : ` → ${collapse(site.replacement)}`;
  return dim(`${at}  ${site.mutator}${change}`);
}

/** Mutant replacements can be whole statements; the heatmap shows one line of them. */
function collapse(replacement: string): string {
  const single = replacement.replace(/\s+/g, " ").trim();
  return single.length > 48 ? `${single.slice(0, 47)}…` : single;
}

function bar(value: number | null): string {
  if (value === null) return "░".repeat(BAR_WIDTH);
  const filled = Math.round(value * BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ansi(text: string, code: string): string {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function bold(text: string, color: boolean): string {
  return color ? ansi(text, "1") : text;
}

function plural(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}
