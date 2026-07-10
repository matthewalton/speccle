import { describe, expect, it } from "vitest";
import { parseSpec } from "../spec.ts";
import { runRules } from "./index.ts";

describe("[LINT-11] violations are ordered by file, line, rule, message", () => {
  it("sorts by file, then line, then the convention table's rule order", () => {
    const a = parseSpec(
      "---\nkey: ALPHA\n---\n\n## [ALPHA-1] Checkout works quickly\n\n## [ALPHA-2] Refunds are handled\n",
      "a/SPEC.md",
    );
    const b = parseSpec("---\nkey: BETA\n---\n\n## No token here\n", "b/SPEC.md");
    expect(runRules([b, a]).map((v) => `${v.file}:${v.line} ${v.rule}`)).toEqual([
      "a/SPEC.md:5 weasel-wording",
      "a/SPEC.md:5 unmeasurable",
      "a/SPEC.md:7 unmeasurable",
      "b/SPEC.md:5 malformed-id",
    ]);
  });

  it("breaks a same-rule tie on the message", () => {
    const spec = parseSpec(
      "---\nkey: ALPHA\n---\n\n## [ALPHA-1] Checkout should respond quickly\n",
      "SPEC.md",
    );
    expect(runRules([spec]).map((v) => v.message)).toEqual([
      'weasel wording: "quickly"',
      'weasel wording: "should"',
    ]);
  });
});
