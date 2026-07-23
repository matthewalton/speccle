import { describe, expect, it } from "vitest";
import { DEFAULT_DIALECT, DIALECT_NAMES, resolveDialect } from "./dialects.ts";

const tsVitest = resolveDialect("ts-vitest");
const swift = resolveDialect("swift");

describe("resolveDialect", () => {
  it("names every dialect it can resolve, the default among them", () => {
    expect(DIALECT_NAMES).toEqual(["ts-vitest", "swift"]);
    for (const name of DIALECT_NAMES) expect(resolveDialect(name).name).toBe(name);
    expect(resolveDialect(DEFAULT_DIALECT).name).toBe("ts-vitest");
  });

  it("says so when a stack is unsupported, listing what is", () => {
    expect(() => resolveDialect("kotlin")).toThrow(
      "unknown test dialect: kotlin — known dialects: ts-vitest, swift",
    );
  });
});

describe("ts-vitest", () => {
  it("counts .test and .spec files across the js/ts extensions", () => {
    for (const file of ["src/basket.test.ts", "src/basket.spec.tsx", "basket.test.mjs"]) {
      expect(tsVitest.isTestFile(file)).toBe(true);
    }
    for (const file of ["src/basket.ts", "src/testing.ts", "LadderTests.swift"]) {
      expect(tsVitest.isTestFile(file)).toBe(false);
    }
  });

  it("captures describe, it, and test titles in any quote style", () => {
    const source = `
      describe("[A-1] outer", () => {
        it('inner case', () => {});
        test(\`another [A-2] case\`, () => {});
      });
    `;
    expect(tsVitest.readTestNames(source)).toEqual([
      { name: "[A-1] outer", spelling: "bracketed" },
      { name: "inner case", spelling: "bracketed" },
      { name: "another [A-2] case", spelling: "bracketed" },
    ]);
  });

  it("captures titles behind modifiers like .skip and .only", () => {
    const source = `describe.only("[A-1] focused", () => { it.skip("later", () => {}); });`;
    expect(tsVitest.readTestNames(source).map((t) => t.name)).toEqual(["[A-1] focused", "later"]);
  });

  it("keeps escaped quotes inside a title", () => {
    const names = tsVitest.readTestNames(`it("quotes \\"[A-1]\\" evidence", () => {})`);
    expect(names.map((t) => t.name)).toEqual(['quotes \\"[A-1]\\" evidence']);
  });

  it("ignores strings that are not describe/it/test titles", () => {
    const source = `expect(render("[A-9] not a claim")).toBe("[A-8] also not");`;
    expect(tsVitest.readTestNames(source)).toEqual([]);
  });
});

describe("swift", () => {
  it("counts Test/Tests-suffixed files and anything under a Tests directory", () => {
    for (const file of ["src/LadderTests.swift", "src/RungTest.swift", "Tests/Ladder/Rung.swift"]) {
      expect(swift.isTestFile(file)).toBe(true);
    }
    for (const file of ["src/Ladder.swift", "src/Contest.swift", "src/ladder.test.ts"]) {
      expect(swift.isTestFile(file)).toBe(false);
    }
  });

  it("reads Swift Testing display names as bracketed", () => {
    const source = `
      @Suite("[LADDER-1] rungs")
      struct RungTests {
        @Test("[LADDER-2] the top rung finishes the ladder", .tags(.fast))
        func topRung() {}
      }
    `;
    expect(swift.readTestNames(source)).toEqual([
      { name: "[LADDER-1] rungs", spelling: "bracketed" },
      { name: "[LADDER-2] the top rung finishes the ladder", spelling: "bracketed" },
    ]);
  });

  it("reads XCTest method identifiers as the identifier spelling", () => {
    const source = `
      final class LadderTests: XCTestCase {
        func test_LADDER_1_advancesOneRung() {}
        func testUnclaimedHelperShape() {}
      }
    `;
    expect(swift.readTestNames(source)).toEqual([
      { name: "test_LADDER_1_advancesOneRung", spelling: "identifier" },
      { name: "testUnclaimedHelperShape", spelling: "identifier" },
    ]);
  });

  it("reads the identifier of a @Test declaration that carries no display name", () => {
    const source = `
      @Test
      func LADDER_1_advancesOneRung() {}

      @Test(arguments: [1, 2])
      static func LADDER_2_finishes(rung: Int) {}
    `;
    expect(swift.readTestNames(source)).toEqual([
      { name: "LADDER_1_advancesOneRung", spelling: "identifier" },
      { name: "LADDER_2_finishes", spelling: "identifier" },
    ]);
  });

  it("reads an annotated test method once, not once per scan", () => {
    const source = `@Test func test_LADDER_1_advances() {}`;
    expect(swift.readTestNames(source)).toEqual([
      { name: "test_LADDER_1_advances", spelling: "identifier" },
    ]);
  });

  it("ignores a plain function and a string that is not a display name", () => {
    const source = `
      func makeLadder(_ name: String = "[LADDER-1] not a claim") -> Ladder { Ladder() }
    `;
    expect(swift.readTestNames(source)).toEqual([]);
  });
});
