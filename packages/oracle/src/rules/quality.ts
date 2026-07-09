import type { ParsedSpec, WellFormedCriterion } from "../spec.ts";
import type { Violation } from "../violation.ts";

/** Quality rules judge the heading statement only — the body is never linted (ADR-0007). */
export function qualityRules(specs: ParsedSpec[]): Violation[] {
  const out: Violation[] = [];
  for (const spec of specs) {
    for (const c of spec.criteria) {
      if (!c.wellFormed || c.statement === "") continue;
      out.push(...weaselWording(spec, c), ...compoundCriterion(spec, c), ...unmeasurable(spec, c));
    }
  }
  return out;
}

/** Contract, not config: extending this list means changing docs/convention.md. */
export const WEASEL_TERMS: readonly string[] = [
  "should",
  "appropriately",
  "properly",
  "correctly",
  "gracefully",
  "seamlessly",
  "efficiently",
  "effectively",
  "robust",
  "robustly",
  "reasonable",
  "reasonably",
  "adequate",
  "adequately",
  "sufficient",
  "sufficiently",
  "fast",
  "quickly",
  "performant",
  "user-friendly",
  "intuitive",
  "easy",
  "easily",
  "simple",
  "simply",
  "flexible",
  "sane",
  "sensible",
  "as needed",
  "as appropriate",
  "as expected",
  "if necessary",
  "if needed",
  "when possible",
  "where applicable",
  "etc",
  "and so on",
  "works well",
];

const WEASEL_MATCHERS = WEASEL_TERMS.map((term) => ({
  term,
  regex: wordBoundaryRegex(term),
}));

function weaselWording(spec: ParsedSpec, c: WellFormedCriterion): Violation[] {
  const target = stripCodeSpans(c.statement);
  return WEASEL_MATCHERS.filter(({ regex }) => regex.test(target)).map(({ term }) => ({
    rule: "weasel-wording" as const,
    file: spec.file,
    line: c.line,
    message: `weasel wording: "${term}"`,
  }));
}

/** A bare "and"/"or" never flags — a compound noun phrase names one thing. */
const COMPOUND_SIGNALS: readonly {
  regex: RegExp;
  message: (match: RegExpExecArray) => string;
}[] = [
  { regex: /;/, message: () => "a semicolon joins independent clauses" },
  {
    regex: /,\s+(and|or)\b/i,
    message: (m) => `a comma before "${m[1]!.toLowerCase()}" joins independent clauses`,
  },
  {
    regex: /\b(and also|as well as)\b/i,
    message: (m) => `"${m[1]!.toLowerCase()}" joins independent clauses`,
  },
  { regex: /[.!?]\s+/, message: () => "a second sentence starts mid-statement" },
];

const ABBREVIATIONS = /\b(e\.g\.|i\.e\.|vs\.|etc\.)/gi;

function compoundCriterion(spec: ParsedSpec, c: WellFormedCriterion): Violation[] {
  const target = stripCodeSpans(c.statement).replace(ABBREVIATIONS, " ");
  for (const signal of COMPOUND_SIGNALS) {
    const match = signal.regex.exec(target);
    if (match) {
      return [
        {
          rule: "compound-criterion",
          file: spec.file,
          line: c.line,
          message: `compound criterion: ${signal.message(match)}`,
        },
      ];
    }
  }
  return [];
}

export const OUTCOME_VERBS: readonly string[] = [
  "returns",
  "emits",
  "exits",
  "throws",
  "rejects",
  "resolves",
  "prints",
  "writes",
  "reads",
  "parses",
  "produces",
  "reports",
  "renders",
  "outputs",
  "fails",
  "passes",
  "flags",
  "marks",
  "treats",
  "ignores",
  "skips",
  "includes",
  "excludes",
  "omits",
  "contains",
  "equals",
  "matches",
  "sets",
  "records",
  "collects",
  "links",
  "strips",
  "maps",
  "counts",
  "normalises",
  "normalizes",
  "rounds",
  "sums",
  "totals",
  "computes",
  "shows",
  "displays",
  "hides",
  "sorts",
  "filters",
  "validates",
  "redirects",
  "sends",
  "saves",
  "stores",
  "loads",
  "creates",
  "updates",
  "deletes",
  "removes",
  "adds",
  "applies",
  "clears",
  "enables",
  "disables",
  "prompts",
  "increments",
  "decrements",
  "expires",
  "locks",
  "retries",
  "blocks",
  "allows",
  "denies",
  "requires",
  "defaults",
  "preserves",
  "retains",
  "keeps",
];

export const OUTCOME_COMPARATORS: readonly string[] = [
  "at least",
  "at most",
  "no more than",
  "more than",
  "fewer than",
  "less than",
  "exactly",
  "only when",
  "only if",
  "never",
  "always",
  "within",
  "empty",
  "non-empty",
  "null",
  "true",
  "false",
  "zero",
  "once",
  "unchanged",
];

const OUTCOME_MATCHERS = [...OUTCOME_VERBS, ...OUTCOME_COMPARATORS].map(wordBoundaryRegex);

const COPULA_LITERAL = /\b(is|are)\s+[`"']/i;

const QUANTITY = /\d|%/;

function unmeasurable(spec: ParsedSpec, c: WellFormedCriterion): Violation[] {
  const target = stripCodeSpans(c.statement);
  const measurable =
    OUTCOME_MATCHERS.some((regex) => regex.test(target)) ||
    COPULA_LITERAL.test(c.statement) ||
    QUANTITY.test(target);
  if (measurable) return [];
  return [
    {
      rule: "unmeasurable",
      file: spec.file,
      line: c.line,
      message: "no measurable outcome: expected an outcome verb, a comparator, or a quantity",
    },
  ];
}

function stripCodeSpans(text: string): string {
  return text.replace(/`[^`]*`/g, " ");
}

function wordBoundaryRegex(term: string): RegExp {
  return new RegExp(`\\b${term.replace(/[-\s]/g, "[-\\s]")}\\b`, "i");
}
