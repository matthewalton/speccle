import type { ParsedSpec, WellFormedCriterion } from "../../spec.ts";
import type { Violation } from "../../violation.ts";

export function structuralRules(specs: ParsedSpec[]): Violation[] {
  return [
    ...missingKey(specs),
    ...keyCollision(specs),
    ...keyMismatch(specs),
    ...malformedId(specs),
    ...duplicateId(specs),
    ...emptyStatement(specs),
  ];
}

function missingKey(specs: ParsedSpec[]): Violation[] {
  return specs.flatMap((spec) => {
    if (spec.key === undefined) {
      return [
        {
          rule: "missing-key" as const,
          file: spec.file,
          line: 1,
          message: 'frontmatter "key" is missing',
        },
      ];
    }
    if (!spec.key.valid) {
      return [
        {
          rule: "missing-key" as const,
          file: spec.file,
          line: spec.key.line,
          message: `frontmatter key "${spec.key.raw}" is malformed: expected [A-Z][A-Z0-9]{1,9}`,
        },
      ];
    }
    return [];
  });
}

function keyCollision(specs: ParsedSpec[]): Violation[] {
  const byKey = new Map<string, ParsedSpec[]>();
  for (const spec of specs) {
    if (spec.key?.valid) {
      const group = byKey.get(spec.key.raw) ?? [];
      group.push(spec);
      byKey.set(spec.key.raw, group);
    }
  }
  const out: Violation[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    for (const spec of group) {
      const others = group.filter((s) => s !== spec).map((s) => s.file);
      out.push({
        rule: "key-collision",
        file: spec.file,
        line: spec.key!.line,
        message: `feature key "${key}" is also declared in ${others.join(", ")}`,
      });
    }
  }
  return out;
}

function keyMismatch(specs: ParsedSpec[]): Violation[] {
  return specs.flatMap((spec) => {
    if (!spec.key?.valid) return [];
    const declared = spec.key.raw;
    return wellFormed(spec)
      .filter((c) => c.key !== declared)
      .map((c) => ({
        rule: "key-mismatch" as const,
        file: spec.file,
        line: c.line,
        message: `criterion id [${c.id}] does not match the feature key "${declared}"`,
      }));
  });
}

function malformedId(specs: ParsedSpec[]): Violation[] {
  return specs.flatMap((spec) =>
    spec.criteria
      .filter((c) => !c.wellFormed)
      .map((c) => ({
        rule: "malformed-id" as const,
        file: spec.file,
        line: c.line,
        message: `H2 "${c.heading}" has no well-formed [KEY-n] token`,
      })),
  );
}

function duplicateId(specs: ParsedSpec[]): Violation[] {
  const firstSeen = new Map<string, { file: string; line: number }>();
  const out: Violation[] = [];
  for (const spec of specs) {
    for (const c of wellFormed(spec)) {
      const first = firstSeen.get(c.id);
      if (first === undefined) {
        firstSeen.set(c.id, { file: spec.file, line: c.line });
      } else {
        out.push({
          rule: "duplicate-id",
          file: spec.file,
          line: c.line,
          message: `criterion id [${c.id}] is already used at ${first.file}:${first.line}`,
        });
      }
    }
  }
  return out;
}

function emptyStatement(specs: ParsedSpec[]): Violation[] {
  return specs.flatMap((spec) =>
    wellFormed(spec)
      .filter((c) => c.statement === "")
      .map((c) => ({
        rule: "empty-statement" as const,
        file: spec.file,
        line: c.line,
        message: `criterion [${c.id}] has a token but no statement`,
      })),
  );
}

function wellFormed(spec: ParsedSpec): WellFormedCriterion[] {
  return spec.criteria.filter((c) => c.wellFormed);
}
