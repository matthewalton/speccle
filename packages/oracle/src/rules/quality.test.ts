import { describe, expect, it } from "vitest";
import { parseSpec } from "../spec.ts";
import { qualityRules } from "./quality.ts";
import type { Violation } from "../violation.ts";

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
    expect(rules("Parser rejects the `should` keyword")).toEqual([]);
  });

  it("a stripped code span still separates words", () => {
    expect(rules("Export runs`fast`easily")).toEqual(["weasel-wording"]);
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
    expect(rules("Parser accepts the `and` and `or` keywords")).toEqual([]);
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
    expect(rules("The status is `done` after payment")).toEqual([]);
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
    expect(rules("The dashboard is beautiful `honestly`")).toEqual(["unmeasurable"]);
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
