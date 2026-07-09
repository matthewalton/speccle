/** The nine fixed rules, in the order of the table in docs/convention.md. */
export const RULE_IDS = [
  "missing-key",
  "key-collision",
  "key-mismatch",
  "malformed-id",
  "duplicate-id",
  "empty-statement",
  "weasel-wording",
  "compound-criterion",
  "unmeasurable",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

/** One deterministic rule finding. One severity, no configuration. */
export interface Violation {
  rule: RuleId;
  /** Spec file path, relative to the lint root (posix). */
  file: string;
  /** 1-based line the violation anchors to. */
  line: number;
  message: string;
}
