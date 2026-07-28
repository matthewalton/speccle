import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitAt } from "../test/support/git.ts";
import type { Finding } from "./finding.ts";
import { type FetchLike, REVIEW_MARKER } from "./github.ts";
import { LENSES_DIR, TEMPLATE_LENS } from "./lenses.ts";
import { unplacedFindings } from "./reviewfindings.ts";
import {
  anchorableLines,
  type ChangedFile,
  findingsFrom,
  lensPrompt,
  normalise,
  panel,
  renderSummary,
  reviewRun,
} from "./reviewrun.ts";
import type { RiskReport } from "./risk.ts";

/** A patch with a context line, a replacement, and an addition — every anchor case in one. */
const PATCH = [
  "@@ -1,3 +1,4 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  " const d = 5;",
].join("\n");

const finding = (over: Partial<Finding> = {}): Finding => ({
  lens: "correctness.md",
  path: "src/a.ts",
  line: 3,
  side: "RIGHT",
  severity: "high",
  what: "b is off by one",
  why: "callers round twice",
  fix: "drop the second round",
  remedy: "criterion",
  ...over,
});

describe("anchorableLines", () => {
  it("takes added and context lines on the right, removed and context on the left", () => {
    const lines = anchorableLines(PATCH);
    expect([...lines.right].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect([...lines.left].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("counts from each hunk's own start", () => {
    const patch = ["@@ -40,2 +80,2 @@", " kept", "+added"].join("\n");
    const lines = anchorableLines(patch);
    expect(lines.right.has(80)).toBe(true);
    expect(lines.right.has(81)).toBe(true);
    expect(lines.left.has(40)).toBe(true);
  });

  it("ignores the no-newline marker, which is not a line of content", () => {
    const patch = ["@@ -1,1 +1,1 @@", "-old", "\\ No newline at end of file", "+new"].join("\n");
    expect([...anchorableLines(patch).right]).toEqual([1]);
  });

  it("has nothing to anchor to in an empty patch", () => {
    expect(anchorableLines("").right.size).toBe(0);
  });
});

describe("normalise", () => {
  const files: ChangedFile[] = [{ path: "src/a.ts", patch: PATCH }];

  it("turns a finding on a changed line into an inline comment", () => {
    const { comments, unplaced } = normalise([finding()], files);
    expect(unplaced).toEqual([]);
    expect(comments[0]).toMatchObject({ path: "src/a.ts", line: 3, side: "RIGHT" });
    expect(comments[0]?.body).toContain("b is off by one");
    expect(comments[0]?.body).toContain("**Fix**: drop the second round");
    expect(comments[0]?.body).toContain("correctness.md");
  });

  it("anchors a LEFT finding against the pre-change numbering", () => {
    const { comments } = normalise([finding({ side: "LEFT", line: 2 })], files);
    expect(comments[0]).toMatchObject({ side: "LEFT", line: 2 });
  });

  it("carries a finding off the diff into the unplaced list rather than losing it", () => {
    const { comments, unplaced } = normalise([finding({ line: 99 })], files);
    expect(comments).toEqual([]);
    expect(unplaced).toHaveLength(1);
  });

  it("carries a finding in an unchanged file the same way", () => {
    const { unplaced } = normalise([finding({ path: "src/untouched.ts" })], files);
    expect(unplaced).toHaveLength(1);
  });
});

describe("findingsFrom", () => {
  const toolUse = (...findings: unknown[]) => ({
    content: [{ type: "tool_use", name: "report_findings", input: { findings } }],
  });

  it("reads the forced tool call", () => {
    const found = findingsFrom(
      toolUse({
        path: "src/a.ts",
        line: 3,
        side: "LEFT",
        severity: "low",
        what: "w",
        why: "y",
        fix: "f",
        remedy: "lens",
      }),
      "security.md",
    );
    expect(found).toEqual([
      {
        lens: "security.md",
        path: "src/a.ts",
        line: 3,
        side: "LEFT",
        severity: "low",
        what: "w",
        why: "y",
        fix: "f",
        remedy: "lens",
      },
    ]);
  });

  it("reads an empty list — the common, valid result", () => {
    expect(findingsFrom(toolUse(), "security.md")).toEqual([]);
  });

  it("drops an entry with no anchor, since it cannot be reported anywhere", () => {
    expect(findingsFrom(toolUse({ what: "no path or line" }), "security.md")).toEqual([]);
  });

  it("defaults the soft fields rather than dropping an otherwise usable finding", () => {
    const found = findingsFrom(toolUse({ path: "a.ts", line: 1, what: "w" }), "l.md");
    expect(found[0]).toMatchObject({ side: "RIGHT", severity: "minor", remedy: "none" });
  });

  it("ignores prose and any other tool", () => {
    const body = {
      content: [
        { type: "text", text: "here are the findings" },
        { type: "tool_use", name: "something_else", input: { findings: [{ path: "a", line: 1 }] } },
      ],
    };
    expect(findingsFrom(body, "l.md")).toEqual([]);
  });

  it("survives a response of the wrong shape entirely", () => {
    expect(findingsFrom(null, "l.md")).toEqual([]);
    expect(findingsFrom({ content: "not an array" }, "l.md")).toEqual([]);
  });
});

describe("lensPrompt", () => {
  it("carries the lens body verbatim — the lens is the whole brief", () => {
    const body = "**Stance:** be exacting.\n\n## What to look for\n1. off-by-one errors";
    const prompt = lensPrompt({ name: "correctness.md", body }, "--- src/a.ts\n" + PATCH);
    expect(prompt).toContain(body);
    expect(prompt).toContain(PATCH);
  });
});

describe("renderSummary", () => {
  const base = {
    base: "origin/main",
    ran: [{ name: "correctness.md", findings: 1 }],
    skippedLenses: [],
    skippedFiles: [],
    findings: [finding()],
    unplaced: [],
    headSha: "abcdef1234567890",
  };

  const verdict = (over: Partial<RiskReport> = {}): RiskReport => ({
    root: "/r",
    changed: ["checkout/SPEC.md"],
    signals: [],
    score: 0,
    threshold: 3,
    humanRequired: false,
    ...over,
  });

  const retired = {
    id: "criterion-retired",
    weight: 4,
    source: "baseline" as const,
    reason: "a criterion was retired",
    evidence: ["CHECKOUT-2"],
  };

  it("opens with the verdict, and the gate's evidence with it when a human is required", () => {
    const summary = renderSummary({
      ...base,
      verdict: verdict({ signals: [retired], score: 4, humanRequired: true }),
    });
    expect(summary).toContain("> [!CAUTION]");
    expect(summary).toContain("**4 of 3**");
    expect(summary).toContain("a human is required");
    // The evidence for a gate that fired is the point of the comment, not a footnote.
    expect(summary).toContain("<details open>");
    expect(summary).toContain("| `criterion-retired` | +4 |");
    expect(summary).toContain("CHECKOUT-2");
    expect(summary.trimEnd().endsWith(REVIEW_MARKER)).toBe(true);
  });

  it("reads as clean at a glance when nothing fired", () => {
    const summary = renderSummary({
      ...base,
      verdict: verdict(),
      ran: [{ name: "correctness.md", findings: 0 }],
      findings: [],
    });
    expect(summary).toContain("> [!TIP]");
    expect(summary).toContain("**No findings** across 1 lens");
    expect(summary).toContain("below the review threshold");
    expect(summary).not.toContain("<details open>");
  });

  it("raises the banner for a blocker even when the risk gate stayed shut", () => {
    const summary = renderSummary({
      ...base,
      verdict: verdict(),
      findings: [finding({ severity: "blocker" })],
    });
    expect(summary).toContain("> [!CAUTION]");
    expect(summary).toContain("🔴 1 blocker");
  });

  it("gives a row only to the lenses that fired, and one line to the rest", () => {
    const summary = renderSummary({
      ...base,
      verdict: verdict(),
      ran: [
        { name: "accessibility.md", findings: 0 },
        { name: "architecture.md", findings: 2 },
        { name: "security.md", findings: 0 },
      ],
      findings: [
        finding({ lens: "architecture.md", severity: "minor" }),
        finding({ lens: "architecture.md", severity: "major" }),
      ],
    });
    expect(summary).toContain("| `architecture.md` | 🟠 1 major · 🔵 1 minor |");
    expect(summary).not.toContain("| `security.md` |");
    expect(summary).toContain("<sub>2 lenses clean: `accessibility.md`, `security.md`</sub>");
  });

  it("counts a severity the ladder does not name rather than dropping it", () => {
    const summary = renderSummary({
      ...base,
      verdict: verdict(),
      findings: [finding({ severity: "blocker" }), finding({ severity: "spicy" })],
    });
    expect(summary).toContain("🔴 1 blocker · ⚫ 1 spicy");
  });

  it("fills the risk bar as the score approaches the gate, and keeps one width past it", () => {
    const below = renderSummary({ ...base, verdict: verdict({ score: 2 }) });
    expect(below).toContain("`▓▓░`");
    const fired = renderSummary({
      ...base,
      verdict: verdict({ score: 9, humanRequired: true }),
    });
    expect(fired).toContain("`▓▓▓`");
  });

  it("says so plainly when the verdict could not be computed", () => {
    const summary = renderSummary({ ...base, verdict: null });
    expect(summary).toContain("risk not computed");
    expect(summary).toContain("not computed: no shared history with `origin/main`");
  });

  it("names every cap and its count, so a trimmed change set never reads as full coverage", () => {
    const summary = renderSummary({
      ...base,
      verdict: null,
      skippedLenses: [{ name: TEMPLATE_LENS, reason: "still the shipped template" }],
      skippedFiles: [
        { name: "pnpm-lock.yaml", reason: "patch over 24000 bytes" },
        { name: "logo.png", reason: "no textual patch" },
      ],
    });
    // The count sits in the <summary>, which a collapsed block still shows.
    expect(summary).toContain("<summary>Lenses skipped (1)</summary>");
    expect(summary).toContain(TEMPLATE_LENS);
    expect(summary).toContain("<summary>Files not reviewed (2)</summary>");
    expect(summary).toContain("pnpm-lock.yaml");
  });

  it("keeps a signal's own `|` inside its cell instead of splitting the row", () => {
    const summary = renderSummary({
      ...base,
      verdict: verdict({
        signals: [{ ...retired, id: "house-rule", reason: "touched src|test" }],
        score: 4,
      }),
    });
    expect(summary).toContain("| `house-rule` | +4 | touched src\\|test: CHECKOUT-2 |");
  });

  it("lists unplaced findings in full rather than dropping them", () => {
    const summary = renderSummary({ ...base, verdict: null, unplaced: [finding({ line: 99 })] });
    expect(summary).toContain("Unplaced findings");
    expect(summary).toContain("`src/a.ts:99`");
    expect(summary).toContain("b is off by one");
  });

  // The summary bullet is the whole record of a finding no inline comment carries, and the local
  // driver recovers it by parsing this body. A reshaped summary that stopped round-tripping would
  // lose those findings silently, so the two are pinned to each other here.
  it("writes unplaced findings in the shape the local driver reads back", () => {
    const unplaced = finding({ line: 99, lens: "security.md", severity: "blocker" });
    const summary = renderSummary({ ...base, verdict: verdict(), unplaced: [unplaced] });
    expect(unplacedFindings(summary)).toEqual([
      {
        lens: "security.md",
        path: "src/a.ts",
        line: 99,
        side: "RIGHT",
        severity: "blocker",
        what: "b is off by one",
        why: "",
        fix: "",
        remedy: "",
        partial: true,
      },
    ]);
  });
});

describe("panel", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function withLenses(lenses: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-panel-"));
    roots.push(root);
    for (const [name, body] of Object.entries(lenses)) {
      await mkdir(join(root, LENSES_DIR), { recursive: true });
      await writeFile(join(root, LENSES_DIR, name), body);
    }
    return root;
  }

  it("skips the risk lens, which decides authority instead of reporting findings", async () => {
    const root = await withLenses({ "risk.md": "escalate", "correctness.md": "look" });
    const { lenses, skipped } = await panel(root);
    expect(lenses.map((lens) => lens.name)).toEqual(["correctness.md"]);
    expect(skipped[0]).toMatchObject({ name: "risk.md" });
  });

  it("skips an unauthored house-conventions lens, which would report nothing", async () => {
    const root = await withLenses({
      [TEMPLATE_LENS]: "<!-- speccle:lens-template -->\n# yours to write",
    });
    const { lenses, skipped } = await panel(root);
    expect(lenses).toEqual([]);
    expect(skipped[0]?.reason).toContain("has not authored");
  });

  it("runs a house-conventions lens the repo has authored", async () => {
    const root = await withLenses({ [TEMPLATE_LENS]: "# our rules\n1. no raw colours" });
    const { lenses } = await panel(root);
    expect(lenses.map((lens) => lens.name)).toEqual([TEMPLATE_LENS]);
  });

  it("points at init when the repo was never initialized for review", async () => {
    const root = await mkdtemp(join(tmpdir(), "speccle-panel-"));
    roots.push(root);
    await expect(panel(root)).rejects.toThrow("speccle init");
  });
});

describe("reviewRun", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  interface Reply {
    status?: number;
    json?: unknown;
  }

  interface Server {
    fetch: FetchLike;
    calls: { url: string; method: string; body: unknown }[];
    modelCalls: () => number;
    postedReviews: () => Record<string, unknown>[];
  }

  /** A stub GitHub + Anthropic, routed by URL. Later replies in an array serve later attempts. */
  function server(config: {
    pull?: Reply;
    reviews?: Reply;
    files?: Reply;
    messages?: Reply;
    createReview?: Reply[];
  }): Server {
    const calls: { url: string; method: string; body: unknown }[] = [];
    let attempts = 0;
    const reply = (r: Reply | undefined, fallback: unknown = {}) =>
      new Response(JSON.stringify(r?.json ?? fallback), { status: r?.status ?? 200 });

    const fetch: FetchLike = (url, init) => {
      const method = init?.method ?? "GET";
      const raw = init?.body;
      calls.push({
        url,
        method,
        body: typeof raw === "string" ? (JSON.parse(raw) as unknown) : undefined,
      });
      if (url.startsWith("https://api.anthropic.com")) {
        return Promise.resolve(reply(config.messages, { content: [] }));
      }
      if (method === "POST" && url.endsWith("/reviews")) {
        const list = config.createReview ?? [{}];
        const next = list[Math.min(attempts++, list.length - 1)];
        return Promise.resolve(reply(next));
      }
      if (url.includes("/reviews?")) return Promise.resolve(reply(config.reviews, []));
      if (url.includes("/files?")) return Promise.resolve(reply(config.files, []));
      return Promise.resolve(
        reply(config.pull, { base: { ref: "main" }, head: { sha: "deadbeefcafe" } }),
      );
    };

    return {
      fetch,
      calls,
      modelCalls: () => calls.filter((call) => call.url.startsWith("https://api.anthropic")).length,
      postedReviews: () =>
        calls
          .filter((call) => call.method === "POST" && call.url.endsWith("/reviews"))
          .map((call) => call.body as Record<string, unknown>),
    };
  }

  const oneFinding = {
    json: {
      content: [
        {
          type: "tool_use",
          name: "report_findings",
          input: {
            findings: [
              {
                path: "src/a.ts",
                line: 3,
                side: "RIGHT",
                severity: "high",
                what: "off by one",
                why: "callers round twice",
                fix: "drop the round",
                remedy: "criterion",
              },
            ],
          },
        },
      ],
    },
  };

  const changedFile = { json: [{ filename: "src/a.ts", patch: PATCH }] };

  async function repo(lenses: Record<string, string> = { "correctness.md": "look hard" }) {
    const root = await mkdtemp(join(tmpdir(), "speccle-review-run-"));
    roots.push(root);
    await mkdir(join(root, LENSES_DIR), { recursive: true });
    for (const [name, body] of Object.entries(lenses)) {
      await writeFile(join(root, LENSES_DIR, name), body);
    }
    return root;
  }

  const options = (stub: Server, over: Record<string, unknown> = {}) => ({
    pr: 7,
    repo: "acme/widgets",
    githubToken: "gh-token",
    apiKey: "sk-test",
    fetch: stub.fetch,
    ...over,
  });

  it("posts one review, with the finding anchored inline", async () => {
    const stub = server({ files: changedFile, messages: oneFinding });

    const report = await reviewRun(await repo(), options(stub));

    expect(report.outcome).toBe("posted");
    expect(report.findings).toHaveLength(1);
    expect(report.comments).toBe(1);
    expect(report.unplaced).toBe(0);
    const posted = stub.postedReviews();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ commit_id: "deadbeefcafe", event: "COMMENT" });
    expect(posted[0]?.comments).toMatchObject([{ path: "src/a.ts", line: 3, side: "RIGHT" }]);
    expect(String(posted[0]?.body)).toContain(REVIEW_MARKER);
  });

  it("defaults the base ref to the pull request's own base", async () => {
    const stub = server({ files: changedFile });
    const report = await reviewRun(await repo(), options(stub));
    expect(report.base).toBe("origin/main");
  });

  it("posts a review even when every lens is quiet, so the verdict is still visible", async () => {
    const stub = server({ files: changedFile });
    const report = await reviewRun(await repo(), options(stub));
    expect(report.findings).toEqual([]);
    expect(stub.postedReviews()).toHaveLength(1);
  });

  it("recognises its own earlier review and spends nothing on a second", async () => {
    const stub = server({
      files: changedFile,
      messages: oneFinding,
      reviews: { json: [{ body: `## Speccle review\n${REVIEW_MARKER}` }] },
    });

    const report = await reviewRun(await repo(), options(stub));

    expect(report.outcome).toBe("already-reviewed");
    expect(stub.modelCalls()).toBe(0);
    expect(stub.postedReviews()).toEqual([]);
  });

  it("reviews again when forced — the gated @review rerun", async () => {
    const stub = server({
      files: changedFile,
      messages: oneFinding,
      reviews: { json: [{ body: REVIEW_MARKER }] },
    });

    const report = await reviewRun(await repo(), options(stub, { force: true }));

    expect(report.outcome).toBe("posted");
    expect(stub.modelCalls()).toBe(1);
  });

  it("ignores another reviewer's review, marker-less as it is", async () => {
    const stub = server({
      files: changedFile,
      reviews: { json: [{ body: "looks good to me" }] },
    });
    expect((await reviewRun(await repo(), options(stub))).outcome).toBe("posted");
  });

  it("keeps the rest of the panel when one lens fails, and still posts", async () => {
    const stub = server({ files: changedFile, messages: { status: 529 } });

    const report = await reviewRun(
      await repo({ "correctness.md": "a", "security.md": "b" }),
      options(stub),
    );

    expect(report.lenses).toEqual([]);
    expect(report.skippedLenses).toHaveLength(2);
    expect(report.skippedLenses[0]?.reason).toContain("529");
    expect(stub.postedReviews()).toHaveLength(1);
  });

  it("falls back to a summary-only review when GitHub rejects the anchors", async () => {
    const stub = server({
      files: changedFile,
      messages: oneFinding,
      createReview: [{ status: 422 }, { status: 200 }],
    });

    const report = await reviewRun(await repo(), options(stub));

    const posted = stub.postedReviews();
    expect(posted).toHaveLength(2);
    expect(posted[1]?.comments).toBeUndefined();
    // The finding is not lost: the retry body carries every finding, anchored or not.
    const body = String(posted[1]?.body);
    expect(body).toContain("GitHub rejected the inline anchors");
    expect(body).toContain("off by one");
    expect(body).toContain("`src/a.ts:3`");
    expect(report.outcome).toBe("posted");
  });

  it("raises on a GitHub failure that is not an anchor rejection", async () => {
    const stub = server({ files: changedFile, createReview: [{ status: 500 }] });
    await expect(reviewRun(await repo(), options(stub))).rejects.toThrow("500");
  });

  it("posts nothing on a dry run", async () => {
    const stub = server({ files: changedFile, messages: oneFinding });

    const report = await reviewRun(await repo(), options(stub, { dryRun: true }));

    expect(report.outcome).toBe("dry-run");
    expect(report.findings).toHaveLength(1);
    expect(stub.postedReviews()).toEqual([]);
  });

  it("names the files it dropped instead of quietly reviewing less", async () => {
    const stub = server({
      files: {
        json: [
          { filename: "logo.png" },
          { filename: "pnpm-lock.yaml", patch: "+".repeat(30_000) },
          { filename: "src/a.ts", patch: PATCH },
        ],
      },
    });

    const report = await reviewRun(await repo(), options(stub));

    expect(report.skippedFiles.map((skip) => skip.name)).toEqual(["logo.png", "pnpm-lock.yaml"]);
    expect(report.skippedFiles[0]?.reason).toContain("no textual patch");
    expect(report.skippedFiles[1]?.reason).toContain("24000 bytes");
    expect(String(stub.postedReviews()[0]?.body)).toContain("pnpm-lock.yaml");
  });

  it("hands each lens the diff of the files that survived the caps", async () => {
    const stub = server({ files: changedFile, messages: oneFinding });

    await reviewRun(await repo({ "correctness.md": "LENS BODY HERE" }), options(stub));

    const call = stub.calls.find((c) => c.url.startsWith("https://api.anthropic"));
    const body = call?.body as { messages: { content: string }[]; tool_choice: unknown };
    expect(body.messages[0]?.content).toContain("LENS BODY HERE");
    expect(body.messages[0]?.content).toContain("--- src/a.ts");
    // Shape is forced, never parsed out of prose.
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_findings" });
  });

  it("folds the real risk verdict into the review it posts", async () => {
    const root = await repo();
    // A governed slice whose criterion the branch retires: a real signal, computed locally.
    await write(root, "checkout/SPEC.md", "## [CHECKOUT-1] a\n\n## [CHECKOUT-2] b\n");
    await write(
      root,
      "checkout/tax.test.ts",
      'it("[CHECKOUT-1] a", () => {});\nit("[CHECKOUT-2] b", () => {});\n',
    );
    const git = gitAt(root);
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("add", ".");
    git("commit", "-qm", "the slice");
    git("checkout", "-qb", "feature");
    await write(root, "checkout/SPEC.md", "## [CHECKOUT-1] a\n");
    git("commit", "-qam", "retire CHECKOUT-2");
    const stub = server({ files: changedFile });

    const report = await reviewRun(root, options(stub, { base: "main" }));

    expect(report.risk?.humanRequired).toBe(true);
    expect(String(stub.postedReviews()[0]?.body)).toContain("a human is required");
  });

  it("reports no verdict rather than failing when there is no history to measure", async () => {
    const stub = server({ files: changedFile });
    const report = await reviewRun(await repo(), options(stub, { base: "main" }));
    expect(report.risk).toBeNull();
    expect(String(stub.postedReviews()[0]?.body)).toContain("not computed");
  });

  it("refuses to run without the credentials it needs, naming which is missing", async () => {
    const stub = server({});
    const root = await repo();
    await expect(
      reviewRun(root, { pr: 7, githubToken: "t", apiKey: "k", fetch: stub.fetch }),
    ).rejects.toThrow("GITHUB_REPOSITORY");
    await expect(
      reviewRun(root, { pr: 7, repo: "a/b", apiKey: "k", fetch: stub.fetch, githubToken: "" }),
    ).rejects.toThrow("GITHUB_TOKEN");
    await expect(
      reviewRun(root, { pr: 7, repo: "a/b", githubToken: "t", apiKey: "", fetch: stub.fetch }),
    ).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  async function write(root: string, file: string, body: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body);
  }
});
