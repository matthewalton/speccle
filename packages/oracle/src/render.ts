import type { InitReport } from "./init.ts";
import type { LintReport } from "./lint.ts";
import type { CriterionStrength, MutantSite, StrengthReport } from "./strength.ts";

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

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
