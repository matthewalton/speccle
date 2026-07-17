import { describe, expect, it } from "vitest";
import { parseSpec } from "../../spec.ts";
import { FILE_EXTENSIONS, qualityRules } from "./quality.ts";
import type { Violation } from "../../violation.ts";

function lintStatement(statement: string): Violation[] {
  const content = `---\nkey: ALPHA\n---\n\n## [ALPHA-1] ${statement}\n`;
  return qualityRules([parseSpec(content, "SPEC.md")]);
}

function rules(statement: string): string[] {
  return lintStatement(statement).map((v) => v.rule);
}

describe("[LINT-7] weasel-wording", () => {
  it('flags "should"', () => {
    expect(rules("Checkout should return zero")).toContain("weasel-wording");
  });

  it("flags multi-word terms", () => {
    expect(rules("Export returns results as expected")).toContain("weasel-wording");
  });

  it("is case-insensitive", () => {
    expect(rules("Export returns results QUICKLY")).toContain("weasel-wording");
  });

  it("names the term in the message", () => {
    const violation = lintStatement("Export returns results quickly").find(
      (v) => v.rule === "weasel-wording",
    );
    expect(violation?.message).toBe('weasel wording: "quickly"');
  });

  it("ignores terms inside code spans", () => {
    expect(rules("Parser rejects the `should` keyword")).not.toContain("weasel-wording");
  });

  it("a stripped code span still separates words", () => {
    expect(rules("Export runs`fast`easily")).toContain("weasel-wording");
  });

  it("does not flag a clean statement", () => {
    expect(rules("Total returns zero for an empty basket")).toEqual([]);
  });
});

describe("[LINT-8] compound-criterion", () => {
  it("flags a semicolon", () => {
    expect(rules("Login returns a token; logout clears it")).toEqual(["compound-criterion"]);
  });

  it("flags a comma before a conjunction", () => {
    expect(rules("Login returns a token, and logout clears it")).toEqual(["compound-criterion"]);
  });

  it('flags "as well as"', () => {
    expect(rules("Login returns a token as well as sets a cookie")).toEqual(["compound-criterion"]);
  });

  it("flags a second sentence", () => {
    expect(rules("Login returns a token. Logout clears it")).toEqual(["compound-criterion"]);
  });

  it('does not flag a bare "and" joining a noun phrase', () => {
    expect(rules("Checkout returns the total and tax fields")).toEqual([]);
  });

  it('flags a second bare "and" as a list of behaviours', () => {
    expect(rules("A refund restores stock and credits the customer and emails them")).toEqual([
      "compound-criterion",
    ]);
  });

  it("counts mixed bare conjunctions", () => {
    expect(rules("Delete archives the record and revokes tokens or sessions")).toEqual([
      "compound-criterion",
    ]);
  });

  it("names the second conjunction in the message", () => {
    const violation = lintStatement("Export saves the file or emails it or prints it").find(
      (v) => v.rule === "compound-criterion",
    );
    expect(violation?.message).toBe('compound criterion: a second bare "or" joins another clause');
  });

  it("does not count conjunctions inside a condition", () => {
    expect(
      rules(
        "Payment fails when the card is expired and the retry limit is reached and the user is offline",
      ),
    ).toEqual([]);
  });

  it("does not count conjunctions inside code spans", () => {
    expect(rules("Parser accepts the `and` and `or` keywords")).not.toContain("compound-criterion");
  });

  it('does not treat "e.g." as a sentence end', () => {
    expect(rules("Parser rejects reserved names e.g. admin accounts")).toEqual([]);
  });

  it("flags a comma-conjunction across extra whitespace", () => {
    expect(rules("Login returns a token,  and logout clears it")).toEqual(["compound-criterion"]);
  });

  it("a stripped abbreviation still separates words", () => {
    expect(rules("Login returns a token,e.g.and logout clears it")).toEqual(["compound-criterion"]);
  });

  it("reports one violation naming the first signal only", () => {
    const violations = lintStatement("Login returns a token; logout clears it. Always").filter(
      (v) => v.rule === "compound-criterion",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("semicolon");
  });
});

describe("[LINT-9] unmeasurable", () => {
  it("flags a statement naming a property rather than an outcome", () => {
    expect(rules("The dashboard is beautiful")).toEqual(["unmeasurable"]);
  });

  it("flags a vacuous predicate", () => {
    expect(rules("Refunds are handled")).toEqual(["unmeasurable"]);
  });

  it("names the vacuous predicate in the message", () => {
    const violation = lintStatement("Checkout works").find((v) => v.rule === "unmeasurable");
    expect(violation?.message).toBe('no measurable outcome: "works" asserts nothing observable');
  });

  it("accepts any domain verb, enumerated or not", () => {
    expect(rules("A refund credits the customer the full line-item total")).toEqual([]);
    expect(rules("A trade novates to the central counterparty")).toEqual([]);
  });

  it("accepts an outcome verb", () => {
    expect(rules("Checkout rejects an oversized basket")).toEqual([]);
  });

  it("accepts a comparator", () => {
    expect(rules("The audit trail is never truncated")).toEqual([]);
  });

  it("accepts a comparator that is the trailing word", () => {
    expect(rules("The remaining balance is zero")).toEqual([]);
  });

  it("accepts a quantity", () => {
    expect(rules("Tax rounds half-up to 2dp per line item")).toEqual([]);
  });

  it("accepts a quantity ahead of a trailing adjective", () => {
    expect(rules("The p99 latency is low")).toEqual([]);
  });

  it("accepts a copula followed by a literal", () => {
    expect(rules("The status is `done` after payment")).not.toContain("unmeasurable");
  });

  it("accepts a copula naming a state, not a property", () => {
    expect(rules("The order is cancelled")).toEqual([]);
  });

  it("matches a property across extra whitespace", () => {
    expect(rules("The dashboard is  beautiful")).toEqual(["unmeasurable"]);
  });

  it("matches a negated property", () => {
    expect(rules("The dashboard is not  beautiful")).toEqual(["unmeasurable"]);
  });

  it("judges only a trailing copula, not one mid-statement", () => {
    expect(rules("The dashboard is beautiful to customers")).toEqual([]);
  });

  it("a trailing code span does not hide a property", () => {
    expect(rules("The dashboard is beautiful `honestly`")).toContain("unmeasurable");
  });

  it("judges the main clause, not a condition", () => {
    expect(rules("Payment fails when the card is expired")).toEqual([]);
    expect(rules("Checkout returns the total when the basket is large")).toEqual([]);
  });

  it("does not flag a statement already lacking a token or statement", () => {
    const content = "---\nkey: ALPHA\n---\n\n## [ALPHA-1]\n\n## No token here\n";
    expect(qualityRules([parseSpec(content, "SPEC.md")])).toEqual([]);
  });
});

describe("[LINT-13] code-voice", () => {
  it("flags a code span in a statement", () => {
    expect(rules("The linter rejects the `--json` flag")).toEqual(["code-voice"]);
  });

  it("flags a file path by its extension", () => {
    expect(rules("Discovery finds every SPEC.md under the target")).toEqual(["code-voice"]);
  });

  it("recognises every extension on the fixed list", () => {
    for (const extension of FILE_EXTENSIONS) {
      expect(rules(`Export writes a report.${extension} artifact`)).toEqual(["code-voice"]);
    }
  });

  it("flags a camelCase identifier", () => {
    expect(rules("Adding calls addItem for every line")).toEqual(["code-voice"]);
  });

  it("flags a snake_case identifier", () => {
    expect(rules("The report writes coverage_summary on every run")).toEqual(["code-voice"]);
  });

  it("flags call parentheses", () => {
    expect(rules("Clearing invokes reset() on the basket")).toEqual(["code-voice"]);
  });

  it("reports one violation naming the first signal only", () => {
    const violations = lintStatement("The `claims()` output lists basket.ts identifiers").filter(
      (v) => v.rule === "code-voice",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("code span");
  });

  it("lets a brand name with one leading lowercase letter pass", () => {
    expect(rules("Checkout renders a receipt on iPhone screens")).toEqual([]);
  });

  it("lets a plain acronym pass", () => {
    expect(rules("The response is valid JSON on every request")).toEqual([]);
  });

  it("lets an unlisted extension pass", () => {
    expect(rules("Export produces an archive.zip download")).toEqual([]);
  });

  it("does not flag a product-voiced statement", () => {
    expect(rules("When a basket exceeds 100 line items, checkout rejects it")).toEqual([]);
  });
});

describe("[LINT-10] the body is never linted", () => {
  it("ignores weasel words, compounds, and vagueness in criterion bodies", () => {
    const content = [
      "---",
      "key: ALPHA",
      "---",
      "",
      "## [ALPHA-1] Total returns zero for an empty basket",
      "",
      "The body should work properly; it is beautiful, and easy. Etc.",
      "",
    ].join("\n");
    expect(qualityRules([parseSpec(content, "SPEC.md")])).toEqual([]);
  });
});
