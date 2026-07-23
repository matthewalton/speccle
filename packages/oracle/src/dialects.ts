import type { IdSpelling } from "./spec.ts";

/** One test name a dialect read out of a test file, with the id spelling it can carry. */
export interface TestName {
  /** The name as the framework spells it — a display string, or the identifier itself. */
  name: string;
  spelling: IdSpelling;
}

/**
 * The per-language knowledge Speccle carries about a test stack: which files are tests,
 * and how a test's full name is read. A repo declares which dialect it is on, never how
 * that dialect works, so a clean `claims` run means the same thing in every repo
 * (ADR-0038). There is no regex override.
 */
export interface Dialect {
  name: string;
  /** `file` is a posix path relative to the discovery root. */
  isTestFile(file: string): boolean;
  /**
   * Names are read statically, so only literal names count. A name built dynamically
   * that the scan misses shows up as unclaimed — the failure mode is a false alarm,
   * never a silent pass.
   */
  readTestNames(source: string): TestName[];
}

const TS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const TS_TEST_TITLE = /\b(?:describe|it|test)(?:\.[\w.]+)*\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;

const TS_VITEST: Dialect = {
  name: "ts-vitest",
  isTestFile: (file) => TS_TEST_FILE.test(file),
  readTestNames: (source) =>
    [...source.matchAll(TS_TEST_TITLE)].map((m) => ({ name: m[2]!, spelling: "bracketed" })),
};

/** `LadderTests.swift` — or any `.swift` file under a `Tests` directory. */
const SWIFT_TEST_FILE = /Tests?\.swift$/;

/** Swift Testing display names — `@Test("…")`, `@Suite("…")`: the string is the name. */
const SWIFT_DISPLAY_NAME = /@(?:Test|Suite)\s*\(\s*"((?:\\.|[^"\\])*)"/g;

/** XCTest methods: the name is the identifier, so the id takes its identifier-safe spelling. */
const XCTEST_METHOD = /\bfunc\s+(test[A-Za-z0-9_]*)\s*\(/g;

/** A `@Test`/`@Suite` declaration carrying no display name — its identifier is the name. */
const SWIFT_ANNOTATED_DECL =
  /@(?:Test|Suite)\b(?!\s*\(\s*")(?:\s*\([^()]*\))?(?:\s+(?:@\w+|open|public|internal|fileprivate|private|final|static))*\s+(?:actor|class|enum|func|struct)\s+([A-Za-z_]\w*)/g;

const SWIFT: Dialect = {
  name: "swift",
  isTestFile: (file) =>
    SWIFT_TEST_FILE.test(file) || (file.endsWith(".swift") && file.split("/").includes("Tests")),
  readTestNames(source) {
    const found: (TestName & { at: number })[] = [...source.matchAll(SWIFT_DISPLAY_NAME)].map(
      (m) => ({ at: m.index, name: m[1]!, spelling: "bracketed" }),
    );
    // The two identifier scans overlap on an annotated `func test…`, and an identifier
    // names exactly one declaration, so the same name is never read twice.
    const seen = new Set<string>();
    for (const m of [...source.matchAll(XCTEST_METHOD), ...source.matchAll(SWIFT_ANNOTATED_DECL)]) {
      if (seen.has(m[1]!)) continue;
      seen.add(m[1]!);
      found.push({ at: m.index, name: m[1]!, spelling: "identifier" });
    }
    return found.sort((a, b) => a.at - b.at).map(({ name, spelling }) => ({ name, spelling }));
  },
};

const DIALECTS = new Map([TS_VITEST, SWIFT].map((dialect) => [dialect.name, dialect]));

export const DEFAULT_DIALECT = TS_VITEST.name;

export const DIALECT_NAMES = [...DIALECTS.keys()];

/** An unsupported stack is unsupported, and says so (ADR-0038). */
export function resolveDialect(name: string): Dialect {
  const dialect = DIALECTS.get(name);
  if (!dialect) {
    throw new Error(`unknown test dialect: ${name} — known dialects: ${DIALECT_NAMES.join(", ")}`);
  }
  return dialect;
}
