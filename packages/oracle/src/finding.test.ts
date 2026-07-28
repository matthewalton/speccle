import { describe, expect, it } from "vitest";
import { commentBody, type FindingBody, parseCommentBody } from "./finding.ts";

describe("the inline comment a finding travels in", () => {
  const base: FindingBody = {
    lens: "correctness.md",
    severity: "major",
    what: "A refund over the order total returns a negative charge.",
    why: "`applyRefund` subtracts without clamping, so the caller charges the customer.",
    fix: "Clamp the refund to the order total before subtracting.",
    remedy: "criterion",
  };

  // The round trip is the whole guard: `review findings` recovers a posted review by parsing
  // what `review run` wrote, so a change to either side that the other does not follow shows up
  // here rather than as findings with silently empty fields.
  it.each([
    ["every field set", base],
    ["no why", { ...base, why: "" }],
    ["no fix", { ...base, fix: "" }],
    ["neither why nor fix", { ...base, why: "", fix: "" }],
    ["a why of several paragraphs", { ...base, why: "First paragraph.\n\nSecond paragraph." }],
    ["a fix of several paragraphs", { ...base, fix: "Do this.\n\nThen this." }],
    ["an em dash in what", { ...base, what: "The guard — the only one — never fires." }],
  ])("survives a round trip with %s", (_case, finding: FindingBody) => {
    expect(parseCommentBody(commentBody(finding))).toEqual(finding);
  });

  it("reads a comment no lens wrote as no finding, rather than an empty one", () => {
    expect(parseCommentBody("Good catch, fixed in the next commit.")).toBeUndefined();
    expect(parseCommentBody("**major** — a headline with no footer")).toBeUndefined();
    expect(parseCommentBody("")).toBeUndefined();
  });
});
