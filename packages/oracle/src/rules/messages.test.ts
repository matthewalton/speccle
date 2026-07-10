import { describe, expect, it } from "vitest";
import { parseSpec } from "../spec.ts";
import { runRules } from "./index.ts";
import type { RuleId, Violation } from "../violation.ts";

function lint(content: string): Violation[] {
  return runRules([parseSpec(content, "SPEC.md")]);
}

function only(violations: Violation[], rule: RuleId): string {
  const matches = violations.filter((v) => v.rule === rule);
  expect(matches).toHaveLength(1);
  return matches[0]!.message;
}

const statement = (text: string) => `---\nkey: ALPHA\n---\n\n## [ALPHA-1] ${text}\n`;

describe("[LINT-12] every violation message quotes its evidence", () => {
  it("missing-key names the frontmatter field when the key is absent", () => {
    expect(only(lint("# Title\n"), "missing-key")).toContain('"key"');
  });

  it("missing-key quotes the raw key and the expected pattern", () => {
    const message = only(lint("---\nkey: alpha\n---\n"), "missing-key");
    expect(message).toContain('"alpha"');
    expect(message).toContain("[A-Z]");
  });

  it("key-collision lists the other files, comma-separated, never its own", () => {
    const specs = ["a", "b", "c"].map((dir) =>
      parseSpec("---\nkey: ALPHA\n---\n", `${dir}/SPEC.md`),
    );
    const message = only(
      runRules(specs).filter((v) => v.file === "a/SPEC.md"),
      "key-collision",
    );
    expect(message).toContain("b/SPEC.md, c/SPEC.md");
    expect(message).not.toContain("a/SPEC.md");
  });

  it("key-mismatch quotes the criterion id and the declared key", () => {
    const message = only(
      lint("---\nkey: ALPHA\n---\n\n## [BETA-1] Total returns zero\n"),
      "key-mismatch",
    );
    expect(message).toContain("[BETA-1]");
    expect(message).toContain('"ALPHA"');
  });

  it("malformed-id quotes the heading", () => {
    const message = only(lint("---\nkey: ALPHA\n---\n\n## Some section heading\n"), "malformed-id");
    expect(message).toContain("Some section heading");
  });

  it("duplicate-id quotes the id and points at the first occurrence", () => {
    const message = only(
      lint(
        "---\nkey: ALPHA\n---\n\n## [ALPHA-1] Total returns zero\n\n## [ALPHA-1] Discount returns zero\n",
      ),
      "duplicate-id",
    );
    expect(message).toContain("[ALPHA-1]");
    expect(message).toContain("SPEC.md:5");
  });

  it("empty-statement quotes the criterion id", () => {
    expect(only(lint("---\nkey: ALPHA\n---\n\n## [ALPHA-1]\n"), "empty-statement")).toContain(
      "[ALPHA-1]",
    );
  });

  it("compound-criterion names a comma-conjunction, lowercased", () => {
    const message = only(
      lint(statement("Login returns a token, AND logout clears it")),
      "compound-criterion",
    );
    expect(message).toContain('"and"');
  });

  it('compound-criterion names "as well as", lowercased', () => {
    const message = only(
      lint(statement("Login returns a token AS WELL AS sets a cookie")),
      "compound-criterion",
    );
    expect(message).toContain('"as well as"');
  });

  it("compound-criterion names a second sentence", () => {
    const message = only(
      lint(statement("Login returns a token. Logout clears it")),
      "compound-criterion",
    );
    expect(message).toContain("second sentence");
  });

  it("unmeasurable says a property was named", () => {
    expect(only(lint(statement("The dashboard is beautiful")), "unmeasurable")).toContain(
      "names a property",
    );
  });
});
