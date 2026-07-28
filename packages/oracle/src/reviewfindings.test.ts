import { describe, expect, it } from "vitest";
import { commentBody, type FindingBody } from "./finding.ts";
import { type FetchLike, repoFromRemote, REVIEW_MARKER } from "./github.ts";
import { reviewFindings } from "./reviewfindings.ts";

describe("reading back the findings the CI driver posted", () => {
  const finding: FindingBody = {
    lens: "correctness.md",
    severity: "major",
    what: "A refund over the order total returns a negative charge.",
    why: "`applyRefund` subtracts without clamping.",
    fix: "Clamp the refund to the order total.",
    remedy: "criterion",
  };

  it("returns the findings, and the base ref risk and calibration must share", async () => {
    const stub = server({
      reviews: [review({ id: 11, commitId: "headsha" })],
      comments: [comment({ reviewId: 11, path: "src/refund.ts", line: 42 })],
    });

    const report = await reviewFindings(".", options(stub));

    expect(report.outcome).toBe("found");
    expect(report.base).toBe("origin/main");
    expect(report.stale).toBe(false);
    expect(report.findings).toEqual([
      { ...finding, path: "src/refund.ts", line: 42, side: "RIGHT", partial: false, url: "u" },
    ]);
  });

  it("reads the later review when the driver has run twice, not the one it replaced", async () => {
    const stub = server({
      reviews: [
        review({ id: 11, commitId: "headsha" }),
        review({ id: 12, commitId: "headsha", body: "second" }),
      ],
      comments: [
        comment({ reviewId: 11, path: "old.ts", line: 1 }),
        comment({ reviewId: 12, path: "new.ts", line: 2 }),
      ],
    });

    const report = await reviewFindings(".", options(stub));

    expect(report.findings.map((f) => f.path)).toEqual(["new.ts"]);
  });

  it("says the review is stale when the head moved after it was written", async () => {
    const stub = server({
      reviews: [review({ id: 11, commitId: "oldersha" })],
      comments: [comment({ reviewId: 11, path: "src/refund.ts", line: 42 })],
    });

    const report = await reviewFindings(".", options(stub));

    expect(report.stale).toBe(true);
    expect(report.reviewedSha).toBe("oldersha");
    expect(report.headSha).toBe("headsha");
  });

  it("recovers a finding the summary carried, marked for the detail the body never held", async () => {
    const body = [
      "## Speccle review",
      "",
      "**Unplaced findings** — these could not anchor to a line in the diff, so they are here rather than lost:",
      "",
      "- `src/tax.ts:7` (security.md · blocker) — The rate is read from an unvalidated header.",
      "",
      REVIEW_MARKER,
    ].join("\n");
    const stub = server({ reviews: [review({ id: 11, commitId: "headsha", body })], comments: [] });

    const report = await reviewFindings(".", options(stub));

    expect(report.findings).toEqual([
      {
        lens: "security.md",
        path: "src/tax.ts",
        line: 7,
        side: "RIGHT",
        severity: "blocker",
        what: "The rate is read from an unvalidated header.",
        why: "",
        fix: "",
        remedy: "",
        partial: true,
      },
    ]);
  });

  it("keeps a finding once when it is both commented and listed in the summary", async () => {
    const body = [
      "## Speccle review",
      "",
      "**Findings in full** — GitHub rejected the inline anchors on this review, so every finding is here instead:",
      "",
      "- `src/refund.ts:42` (correctness.md · major) — A refund over the order total returns a negative charge.",
      "",
      REVIEW_MARKER,
    ].join("\n");
    const stub = server({
      reviews: [review({ id: 11, commitId: "headsha", body })],
      comments: [comment({ reviewId: 11, path: "src/refund.ts", line: 42 })],
    });

    const report = await reviewFindings(".", options(stub));

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.partial).toBe(false);
  });

  it("leaves a human's reply on the review alone, and counts it", async () => {
    const stub = server({
      reviews: [review({ id: 11, commitId: "headsha" })],
      comments: [
        comment({ reviewId: 11, path: "src/refund.ts", line: 42 }),
        { pull_request_review_id: 11, path: "src/refund.ts", line: 43, body: "Agreed, on it." },
      ],
    });

    const report = await reviewFindings(".", options(stub));

    expect(report.findings).toHaveLength(1);
    expect(report.skippedComments).toBe(1);
  });

  it("reports no review rather than nothing to fix, so the caller knows to run the panel", async () => {
    const stub = server({ reviews: [{ id: 9, body: "LGTM", commit_id: "headsha" }], comments: [] });

    const report = await reviewFindings(".", options(stub));

    expect(report.outcome).toBe("no-review");
    expect(report.findings).toEqual([]);
  });

  it("separates a review that found nothing from one that was never posted", async () => {
    const stub = server({ reviews: [review({ id: 11, commitId: "headsha" })], comments: [] });

    const report = await reviewFindings(".", options(stub));

    expect(report.outcome).toBe("no-findings");
  });

  it("refuses without the credentials it needs, naming which is missing", async () => {
    const stub = server({ reviews: [], comments: [] });
    await expect(
      reviewFindings(".", { pr: 7, repo: "a/b", githubToken: "", fetch: stub.fetch }),
    ).rejects.toThrow("GITHUB_TOKEN");
  });

  it.each([
    ["git@github.com:owner/name.git", "owner/name"],
    ["https://github.com/owner/name.git", "owner/name"],
    ["https://github.com/owner/name", "owner/name"],
    ["ssh://git@github.com/owner/name.git", "owner/name"],
    ["git@gitlab.com:owner/name.git", undefined],
    ["", undefined],
  ])("reads %s as the repository %s", (url, expected) => {
    expect(repoFromRemote(url)).toBe(expected);
  });

  function review(spec: { id: number; commitId: string; body?: string }) {
    return {
      id: spec.id,
      body: `## Speccle review\n\n${spec.body ?? ""}\n${REVIEW_MARKER}`,
      commit_id: spec.commitId,
      submitted_at: "2026-07-28T10:00:00Z",
      html_url: `https://github.com/a/b/pull/7#pullrequestreview-${String(spec.id)}`,
    };
  }

  function comment(spec: { reviewId: number; path: string; line: number }) {
    return {
      pull_request_review_id: spec.reviewId,
      path: spec.path,
      line: spec.line,
      side: "RIGHT",
      body: commentBody(finding),
      html_url: "u",
    };
  }

  function options(stub: { fetch: FetchLike }) {
    return { pr: 7, repo: "a/b", githubToken: "t", fetch: stub.fetch };
  }

  /** A stub GitHub, routed by URL. The pull request always sits at `headsha` on `main`. */
  function server(config: { reviews: unknown[]; comments: unknown[] }): { fetch: FetchLike } {
    const json = (value: unknown) => Promise.resolve(new Response(JSON.stringify(value)));
    return {
      fetch: (url) => {
        if (url.includes("/reviews?")) return json(config.reviews);
        if (url.includes("/comments?")) {
          return json(url.includes("page=1") ? config.comments : []);
        }
        return json({ base: { ref: "main" }, head: { sha: "headsha" } });
      },
    };
  }
});
