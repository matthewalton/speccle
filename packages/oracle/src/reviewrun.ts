import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { messageOf } from "./changeset.ts";
import { commentBody, type Finding } from "./finding.ts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asUnknown,
  errorText,
  type FetchLike,
  type GithubClient,
  githubClient,
  pullRequest,
  resolveRepo,
  resolveToken,
  REVIEW_MARKER,
} from "./github.ts";
import { LENSES_DIR, TEMPLATE_LENS } from "./lenses.ts";
import { REMEDY_ROUTES } from "./remedy.ts";
import { risk, type RiskReport } from "./risk.ts";

/**
 * The CI driver's runner: the one module in this package that calls a model (ADR-0047). Every
 * other command here is deterministic, and the boundary is worth keeping visible — the Anthropic
 * API is reached from here and nowhere else, and nothing imports this module to reach it. What
 * `review findings` shares with this is the GitHub seam and the comment format, which is why
 * both live outside it.
 *
 * It finds and comments. It never edits the tree, never commits, and never pushes: a fix has to
 * pass the checks-gate and be revertible, which is the local driver's job, not CI's (ADR-0051).
 */

/** The lens that decides fix authority rather than reporting findings — never part of the panel. */
const RISK_LENS = "risk.md";

/** An unauthored house-conventions lens carries this; running it would report nothing. */
const TEMPLATE_MARKER = "speccle:lens-template";

/** The ladder the lenses themselves name — a driver that offered its own would contradict the brief. */
const SEVERITIES = ["blocker", "major", "minor", "nit"] as const;

/** Per-PR cost is why this driver is opt-in, so the default is the cheaper capable model. */
const DEFAULT_MODEL = "claude-sonnet-5";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Caps on the diff handed to a lens. A generated lockfile teaches a lens nothing and would
 * crowd out the code, so a single oversized patch is dropped rather than truncated mid-hunk.
 * Whatever is dropped is named in the summary — a silent cap reads as full coverage.
 */
const MAX_FILE_PATCH_BYTES = 24_000;
const MAX_TOTAL_PATCH_BYTES = 160_000;
const MAX_FILE_PAGES = 10;

export interface ReviewRunOptions {
  /** The pull request to review. */
  pr: number;
  /** `owner/name`; defaults to `GITHUB_REPOSITORY`, which Actions always sets. */
  repo?: string;
  /** The base ref for the risk verdict's change set; defaults to `origin/<the PR's base>`. */
  base?: string;
  /** Post again even when this driver already reviewed the PR — the `@review` rerun. */
  force?: boolean;
  model?: string;
  /** Report what would be posted without posting it. */
  dryRun?: boolean;
  apiKey?: string;
  githubToken?: string;
  /** Injected in tests; defaults to the global. */
  fetch?: FetchLike;
}

/** A finding placed on a line GitHub will accept a comment on. */
export interface ReviewComment {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
}

/** A changed file and the patch the lenses read, or the reason it carries none. */
export interface ChangedFile {
  path: string;
  patch?: string;
}

export interface Skip {
  name: string;
  reason: string;
}

export interface ReviewRunReport {
  repo: string;
  pr: number;
  headSha: string;
  base: string;
  /** Every lens that ran, with what it found. */
  lenses: { name: string; findings: number }[];
  /** Lenses that did not run, and files dropped from the diff — both with reasons. */
  skippedLenses: Skip[];
  skippedFiles: Skip[];
  findings: Finding[];
  /** Findings that anchored to a changed line. */
  comments: number;
  /** Findings that could not anchor, carried in the summary instead of being lost. */
  unplaced: number;
  /** The deterministic verdict, or null when it could not be computed (no git history). */
  risk: RiskReport | null;
  outcome: "posted" | "already-reviewed" | "dry-run";
}

export async function reviewRun(
  target: string,
  options: ReviewRunOptions,
): Promise<ReviewRunReport> {
  const root = resolve(target);
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const repo = resolveRepo(root, options.repo);
  const token = resolveToken(options.githubToken);
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      "no ANTHROPIC_API_KEY — the CI driver calls a model, so it needs a metered key as a repo secret",
    );
  }
  const github = githubClient(doFetch, token);

  const pull = await pullRequest(github, repo, options.pr);
  const base = options.base ?? `origin/${pull.base}`;

  // Recognise our own earlier review before spending a token on a second one. The rerun path
  // sets --force, which is the only way past this.
  if (options.force !== true && (await alreadyReviewed(github, repo, options.pr))) {
    return {
      repo,
      pr: options.pr,
      headSha: pull.headSha,
      base,
      lenses: [],
      skippedLenses: [],
      skippedFiles: [],
      findings: [],
      comments: 0,
      unplaced: 0,
      risk: null,
      outcome: "already-reviewed",
    };
  }

  // Two diff sources, each the right one for its job. The lenses read the patches the API
  // reports, because those are the hunks GitHub validates an inline comment's line against —
  // anchoring off a locally-computed diff invites a 422. `risk` reads the local git range,
  // because its signals need the spec files' content, not just their names.
  const { files, skipped: skippedFiles, truncated } = await changedFiles(github, repo, options.pr);
  const diff = renderDiff(files);
  if (truncated) {
    skippedFiles.push({ name: `beyond ${MAX_FILE_PAGES * 100} files`, reason: "file-count cap" });
  }

  const { lenses, skipped: skippedLenses } = await panel(root);
  const findings: Finding[] = [];
  const ran: { name: string; findings: number }[] = [];
  for (const lens of lenses) {
    try {
      const found = await applyLens(doFetch, apiKey, options.model, lens, diff);
      findings.push(...found);
      ran.push({ name: lens.name, findings: found.length });
    } catch (err) {
      // A model or network failure must not lose the rest of the panel, and must not take the
      // risk gate down with it: the verdict is deterministic and has to survive a bad API day.
      skippedLenses.push({ name: lens.name, reason: messageOf(err) });
    }
  }

  const verdict = await riskVerdict(root, base);
  const { comments, unplaced } = normalise(findings, files);
  const shared = {
    verdict,
    base,
    pr: options.pr,
    ran,
    skippedLenses,
    skippedFiles,
    findings,
    headSha: pull.headSha,
  };
  const summary = renderSummary({ ...shared, unplaced });
  // The fallback body has to name every finding, not just the unplaced ones: an anchored finding
  // exists only in its inline comment, and those are exactly what a rejected review loses.
  const unanchored = renderSummary({ ...shared, unplaced: findings, anchorsRejected: true });

  const outcome = options.dryRun === true ? "dry-run" : "posted";
  if (options.dryRun !== true) {
    await postReview(github, repo, options.pr, pull.headSha, summary, comments, unanchored);
  }

  return {
    repo,
    pr: options.pr,
    headSha: pull.headSha,
    base,
    lenses: ran,
    skippedLenses,
    skippedFiles,
    findings,
    comments: comments.length,
    unplaced: unplaced.length,
    risk: verdict,
    outcome,
  };
}

/** The panel: every lens but the two the local driver skips for the same reasons (ADR-0043). */
export async function panel(root: string): Promise<{ lenses: Lens[]; skipped: Skip[] }> {
  const dir = join(root, LENSES_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(
      `no ${LENSES_DIR}/ — this repo was never initialized for review; run \`speccle init\``,
    );
  }

  const lenses: Lens[] = [];
  const skipped: Skip[] = [];
  for (const name of entries.filter((entry) => entry.endsWith(".md")).sort()) {
    if (name === RISK_LENS) {
      skipped.push({ name, reason: "escalates fix authority, not a finding lens" });
      continue;
    }
    const body = await readFile(join(dir, name), "utf8");
    if (name === TEMPLATE_LENS && body.includes(TEMPLATE_MARKER)) {
      // No em dash: both renderers join a skip to its reason with one, and two reads as a typo.
      skipped.push({
        name,
        reason: "still the shipped template, which this repo has not authored",
      });
      continue;
    }
    lenses.push({ name, body });
  }
  return { lenses, skipped };
}

export interface Lens {
  name: string;
  body: string;
}

/** Runs one lens over the change set, with the reported shape forced by a tool schema. */
async function applyLens(
  doFetch: FetchLike,
  apiKey: string,
  model: string | undefined,
  lens: Lens,
  diff: string,
): Promise<Finding[]> {
  const response = await doFetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: model ?? process.env.SPECCLE_REVIEW_MODEL ?? DEFAULT_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      // Forcing the tool is what makes the shape reliable; asking for JSON in prose does not.
      tools: [reportTool()],
      tool_choice: { type: "tool", name: REPORT_TOOL_NAME },
      messages: [{ role: "user", content: lensPrompt(lens, diff) }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API ${String(response.status)}: ${await errorText(response)}`);
  }
  return findingsFrom(asUnknown(await response.json()), lens.name);
}

const SYSTEM_PROMPT = `You are one lens in a code review panel. The lens below is your whole brief:
adopt its stance, look only for what it names, and report at its bar. Every finding must anchor to
a line the change set actually touched — you are reviewing a change, not auditing a repository.
Report nothing rather than padding: an empty list is the common, correct result. Report through the
report_findings tool.

Your reader did not write this change and is meeting the code for the first time. Trace each claim
against the code path before you write it — a finding that mis-describes the failure is worse than
none, because it is confidently wrong. Then lead with the consequence in plain words and leave the
mechanism to the sentence after, and keep the prose proportional to the severity you gave it.`;

export function lensPrompt(lens: Lens, diff: string): string {
  return `# Your lens

${lens.body}

# The change set

${diff}`;
}

const REPORT_TOOL_NAME = "report_findings";

function reportTool(): unknown {
  return {
    name: REPORT_TOOL_NAME,
    description: "Report every finding, or an empty list when the change set breaches nothing.",
    input_schema: {
      type: "object",
      properties: {
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Repo-relative path of the changed file." },
              line: {
                type: "integer",
                description:
                  "The line as numbered after the change for RIGHT, before it for LEFT. It must be a line this change set touched.",
              },
              side: {
                type: "string",
                enum: ["RIGHT", "LEFT"],
                description: "RIGHT for the changed file as it now reads; LEFT for a removed line.",
              },
              severity: {
                type: "string",
                enum: [...SEVERITIES],
                description: "The lens's ladder. Use the rungs the lens names and no others.",
              },
              what: {
                type: "string",
                description:
                  "What breaks, in one plain sentence someone who did not write the change can act on. Lead with the consequence, never the mechanism.",
              },
              why: {
                type: "string",
                description:
                  "When it breaks: the input, state, or caller that triggers it, and what actually happens then — throws, returns the wrong value, passes silently. A nit or minor gets a sentence or two; only a blocker or major earns a paragraph.",
              },
              fix: { type: "string", description: "The one correct fix, in a line." },
              remedy: {
                type: "string",
                enum: [...REMEDY_ROUTES],
                description:
                  "The durable artefact that would stop this class recurring: a deterministic check, an acceptance criterion, a sharpened lens, or none for a genuine one-off.",
              },
            },
            required: ["path", "line", "side", "severity", "what", "why", "fix", "remedy"],
          },
        },
      },
      required: ["findings"],
    },
  };
}

/** The findings out of a Messages response's forced tool call; a malformed entry is dropped. */
export function findingsFrom(body: unknown, lens: string): Finding[] {
  const content = asArray(asRecord(body)?.content) ?? [];
  const findings: Finding[] = [];
  for (const block of content) {
    const record = asRecord(block);
    if (record?.type !== "tool_use" || record.name !== REPORT_TOOL_NAME) continue;
    for (const raw of asArray(asRecord(record.input)?.findings) ?? []) {
      const finding = asFinding(raw, lens);
      if (finding !== undefined) findings.push(finding);
    }
  }
  return findings;
}

function asFinding(raw: unknown, lens: string): Finding | undefined {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const path = asString(record.path);
  const line = asNumber(record.line);
  const what = asString(record.what);
  if (path === undefined || line === undefined || what === undefined) return undefined;
  return {
    lens,
    path,
    line,
    side: record.side === "LEFT" ? "LEFT" : "RIGHT",
    severity: asString(record.severity) ?? "minor",
    what,
    why: asString(record.why) ?? "",
    fix: asString(record.fix) ?? "",
    remedy: asString(record.remedy) ?? "none",
  };
}

/**
 * Splits findings into inline comments and unplaced ones. GitHub rejects the whole review if any
 * comment names a line outside the diff, so a finding that cannot anchor moves to the summary —
 * dropping it would lose a real finding to a formatting rule.
 */
export function normalise(
  findings: Finding[],
  files: ChangedFile[],
): { comments: ReviewComment[]; unplaced: Finding[] } {
  const anchors = new Map(files.map((file) => [file.path, anchorableLines(file.patch ?? "")]));
  const comments: ReviewComment[] = [];
  const unplaced: Finding[] = [];
  for (const finding of findings) {
    const lines = anchors.get(finding.path);
    const side = finding.side === "LEFT" ? lines?.left : lines?.right;
    if (side?.has(finding.line) === true) {
      comments.push({
        path: finding.path,
        line: finding.line,
        side: finding.side,
        body: commentBody(finding),
      });
    } else unplaced.push(finding);
  }
  return { comments, unplaced };
}

/** The lines of a unified patch a comment may anchor to, by side. */
export function anchorableLines(patch: string): { left: Set<number>; right: Set<number> } {
  const left = new Set<number>();
  const right = new Set<number>();
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk !== null) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file" — not a line of content.
    if (line.startsWith("+")) right.add(newLine++);
    else if (line.startsWith("-")) left.add(oldLine++);
    else if (line.startsWith(" ")) {
      left.add(oldLine++);
      right.add(newLine++);
    }
  }
  return { left, right };
}

interface SummaryInput {
  verdict: RiskReport | null;
  base: string;
  /** The pull request under review — the footer names it in the command it hands back. */
  pr: number;
  ran: { name: string; findings: number }[];
  skippedLenses: Skip[];
  skippedFiles: Skip[];
  /** Every finding the panel reported, anchored or not — what the banner and the table count. */
  findings: Finding[];
  /** Findings the body has to carry itself, because no inline comment will. */
  unplaced: Finding[];
  headSha: string;
  /** GitHub rejected the anchors, so `unplaced` is every finding and the body says why. */
  anchorsRejected?: boolean;
}

const SPECCLE_URL = "https://github.com/matthewalton/speccle";

/**
 * The comment posts with `GITHUB_TOKEN`, so GitHub bills it to `github-actions[bot]` whatever the
 * body says — the body is the only place an identity can live. The badge is a plain image rather
 * than a committed logo because the repo's marks are SVG, and GitHub serves raw SVG as
 * `text/plain`, which its image proxy will not render. Alt text is the identity too: a blocked or
 * unreachable image degrades to exactly the heading this replaced.
 */
const HEADER = `## ![Speccle](https://img.shields.io/badge/Speccle-8250df?style=flat-square) review`;

/**
 * The review body. Two questions decide whether a reader reads any further — did it pass, and
 * where do I look — so both are answered in the banner, above everything else. What matters on
 * the third read and not the first (the score's evidence, what was skipped and why) sits behind
 * `<details>`, except when the gate fired: then the evidence is the point, and it opens.
 */
export function renderSummary(input: SummaryInput): string {
  const lines = [HEADER, "", ...banner(input), ""];
  lines.push(...lensTable(input), ...unplacedList(input), ...riskDetail(input));

  // Announce every cap: silence would read as full coverage of a change set that was trimmed.
  // The count rides in the <summary>, which stays visible however the block is collapsed.
  for (const [label, skips] of [
    ["Lenses skipped", input.skippedLenses],
    ["Files not reviewed", input.skippedFiles],
  ] as const) {
    if (skips.length === 0) continue;
    lines.push("<details>", `<summary>${label} (${String(skips.length)})</summary>`, "");
    for (const skip of skips) lines.push(`- \`${skip.name}\` — ${skip.reason}`);
    lines.push("", "</details>", "");
  }

  lines.push(
    ...nextStep(input),
    `<sub>[Speccle](${SPECCLE_URL}) · ${input.headSha.slice(0, 7)} · comment \`@review\` to run again</sub>`,
    REVIEW_MARKER,
  );
  return lines.join("\n");
}

/**
 * The last thing read, and the only instruction the comment gives. A reader who did not build
 * Speccle cannot derive their move from a statement of policy, so this names the command and
 * branches on the authority the gate already decided: below the threshold that command fixes and
 * pushes; at or above it the same command reports and records, and only a human moves. It branches
 * on `humanRequired` alone — a blocker raises the banner without touching fix authority, so
 * treating one as a stop would promise a reader behaviour the local driver does not have.
 *
 * The command is unnamespaced because the repos that receive this comment vendor their skills:
 * CI can only review a repo carrying `.speccle/lenses/`, which is `speccle init`'s doing, and the
 * same run materializes the skills project-level.
 */
function nextStep(input: SummaryInput): string[] {
  const command = `\`/review --pr ${String(input.pr)}\``;
  const lead =
    input.verdict?.humanRequired === true
      ? `**Next step — a human.** The risk gate fired, so nothing here gets fixed for you: ${command} reports these findings and records the change without touching the code.`
      : input.findings.length === 0
        ? `**Next step** — nothing to fix. ${command} still records this change against the review threshold.`
        : `**Next step** — ${command}. It reads these findings, fixes them, re-runs the checks-gate, reverts any fix that goes red, then commits and pushes what survived.`;

  // The verdict the threshold moves on is the human's, and no run can compute it — a threshold
  // that rose on a guess is worse than one that never rose, so the comment asks for it by name.
  return [
    lead,
    "",
    `<sub>It asks you the one thing this run cannot know — did this change **need** a human? The review threshold only moves on that answer.</sub>`,
    "",
  ];
}

/**
 * The verdict, in one line a reader cannot miss. The alert level is the loudest signal on the
 * page, so it tracks the two things that stop a merge: the gate firing, and a blocker.
 */
function banner(input: SummaryInput): string[] {
  const verdict = input.verdict;
  const blocking =
    verdict?.humanRequired === true ||
    input.findings.some((finding) => finding.severity === "blocker");
  const alert = blocking ? "CAUTION" : input.findings.length > 0 ? "WARNING" : "TIP";

  const found =
    input.findings.length === 0
      ? `**No findings** across ${plural(input.ran.length, "lens", "lenses")}`
      : `**${plural(input.findings.length, "finding")}** — ${tally(input.findings)}`;

  const gate =
    verdict === null
      ? `risk not computed`
      : `risk \`${bar(verdict.score, verdict.threshold)}\` **${String(verdict.score)} of ${String(verdict.threshold)}**, ${
          verdict.humanRequired ? "**a human is required**" : "below the review threshold"
        }`;

  return [`> [!${alert}]`, `> ${found} · ${gate}.`];
}

/** Only the lenses that fired get a row; the rest collapse to one line, which is the point. */
function lensTable(input: SummaryInput): string[] {
  const byLens = new Map<string, Finding[]>();
  for (const finding of input.findings) {
    byLens.set(finding.lens, [...(byLens.get(finding.lens) ?? []), finding]);
  }

  const lines: string[] = [];
  const fired = input.ran.filter((lens) => lens.findings > 0);
  if (fired.length > 0) {
    lines.push("| Lens | Findings |", "| --- | --- |");
    for (const lens of fired) {
      lines.push(`| \`${lens.name}\` | ${tally(byLens.get(lens.name) ?? [])} |`);
    }
    lines.push("");
  }

  const clean = input.ran.filter((lens) => lens.findings === 0);
  if (clean.length > 0) {
    const names = clean.map((lens) => `\`${lens.name}\``).join(", ");
    lines.push(`<sub>${plural(clean.length, "lens", "lenses")} clean: ${names}</sub>`, "");
  }
  return lines;
}

/** Findings no inline comment will carry — actionable, so they stay above the fold. */
function unplacedList(input: SummaryInput): string[] {
  if (input.unplaced.length === 0) return [];
  const lines = [
    input.anchorsRejected === true
      ? "**Findings in full** — GitHub rejected the inline anchors on this review, so every finding is here instead:"
      : "**Unplaced findings** — these could not anchor to a line in the diff, so they are here rather than lost:",
    "",
  ];
  // The severity rides along because this bullet is the whole record of a finding no inline
  // comment could carry — `review findings` reads it back, and untriaged is unactionable. Its
  // exact shape is that parser's contract: change it there in the same breath, or lose findings.
  for (const finding of input.unplaced) {
    lines.push(
      `- \`${finding.path}:${String(finding.line)}\` (${finding.lens} · ${finding.severity}) — ${finding.what}`,
    );
  }
  lines.push("");
  return lines;
}

/** The score's evidence: collapsed while it is trivia, open the moment it decides something. */
function riskDetail(input: SummaryInput): string[] {
  const verdict = input.verdict;
  if (verdict === null) {
    return [`Risk — not computed: no shared history with \`${input.base}\`.`, ""];
  }

  const lines = [
    verdict.humanRequired ? "<details open>" : "<details>",
    `<summary>Risk ${String(verdict.score)} of ${String(verdict.threshold)} — ${plural(verdict.signals.length, "signal")}</summary>`,
    "",
  ];
  if (verdict.signals.length > 0) {
    lines.push("| Signal | Weight | Evidence |", "| --- | --- | --- |");
    for (const signal of verdict.signals) {
      const evidence = cell(`${signal.reason}: ${signal.evidence.join(", ")}`);
      lines.push(`| \`${signal.id}\` | +${String(signal.weight)} | ${evidence} |`);
    }
    lines.push("");
  }
  lines.push(
    "This score is a floor. Escalating it is free; only a human lowers it, and only on calibration evidence.",
    "",
    "</details>",
    "",
  );
  return lines;
}

/** The rungs as glyphs, so a severity is scannable before it is read. */
const SEVERITY_GLYPHS: Record<string, string> = {
  blocker: "🔴",
  major: "🟠",
  minor: "🔵",
  nit: "⚪",
};

/** A lens can report off its own ladder; the count still has to render, and stay distinguishable. */
const OFF_LADDER_GLYPH = "⚫";

/** `🔴 1 blocker · 🟠 2 major` — worst first, whatever order the findings arrived in. */
function tally(findings: Finding[]): string {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }
  const rank = (severity: string): number => {
    const at = SEVERITIES.indexOf(severity as (typeof SEVERITIES)[number]);
    return at === -1 ? SEVERITIES.length : at;
  };
  return [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([severity, count]) => {
      const glyph = SEVERITY_GLYPHS[severity] ?? OFF_LADDER_GLYPH;
      return `${glyph} ${String(count)} ${severity}`;
    })
    .join(" · ");
}

/**
 * How close the score sits to the gate, at a glance. The track is the threshold, not the score,
 * so the gauge is the same width across every review of a repo and a full bar always means the
 * same thing: it fired. How far past the gate a score went is the number's job, not the bar's.
 */
function bar(score: number, threshold: number): string {
  const track = Math.min(Math.max(threshold, 1), 10);
  const filled = Math.min(Math.max(score, 0), track);
  return "▓".repeat(filled) + "░".repeat(track - filled);
}

/** A repo authors its own signal messages, and a stray `|` would split the row it lands in. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** The deterministic verdict, or null when git cannot measure the range (a shallow clone). */
async function riskVerdict(root: string, base: string): Promise<RiskReport | null> {
  try {
    return await risk(root, { base });
  } catch {
    return null;
  }
}

/** Whether this driver already reviewed the PR — recognised by the marker it leaves. */
async function alreadyReviewed(github: GithubClient, repo: string, pr: number): Promise<boolean> {
  const reviews = asArray(
    await github.get(`/repos/${repo}/pulls/${String(pr)}/reviews?per_page=100`),
  );
  return (reviews ?? []).some((review) =>
    (asString(asRecord(review)?.body) ?? "").includes(REVIEW_MARKER),
  );
}

async function changedFiles(
  github: GithubClient,
  repo: string,
  pr: number,
): Promise<{ files: ChangedFile[]; skipped: Skip[]; truncated: boolean }> {
  const files: ChangedFile[] = [];
  const skipped: Skip[] = [];
  let budget = MAX_TOTAL_PATCH_BYTES;
  let truncated = false;

  for (let page = 1; page <= MAX_FILE_PAGES; page++) {
    const path = `/repos/${repo}/pulls/${String(pr)}/files?per_page=100&page=${String(page)}`;
    const batch = asArray(await github.get(path)) ?? [];
    for (const entry of batch) {
      const record = asRecord(entry);
      const filename = asString(record?.filename);
      if (filename === undefined) continue;
      const patch = asString(record?.patch);
      if (patch === undefined) {
        skipped.push({
          name: filename,
          reason: "no textual patch (binary or too large for the API)",
        });
        continue;
      }
      if (patch.length > MAX_FILE_PATCH_BYTES) {
        skipped.push({
          name: filename,
          reason: `patch over ${String(MAX_FILE_PATCH_BYTES)} bytes`,
        });
        continue;
      }
      if (patch.length > budget) {
        skipped.push({ name: filename, reason: "change-set size cap reached" });
        continue;
      }
      budget -= patch.length;
      files.push({ path: filename, patch });
    }
    if (batch.length < 100) return { files, skipped, truncated };
    truncated = page === MAX_FILE_PAGES;
  }
  return { files, skipped, truncated };
}

export function renderDiff(files: ChangedFile[]): string {
  return files.map((file) => `--- ${file.path}\n${file.patch ?? ""}`).join("\n\n");
}

/**
 * One review, with the inline comments attached. A 422 means GitHub rejected an anchor — it
 * validates every comment's line against the diff and refuses the whole review over one bad
 * one — so the retry carries the findings in the body instead of losing them to a line number.
 */
async function postReview(
  github: GithubClient,
  repo: string,
  pr: number,
  headSha: string,
  summary: string,
  comments: ReviewComment[],
  unanchored: string,
): Promise<void> {
  const path = `/repos/${repo}/pulls/${String(pr)}/reviews`;
  const review = { commit_id: headSha, body: summary, event: "COMMENT", comments };
  const first = await github.post(path, review);
  if (first.ok) return;
  if (first.status !== 422 || comments.length === 0) {
    throw new Error(`GitHub API ${String(first.status)} posting the review: ${first.text}`);
  }

  const retry = await github.post(path, {
    commit_id: headSha,
    body: unanchored,
    event: "COMMENT",
  });
  if (!retry.ok) {
    throw new Error(`GitHub API ${String(retry.status)} posting the review: ${retry.text}`);
  }
}
