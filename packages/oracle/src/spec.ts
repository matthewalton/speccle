/**
 * spec.md parsing, written once and shared by lint and the oracle-strength
 * heatmap (ADR-0002). The format is docs/convention.md.
 */

/** A feature key: `[A-Z][A-Z0-9]{1,9}`, unique across the repo. */
export const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** A well-formed bracketed criterion id token, e.g. `[CHECKOUT-1]`. */
const ID_TOKEN = /^\[([A-Z][A-Z0-9]{1,9})-([1-9][0-9]*)\]$/;

export interface SpecKey {
  /** The declared value, verbatim (unquoted). */
  raw: string;
  /** 1-based line of the `key:` declaration. */
  line: number;
  /** Whether raw matches KEY_PATTERN. */
  valid: boolean;
}

export interface WellFormedCriterion {
  wellFormed: true;
  /** `KEY-n`, without brackets. */
  id: string;
  key: string;
  n: number;
  /** Heading text after the token; may be empty. */
  statement: string;
  /** 1-based line of the H2 heading. */
  line: number;
  /** Full heading text after `## `. */
  heading: string;
}

export interface MalformedCriterion {
  wellFormed: false;
  line: number;
  heading: string;
}

export type Criterion = WellFormedCriterion | MalformedCriterion;

export interface ParsedSpec {
  /** Path as given by the caller (relative, posix). */
  file: string;
  /** The frontmatter key declaration; undefined when absent entirely. */
  key: SpecKey | undefined;
  /** Every H2 in document order — criteria per convention rule 5. */
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
        id: `${id[1]}-${id[2]}`,
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
