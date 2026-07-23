import { describe, expect, it } from "vitest";
import { parseSpec, readClaimedIds, type WellFormedCriterion } from "./spec.ts";

const FILE = "features/checkout/SPEC.md";

function wellFormed(content: string): WellFormedCriterion[] {
  return parseSpec(content, FILE).criteria.filter((c) => c.wellFormed);
}

describe("parseSpec frontmatter", () => {
  it("extracts a valid key with its line", () => {
    const spec = parseSpec("---\nkey: CHECKOUT\n---\n", FILE);
    expect(spec.key).toEqual({ raw: "CHECKOUT", line: 2, valid: true });
  });

  it("unquotes a quoted key", () => {
    const spec = parseSpec('---\nkey: "CHECKOUT"\n---\n', FILE);
    expect(spec.key).toEqual({ raw: "CHECKOUT", line: 2, valid: true });
  });

  it("marks a lowercase key invalid", () => {
    expect(parseSpec("---\nkey: checkout\n---\n", FILE).key?.valid).toBe(false);
  });

  it("marks a too-long key invalid", () => {
    expect(parseSpec("---\nkey: ABCDEFGHIJK\n---\n", FILE).key?.valid).toBe(false);
  });

  it("returns undefined when there is no frontmatter", () => {
    expect(parseSpec("# Title\n", FILE).key).toBeUndefined();
  });

  it("returns undefined when frontmatter has no key line", () => {
    expect(parseSpec("---\nowner: matt\n---\n", FILE).key).toBeUndefined();
  });
});

describe("parseSpec criteria", () => {
  it("parses a well-formed criterion heading", () => {
    const [c] = wellFormed("---\nkey: CHECKOUT\n---\n\n## [CHECKOUT-1] Tax rounds half-up\n");
    expect(c).toMatchObject({
      id: "CHECKOUT-1",
      key: "CHECKOUT",
      n: 1,
      statement: "Tax rounds half-up",
      line: 5,
    });
  });

  it("keeps an empty statement distinct from a malformed token", () => {
    const spec = parseSpec("## [CHECKOUT-1]\n", FILE);
    expect(spec.criteria[0]).toMatchObject({ wellFormed: true, statement: "" });
  });

  it("treats a heading without a token as malformed", () => {
    expect(parseSpec("## Just a heading\n", FILE).criteria[0]?.wellFormed).toBe(false);
  });

  it("treats a lowercase key in the token as malformed", () => {
    expect(parseSpec("## [checkout-1] Statement\n", FILE).criteria[0]?.wellFormed).toBe(false);
  });

  it("treats a leading-zero number as malformed", () => {
    expect(parseSpec("## [CHECKOUT-01] Statement\n", FILE).criteria[0]?.wellFormed).toBe(false);
  });

  it("ignores H1 and H3 headings", () => {
    const spec = parseSpec("# [A-1] One\n### [B-1] Three\n", FILE);
    expect(spec.criteria).toHaveLength(0);
  });

  it("ignores H2-looking lines inside code fences", () => {
    const spec = parseSpec("```\n## [CODE-1] Not a criterion\n```\n## [REAL-1] Is one\n", FILE);
    expect(spec.criteria).toHaveLength(1);
    expect((spec.criteria[0] as WellFormedCriterion).id).toBe("REAL-1");
  });

  it("strips closing ATX hashes from the heading", () => {
    const [c] = wellFormed("## [CHECKOUT-1] Statement ##\n");
    expect(c?.statement).toBe("Statement");
  });

  it("handles CRLF line endings", () => {
    const spec = parseSpec(
      "---\r\nkey: CHECKOUT\r\n---\r\n\r\n## [CHECKOUT-1] Works on CRLF\r\n",
      FILE,
    );
    expect(spec.key?.valid).toBe(true);
    expect(spec.criteria).toHaveLength(1);
  });
});

describe("readClaimedIds", () => {
  it("reads every bracketed token in a name", () => {
    expect(readClaimedIds("[CHECKOUT-1] and [CHECKOUT-12] together", "bracketed")).toEqual([
      "CHECKOUT-1",
      "CHECKOUT-12",
    ]);
  });

  it("returns the identifier spelling as the one bracketed id", () => {
    expect(readClaimedIds("test_CHECKOUT_1_taxRounds", "identifier")).toEqual(["CHECKOUT-1"]);
    expect(readClaimedIds("test_CHECKOUT_12", "identifier")).toEqual(["CHECKOUT-12"]);
  });

  it("needs an underscore boundary, so a run-on identifier claims nothing", () => {
    expect(readClaimedIds("testCHECKOUT_1", "identifier")).toEqual([]);
    expect(readClaimedIds("test_CHECKOUT_1Fixture", "identifier")).toEqual([]);
    expect(readClaimedIds("test_XCHECKOUT_1_rounds", "identifier")).toEqual(["XCHECKOUT-1"]);
  });

  it("reads only the spelling the name can carry", () => {
    expect(readClaimedIds("test_CHECKOUT_1_taxRounds", "bracketed")).toEqual([]);
    expect(readClaimedIds("[CHECKOUT-1] tax rounds", "identifier")).toEqual([]);
  });
});
