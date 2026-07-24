import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinnedVersion, scaffoldReviewWorkflow, WORKFLOW_FILE } from "./reviewinit.ts";

describe("scaffoldReviewWorkflow", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "speccle-review-init-"));
    roots.push(root);
    return root;
  }

  const read = async (root: string) => readFile(join(root, WORKFLOW_FILE), "utf8");

  it("writes the workflow, pinned to the given version", async () => {
    const root = await tempRoot();

    const report = await scaffoldReviewWorkflow(root, "1.2.3");

    expect(report).toMatchObject({ file: WORKFLOW_FILE, action: "written", pin: "1.2.3" });
    const workflow = await read(root);
    expect(pinnedVersion(workflow)).toBe("1.2.3");
    // Both steps run the pinned copy: the reviewing code must not come from the reviewed head.
    expect(workflow).toContain("npx -y speccle@1.2.3 review run");
    expect(workflow).toContain("npx -y speccle@1.2.3 risk --base");
  });

  it("moves the pin on a re-run, which is how a repo updates the driver", async () => {
    const root = await tempRoot();
    await scaffoldReviewWorkflow(root, "1.2.3");

    const report = await scaffoldReviewWorkflow(root, "2.0.0");

    expect(report).toMatchObject({ action: "refreshed", pin: "2.0.0", movedPin: true });
    expect(pinnedVersion(await read(root))).toBe("2.0.0");
  });

  it("is idempotent at the same version", async () => {
    const root = await tempRoot();
    const first = await scaffoldReviewWorkflow(root, "1.2.3");
    const before = await read(root);

    const second = await scaffoldReviewWorkflow(root, "1.2.3");

    expect(first.action).toBe("written");
    expect(second).toMatchObject({ action: "refreshed", movedPin: false });
    expect(await read(root)).toBe(before);
  });

  it("leaves other workflows alone", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".github/workflows"), { recursive: true });
    await writeFile(join(root, ".github/workflows/test.yml"), "name: Tests\n");

    await scaffoldReviewWorkflow(root, "1.2.3");

    expect(await readFile(join(root, ".github/workflows/test.yml"), "utf8")).toBe("name: Tests\n");
  });

  it("creates the workflows directory when the repo has none", async () => {
    const root = await tempRoot();
    await scaffoldReviewWorkflow(root, "1.2.3");
    expect(await read(root)).toContain("name: Speccle review");
  });

  describe("the hardening the workflow carries", () => {
    /** One scaffolded workflow, read once — every guard below is asserted against this text. */
    async function workflow(): Promise<string> {
      const root = await tempRoot();
      await mkdir(dirname(join(root, WORKFLOW_FILE)), { recursive: true });
      await scaffoldReviewWorkflow(root, "1.2.3");
      return read(root);
    }

    it("refuses a fork's pull request, which must never reach the API key", async () => {
      expect(await workflow()).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository",
      );
    });

    it("gates the @review rerun on write access", async () => {
      const text = await workflow();
      expect(text).toContain("startsWith(github.event.comment.body, '@review')");
      expect(text).toContain('fromJSON(\'["OWNER","MEMBER","COLLABORATOR"]\')');
      expect(text).toContain("github.event.comment.author_association");
    });

    it("asks for only the permissions it uses", async () => {
      const text = await workflow();
      expect(text).toContain("contents: read");
      expect(text).toContain("pull-requests: write");
      expect(text).not.toContain("write-all");
    });

    it("checks out full history, because the merge base needs it", async () => {
      expect(await workflow()).toContain("fetch-depth: 0");
    });

    it("passes --force only on the comment path, so a push never doubles up", async () => {
      expect(await workflow()).toContain(
        "${{ github.event_name == 'issue_comment' && '--force' || '' }}",
      );
    });

    it("names the secret it needs and the protection that file deserves", async () => {
      const text = await workflow();
      expect(text).toContain("ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
      expect(text).toContain("CODEOWNERS");
    });
  });
});

describe("pinnedVersion", () => {
  it("finds the pinned version", () => {
    expect(pinnedVersion("run: npx -y speccle@0.14.0 review run --pr 1")).toBe("0.14.0");
  });

  it("is undefined when nothing is pinned", () => {
    expect(pinnedVersion("run: npx speccle review run")).toBeUndefined();
  });
});
