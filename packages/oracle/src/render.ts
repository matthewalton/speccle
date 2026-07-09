import type { LintReport } from "./lint.ts";

export function renderHuman(report: LintReport): string {
  if (report.files.length === 0) return "No spec.md files found.";

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

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
