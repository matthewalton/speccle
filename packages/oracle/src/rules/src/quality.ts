import type { ParsedSpec, WellFormedCriterion } from "../../spec.ts";
import type { Violation } from "../../violation.ts";

/** Quality rules judge the heading statement only — the body is never linted (ADR-0007). */
export function qualityRules(specs: ParsedSpec[]): Violation[] {
  const out: Violation[] = [];
  for (const spec of specs) {
    for (const c of spec.criteria) {
      if (!c.wellFormed) continue;
      // Stryker disable next-line all: an empty statement yields no quality violation; the skip only saves work
      if (c.statement === "") continue;
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

/** One bare "and"/"or" never flags — a compound noun phrase names one thing. */
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
  // \s, not \s+: .test() treats them identically and \s+ leaves an unkillable mutant
  { regex: /[.!?]\s/, message: () => "a second sentence starts mid-statement" },
];

const ABBREVIATIONS = /\b(e\.g\.|i\.e\.|vs\.|etc\.)/gi;

const BARE_CONJUNCTION = /\b(and|or)\b/gi;

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
  const second = secondBareConjunction(target);
  if (second !== null) {
    return [
      {
        rule: "compound-criterion",
        file: spec.file,
        line: c.line,
        message: `compound criterion: a second bare "${second}" joins another clause`,
      },
    ];
  }
  return [];
}

/** Two bare conjunctions in the main clause read as a list of behaviours. Conjunctions
 *  inside a condition ("when the card is expired and the retry limit is reached")
 *  qualify one outcome and are not counted. */
function secondBareConjunction(target: string): string | null {
  const mainClause = target.split(SUBORDINATOR)[0] ?? "";
  // Stryker disable next-line ArrayDeclaration: the fallback is read only for its length, and a planted element still leaves it under two
  const conjunctions = mainClause.match(BARE_CONJUNCTION) ?? [];
  return conjunctions.length >= 2 ? conjunctions[1]!.toLowerCase() : null;
}

/**
 * Predicates that name activity without naming an outcome. Contract, not config: this is
 * the whole of what `unmeasurable` knows, so the rule under-flags rather than gatekeeping
 * a spec's vocabulary — an unrecognised domain verb ("a refund credits the customer") is
 * measurable and passes.
 */
export const VACUOUS_PREDICATES: readonly string[] = [
  "is handled",
  "are handled",
  "is supported",
  "are supported",
  "is implemented",
  "are implemented",
  "is done",
  "are done",
  "is correct",
  "are correct",
  "is responsible for",
  "are responsible for",
  "works",
  "working",
  "behaves",
  "happens",
  "occurs",
  "handles",
  "supports",
  "deals with",
  "takes care of",
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

const VACUOUS_MATCHERS = VACUOUS_PREDICATES.map((predicate) => ({
  predicate,
  regex: wordBoundaryRegex(predicate),
}));

const COMPARATOR_MATCHERS = OUTCOME_COMPARATORS.map(wordBoundaryRegex);

const QUANTITY = /\d|%/;

const SUBORDINATOR = /\b(?:when|whenever|if|unless|after|before|while|until|once|given)\b/i;

/**
 * A trailing `is <adjective>` names a property. Lowercase-only: a capitalised word is a
 * literal ("the response is JSON"), as is a code span, which is stripped before matching.
 * An `-ed` word is a participle naming an outcome ("the order is cancelled").
 */
const COPULA_PROPERTY = /\b(?:is|are)\s+(?:not\s+)?([a-z][a-z-]*)\s*$/;

function unmeasurable(spec: ParsedSpec, c: WellFormedCriterion): Violation[] {
  const target = stripCodeSpans(c.statement);
  const vacuous = VACUOUS_MATCHERS.find(({ regex }) => regex.test(target));
  const message = vacuous
    ? `no measurable outcome: "${vacuous.predicate}" asserts nothing observable`
    : namesOnlyAProperty(target)
      ? "no measurable outcome: names a property, not an observable outcome"
      : null;
  if (message === null) return [];
  return [{ rule: "unmeasurable", file: spec.file, line: c.line, message }];
}

/** Only the main clause is judged — a copula inside a condition ("when the basket is large")
 *  qualifies an outcome asserted elsewhere in the statement. */
function namesOnlyAProperty(target: string): boolean {
  if (QUANTITY.test(target) || COMPARATOR_MATCHERS.some((regex) => regex.test(target))) {
    return false;
  }
  const mainClause = target.split(SUBORDINATOR)[0] ?? target;
  const match = COPULA_PROPERTY.exec(mainClause);
  return match !== null && !match[1]!.endsWith("ed");
}

function stripCodeSpans(text: string): string {
  return text.replace(/`[^`]*`/g, " ");
}

function wordBoundaryRegex(term: string): RegExp {
  return new RegExp(`\\b${term.replace(/[-\s]/g, "[-\\s]")}\\b`, "i");
}
