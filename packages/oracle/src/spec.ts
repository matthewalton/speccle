export const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

const ID_TOKEN = /^\[([A-Z][A-Z0-9]{1,9})-([1-9][0-9]*)\]$/;

/** A `[KEY-n]` token anywhere in a test's full concatenated name (ADR-0004). */
export const CLAIM_TOKEN = /\[([A-Z][A-Z0-9]{1,9}-[1-9][0-9]*)\]/g;

/**
 * How a criterion id may be spelled inside a test name: bracketed `[KEY-n]` wherever a
 * framework gives a test a string name, identifier-safe `KEY_n` where the name _is_ an
 * identifier (ADR-0039). The two spellings are one id — headings and reports use the
 * bracketed form.
 */
export type IdSpelling = "bracketed" | "identifier";

/**
 * `KEY_n`, bounded by underscores or non-alphanumerics: `test_CHECKOUT_1_taxRounds`
 * claims CHECKOUT-1, while `testCHECKOUT_1` and `CHECKOUT_1Fixture` do not.
 */
const IDENTIFIER_CLAIM_TOKEN = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,9})_([1-9][0-9]*)(?![A-Za-z0-9])/g;

/** Every criterion id a test name claims, always in the bracketed `KEY-n` form. */
export function readClaimedIds(name: string, spelling: IdSpelling): string[] {
  if (spelling === "bracketed") return [...name.matchAll(CLAIM_TOKEN)].map((m) => m[1]!);
  return [...name.matchAll(IDENTIFIER_CLAIM_TOKEN)].map((m) => `${m[1]!}-${m[2]!}`);
}

/** Sorts `KEY-n` ids by key, then numerically by n. */
export function compareCriterionIds(a: string, b: string): number {
  const [aKey, aN] = splitId(a);
  const [bKey, bN] = splitId(b);
  return aKey === bKey ? aN - bN : aKey.localeCompare(bKey);
}

function splitId(id: string): [string, number] {
  const dash = id.lastIndexOf("-");
  return [id.slice(0, dash), Number(id.slice(dash + 1))];
}

export interface SpecKey {
  raw: string;
  line: number;
  valid: boolean;
}

export interface WellFormedCriterion {
  wellFormed: true;
  /** `KEY-n`, without brackets. */
  id: string;
  key: string;
  n: number;
  statement: string;
  line: number;
  heading: string;
}

export interface MalformedCriterion {
  wellFormed: false;
  line: number;
  heading: string;
}

export type Criterion = WellFormedCriterion | MalformedCriterion;

export interface ParsedSpec {
  file: string;
  key: SpecKey | undefined;
  /** Every H2 in document order is a criterion (convention rule 5). */
  criteria: Criterion[];
}

export function parseSpec(content: string, file: string): ParsedSpec {
  const lines = content.split(/\r?\n/);
  let bodyStart = 0;
  let key: SpecKey | undefined;

  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (close > 0) {
      bodyStart = close + 1;
      for (let i = 1; i < close; i++) {
        const match = /^key:\s*(.*)$/.exec(lines[i] ?? "");
        if (match) {
          const raw = unquote(match[1]!.trim());
          key = { raw, line: i + 1, valid: KEY_PATTERN.test(raw) };
          break;
        }
      }
    }
  }

  const criteria: Criterion[] = [];
  let fence: string | undefined;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const fenceMatch = /^(`{3,}|~{3,})/.exec(line.trimStart());
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
      if (fence === undefined) fence = marker;
      else if (marker === fence) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const h2 = /^##(?!#)\s+(.*?)\s*$/.exec(line);
    if (!h2) continue;
    const heading = h2[1]!.replace(/\s+#+$/, "");
    criteria.push(parseHeading(heading, i + 1));
  }

  return { file, key, criteria };
}

function parseHeading(heading: string, line: number): Criterion {
  const token = /^(\[[^\]]*\])\s*(.*)$/.exec(heading);
  if (token) {
    const id = ID_TOKEN.exec(token[1]!);
    if (id) {
      return {
        wellFormed: true,
        id: `${id[1]!}-${id[2]!}`,
        key: id[1]!,
        n: Number(id[2]),
        statement: token[2]!.trim(),
        line,
        heading,
      };
    }
  }
  return { wellFormed: false, line, heading };
}

function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2]! : value;
}
