import { resolve } from "node:path";
import { type Finding, parseCommentBody } from "./finding.ts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  type FetchLike,
  type GithubClient,
  githubClient,
  pullRequest,
  resolveRepo,
  resolveToken,
  REVIEW_MARKER,
} from "./github.ts";

/**
 * Reads back the review the CI driver posted, so the local driver fixes the findings CI already
 * paid for instead of re-running the panel and reaching a second answer on the same commit
 * (ADR-0051). Deterministic: it calls GitHub, never a model.
 */

/** Enough pages for any review a panel realistically posts; past this the count is announced. */
const MAX_COMMENT_PAGES = 10;

/** A bullet from the summary body: the only record of a finding no inline comment could carry. */
const UNPLACED = /^- `(.+):(\d+)` \(([^)]+)\) — ([\s\S]+)$/;

export interface ReviewFindingsOptions {
  pr: number;
  /** `owner/name`; defaults to GITHUB_REPOSITORY, then the `origin` remote. */
  repo?: string;
  githubToken?: string;
  /** Injected in tests; defaults to the global. */
  fetch?: FetchLike;
}

export interface PostedFinding extends Finding {
  /**
   * Recovered from the summary body rather than an inline comment, so it carries no why, fix,
   * or remedy — the body never held them. Marked rather than silently thinned.
   */
  partial: boolean;
  /** Where to read it on the pull request. */
  url?: string;
}

export interface ReviewFindingsReport {
  repo: string;
  pr: number;
  /** The base ref the review's change set was measured against — what `risk` should be given. */
  base: string;
  /** The pull request's head now. */
  headSha: string;
  /** The head the review was written against; absent when no review was found. */
  reviewedSha?: string;
  reviewedAt?: string;
  reviewUrl?: string;
  /** The head moved after the review, so a finding's line may name code that no longer exists. */
  stale: boolean;
  findings: PostedFinding[];
  /** Comments the review carries that no lens wrote — a human's reply, left alone. */
  skippedComments: number;
  outcome: "found" | "no-findings" | "no-review";
}

export async function reviewFindings(
  target: string,
  options: ReviewFindingsOptions,
): Promise<ReviewFindingsReport> {
  const root = resolve(target);
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const repo = resolveRepo(root, options.repo);
  const github = githubClient(doFetch, resolveToken(options.githubToken));

  const pull = await pullRequest(github, repo, options.pr);
  const base = `origin/${pull.base}`;
  const review = await latestReview(github, repo, options.pr);
  if (review === undefined) {
    return {
      repo,
      pr: options.pr,
      base,
      headSha: pull.headSha,
      stale: false,
      findings: [],
      skippedComments: 0,
      outcome: "no-review",
    };
  }

  const { findings, skippedComments } = await inlineFindings(github, repo, options.pr, review.id);
  // The body's list is where a finding lands when GitHub rejects its anchor — and where every
  // finding lands when it rejects the whole review. Without it those are simply lost.
  const seen = new Set(findings.map(key));
  for (const found of unplacedFindings(review.body)) {
    if (!seen.has(key(found))) findings.push(found);
  }

  return {
    repo,
    pr: options.pr,
    base,
    headSha: pull.headSha,
    ...(review.commitId !== undefined && { reviewedSha: review.commitId }),
    ...(review.submittedAt !== undefined && { reviewedAt: review.submittedAt }),
    ...(review.url !== undefined && { reviewUrl: review.url }),
    stale: review.commitId !== undefined && review.commitId !== pull.headSha,
    findings,
    skippedComments,
    outcome: findings.length > 0 ? "found" : "no-findings",
  };
}

interface PostedReview {
  id: number;
  body: string;
  commitId?: string;
  submittedAt?: string;
  url?: string;
}

/**
 * The driver's most recent review. A rerun posts a second one, and the later review is the
 * current answer — an earlier one names findings the head may already have addressed.
 */
async function latestReview(
  github: GithubClient,
  repo: string,
  pr: number,
): Promise<PostedReview | undefined> {
  const reviews = asArray(
    await github.get(`/repos/${repo}/pulls/${String(pr)}/reviews?per_page=100`),
  );
  let latest: PostedReview | undefined;
  for (const entry of reviews ?? []) {
    const record = asRecord(entry);
    const body = asString(record?.body) ?? "";
    const id = asNumber(record?.id);
    if (id === undefined || !body.includes(REVIEW_MARKER)) continue;
    if (latest !== undefined && id < latest.id) continue;
    const commitId = asString(record?.commit_id);
    const submittedAt = asString(record?.submitted_at);
    const url = asString(record?.html_url);
    latest = {
      id,
      body,
      ...(commitId !== undefined && { commitId }),
      ...(submittedAt !== undefined && { submittedAt }),
      ...(url !== undefined && { url }),
    };
  }
  return latest;
}

async function inlineFindings(
  github: GithubClient,
  repo: string,
  pr: number,
  reviewId: number,
): Promise<{ findings: PostedFinding[]; skippedComments: number }> {
  const findings: PostedFinding[] = [];
  let skippedComments = 0;

  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const path = `/repos/${repo}/pulls/${String(pr)}/comments?per_page=100&page=${String(page)}`;
    const batch = asArray(await github.get(path)) ?? [];
    for (const entry of batch) {
      const record = asRecord(entry);
      if (asNumber(record?.pull_request_review_id) !== reviewId) continue;
      const file = asString(record?.path);
      // An outdated comment loses `line` but keeps the line it was written against, which is
      // the one the finding actually names.
      const line = asNumber(record?.line) ?? asNumber(record?.original_line);
      const parsed = parseCommentBody(asString(record?.body) ?? "");
      if (file === undefined || line === undefined || parsed === undefined) {
        skippedComments++;
        continue;
      }
      const url = asString(record?.html_url);
      findings.push({
        ...parsed,
        path: file,
        line,
        side: asString(record?.side) === "LEFT" ? "LEFT" : "RIGHT",
        partial: false,
        ...(url !== undefined && { url }),
      });
    }
    if (batch.length < 100) break;
  }
  return { findings, skippedComments };
}

/** The summary body's bullets, which carry the anchor, the lens and what — and nothing else. */
export function unplacedFindings(body: string): PostedFinding[] {
  const findings: PostedFinding[] = [];
  for (const line of body.split("\n")) {
    const match = UNPLACED.exec(line.trim());
    if (match === null) continue;
    const [lens = "", severity = ""] = (match[3] ?? "").split(" · ");
    findings.push({
      lens,
      path: match[1] ?? "",
      line: Number(match[2]),
      side: "RIGHT",
      severity,
      what: (match[4] ?? "").trim(),
      why: "",
      fix: "",
      remedy: "",
      partial: true,
    });
  }
  return findings;
}

function key(finding: PostedFinding): string {
  return `${finding.path}:${String(finding.line)}:${finding.lens}`;
}
