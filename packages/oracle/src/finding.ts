/**
 * What a lens reports, and the inline-comment format it travels in. The writer and its inverse
 * live together on purpose: `review findings` recovers a posted review by parsing what
 * `review run` wrote, so the two drifting apart would silently return findings with empty
 * fields. A round-trip test holds them to each other.
 */

/** One thing a lens reported, before anchoring decides whether it can be an inline comment. */
export interface Finding {
  lens: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  severity: string;
  what: string;
  why: string;
  fix: string;
  /** The prevention route the lens proposes — the same routes the remedy record holds. */
  remedy: string;
}

/** Everything a finding carries in its comment body — all of it but the line it anchors to. */
export type FindingBody = Omit<Finding, "path" | "line" | "side">;

const HEADLINE = /^\*\*(.+?)\*\* — ([\s\S]+)$/;
const FOOTER = /^_(.+) · proposed remedy: (.+)_$/;
const FIX_PREFIX = "**Fix**: ";

export function commentBody(finding: FindingBody): string {
  const lines = [`**${finding.severity}** — ${finding.what}`];
  if (finding.why !== "") lines.push("", finding.why);
  if (finding.fix !== "") lines.push("", `${FIX_PREFIX}${finding.fix}`);
  lines.push("", `_${finding.lens} · proposed remedy: ${finding.remedy}_`);
  return lines.join("\n");
}

/**
 * A comment back into the finding it was rendered from, or undefined when it was not rendered
 * by `commentBody` — a human's reply on the same review is a comment too, and it is not a
 * finding.
 */
export function parseCommentBody(body: string): FindingBody | undefined {
  const blocks = body.trim().split(/\n\s*\n/);
  if (blocks.length < 2) return undefined;

  const headline = HEADLINE.exec(blocks[0]?.trim() ?? "");
  const footer = FOOTER.exec(blocks[blocks.length - 1]?.trim() ?? "");
  if (headline === null || footer === null) return undefined;

  const middle = blocks.slice(1, -1);
  const fixAt = middle.findIndex((block) => block.startsWith(FIX_PREFIX));
  // Everything from the fix marker to the footer is the fix: it may run to several paragraphs,
  // and so may the why before it.
  const why = (fixAt === -1 ? middle : middle.slice(0, fixAt)).join("\n\n").trim();
  const fix = fixAt === -1 ? "" : middle.slice(fixAt).join("\n\n").slice(FIX_PREFIX.length).trim();

  return {
    severity: headline[1] ?? "",
    what: (headline[2] ?? "").trim(),
    why,
    fix,
    lens: footer[1] ?? "",
    remedy: footer[2] ?? "",
  };
}
