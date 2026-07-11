import { describe, expect, it } from "vitest";
import { parseSpec } from "../../spec.ts";
import { structuralRules } from "./structural.ts";
import type { Violation } from "../../violation.ts";

function lintOne(content: string): Violation[] {
  return structuralRules([parseSpec(content, "SPEC.md")]);
}

const CLEAN = "---\nkey: ALPHA\n---\n\n## [ALPHA-1] Total returns zero\n";

describe("[LINT-1] missing-key", () => {
  it("flags an absent frontmatter key at line 1", () => {
    expect(lintOne("# Title\n")).toEqual([
      expect.objectContaining({ rule: "missing-key", line: 1 }),
    ]);
  });

  it("flags a malformed key at its declaration line", () => {
    expect(lintOne("---\nkey: alpha\n---\n")).toEqual([
      expect.objectContaining({ rule: "missing-key", line: 2 }),
    ]);
  });

  it("does not flag a valid key", () => {
    expect(lintOne(CLEAN)).toEqual([]);
  });
});

describe("[LINT-2] key-collision", () => {
  it("flags every spec declaring the same key, naming the others", () => {
    const a = parseSpec("---\nkey: ALPHA\n---\n", "a/SPEC.md");
    const b = parseSpec("---\nkey: ALPHA\n---\n", "b/SPEC.md");
    const violations = structuralRules([a, b]);
    expect(violations).toEqual([
      expect.objectContaining({ rule: "key-collision", file: "a/SPEC.md", line: 2 }),
      expect.objectContaining({ rule: "key-collision", file: "b/SPEC.md", line: 2 }),
    ]);
    expect(violations[0]?.message).toContain("b/SPEC.md");
  });

  it("does not group invalid keys", () => {
    const a = parseSpec("---\nkey: nope\n---\n", "a/SPEC.md");
    const b = parseSpec("---\nkey: nope\n---\n", "b/SPEC.md");
    const rules = structuralRules([a, b]).map((v) => v.rule);
    expect(rules).toEqual(["missing-key", "missing-key"]);
  });
});

describe("[LINT-3] key-mismatch", () => {
  it("flags a criterion whose key differs from the declared key", () => {
    const violations = lintOne("---\nkey: ALPHA\n---\n\n## [BETA-1] Total returns zero\n");
    expect(violations).toEqual([expect.objectContaining({ rule: "key-mismatch", line: 5 })]);
  });

  it("does not run when the declared key is itself invalid", () => {
    const violations = lintOne("---\nkey: alpha\n---\n\n## [BETA-1] Total returns zero\n");
    expect(violations.map((v) => v.rule)).toEqual(["missing-key"]);
  });
});

describe("[LINT-4] malformed-id", () => {
  it("flags an H2 without a token", () => {
    const violations = lintOne("---\nkey: ALPHA\n---\n\n## Some section\n");
    expect(violations).toEqual([expect.objectContaining({ rule: "malformed-id", line: 5 })]);
  });

  it("flags a malformed token", () => {
    const violations = lintOne("---\nkey: ALPHA\n---\n\n## [ALPHA-0] Zero is not a valid n\n");
    expect(violations.map((v) => v.rule)).toEqual(["malformed-id"]);
  });
});

describe("[LINT-5] duplicate-id", () => {
  it("flags the second and later occurrences, pointing at the first", () => {
    const violations = lintOne(
      "---\nkey: ALPHA\n---\n\n## [ALPHA-1] Total returns zero\n\n## [ALPHA-1] Discount returns zero\n",
    );
    expect(violations).toEqual([expect.objectContaining({ rule: "duplicate-id", line: 7 })]);
    expect(violations[0]?.message).toContain("SPEC.md:5");
  });

  it("flags duplicates across files", () => {
    const a = parseSpec("---\nkey: ALPHA\n---\n\n## [ALPHA-1] Total returns zero\n", "a/SPEC.md");
    const b = parseSpec("---\nkey: BETA\n---\n\n## [ALPHA-1] Total returns zero\n", "b/SPEC.md");
    const violations = structuralRules([a, b]).filter((v) => v.rule === "duplicate-id");
    expect(violations).toEqual([expect.objectContaining({ file: "b/SPEC.md", line: 5 })]);
  });
});

describe("[LINT-6] empty-statement", () => {
  it("flags a token with no statement", () => {
    const violations = lintOne("---\nkey: ALPHA\n---\n\n## [ALPHA-1]\n");
    expect(violations).toEqual([expect.objectContaining({ rule: "empty-statement", line: 5 })]);
  });
});
