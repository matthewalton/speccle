/** Order matches the table in docs/convention.md and drives violation sorting. */
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
  "code-voice",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface Violation {
  rule: RuleId;
  /** Root-relative posix path. */
  file: string;
  /** 1-based. */
  line: number;
  message: string;
}
