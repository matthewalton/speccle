import type { ParsedSpec } from "../spec.ts";
import { RULE_IDS, type Violation } from "../violation.ts";
import { structuralRules } from "./structural.ts";
import { qualityRules } from "./quality.ts";

/** All nine rules over the full spec set, sorted deterministically. */
export function runRules(specs: ParsedSpec[]): Violation[] {
  const violations = [...structuralRules(specs), ...qualityRules(specs)];
  return violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      RULE_IDS.indexOf(a.rule) - RULE_IDS.indexOf(b.rule) ||
      a.message.localeCompare(b.message),
  );
}
