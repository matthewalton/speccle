import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ownVersion } from "./init.ts";

/** Where the scaffolded workflow lands. One file: the driver itself ships in the tarball. */
export const WORKFLOW_FILE = ".github/workflows/speccle-review.yml";

/** The repo secret the CI driver cannot run without — and the reason the driver is opt-in. */
export const API_KEY_SECRET = "ANTHROPIC_API_KEY";

export interface ReviewInitReport {
  root: string;
  /** Root-relative path of the workflow written. */
  file: string;
  /** `written` — newly placed. `refreshed` — an existing workflow rewritten, moving the pin. */
  action: "written" | "refreshed";
  /** The `speccle@X` the workflow pins — the version that will run in CI. */
  pin: string;
  /** True when the rewrite moved the pin, so the report can say what actually changed. */
  movedPin: boolean;
}

/**
 * Scaffolds the review workflow — the CI driver's one artefact in a consumer repo (ADR-0047).
 * The runner itself is not vendored: the workflow pins `speccle@<version>` and npm serves it, so
 * the code doing the reviewing never comes from the branch being reviewed, and there is nothing
 * committed here to drift from the CLI. Re-running is how a repo moves the pin.
 */
export async function scaffoldReviewWorkflow(
  root: string,
  version?: string,
): Promise<ReviewInitReport> {
  const pin = version ?? (await ownVersion());
  const path = join(root, WORKFLOW_FILE);
  const existing = await readMaybe(path);
  const workflow = renderWorkflow(pin);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, workflow);

  return {
    root,
    file: WORKFLOW_FILE,
    action: existing === undefined ? "written" : "refreshed",
    pin,
    movedPin: existing !== undefined && existing !== workflow,
  };
}

/** The pinned version an already-scaffolded workflow names, or undefined when it names none. */
export function pinnedVersion(workflow: string): string | undefined {
  return /\bspeccle@(\d+\.\d+\.\d+[^\s]*)/.exec(workflow)?.[1];
}

/**
 * The workflow, with every hardening decision stated in a comment beside the line that enforces
 * it: a scaffolded file is read by people deciding whether to trust it, and a guard whose reason
 * is undocumented is a guard someone deletes.
 */
function renderWorkflow(pin: string): string {
  return `# Speccle review — the outer loop, running in CI. Written by \`speccle review init\`.
#
# It fans this repo's \`.speccle/lenses/\` over a pull request's change set, posts what they find
# as one review with inline comments, and reports the deterministic risk verdict as a check.
# It finds and comments; it never pushes a fix — fixes come back through the local \`review\`
# skill, which can re-run the checks-gate and revert a fix that goes red.
#
# Before this can run:
#   1. Add a metered ${API_KEY_SECRET} repo secret. This driver calls a model once per lens per
#      pull request, which is why it is opt-in; the local \`review\` skill needs no key.
#   2. Protect this file. Anyone who can edit a workflow can read the secrets it uses — put
#      \`.github/\` behind CODEOWNERS or a branch protection rule.
#
# Re-run \`speccle review init\` to move the pinned version below.

name: Speccle review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  # The rerun path: an \`@review\` comment on the pull request, gated on write access below.
  issue_comment:
    types: [created]

# Least privilege: post a review, read the tree, nothing else.
permissions:
  contents: read
  pull-requests: write

concurrency:
  group: speccle-review-\${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: true

jobs:
  review:
    runs-on: ubuntu-latest
    # Two ways in, each gated. A pull request must come from a branch of this repo, never a
    # fork: a fork's pull request must not reach the API key. A comment must come from someone
    # who can already write here, or \`@review\` would be a way to spend the key from outside.
    if: >-
      (github.event_name == 'pull_request' &&
       github.event.pull_request.head.repo.full_name == github.repository) ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request != null &&
       startsWith(github.event.comment.body, '@review') &&
       contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association))
    steps:
      # The comment event carries no refs, so resolve them for both paths the same way.
      - name: Resolve the pull request
        id: pr
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          number=\${{ github.event.pull_request.number || github.event.issue.number }}
          pr=$(gh api "repos/\${{ github.repository }}/pulls/$number")
          {
            echo "number=$number"
            echo "base=$(echo "$pr" | jq -r .base.ref)"
            echo "head=$(echo "$pr" | jq -r .head.sha)"
          } >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v5
        with:
          # The head commit itself, not the synthetic merge commit: the change set under review
          # is what the branch says, and the comment path would otherwise land on the default
          # branch. The head is data here — the reviewing code comes from npm, pinned below.
          ref: \${{ steps.pr.outputs.head }}
          # \`risk\` measures from the merge base, which a shallow clone has no history to find.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      # A global install, not \`npx\`. \`npx\` is \`npm exec\`, which validates *this* repo's
      # \`devEngines.packageManager\` before it fetches anything — so a repo pinning pnpm, yarn or
      # bun fails the run with an EBADDEVENGINES error naming Speccle, which never declared it
      # (\`onFail: download\` does not rescue a name mismatch). \`npm i -g\` is exempt, and resolves
      # the package once instead of on both steps below.
      - name: Install Speccle
        run: npm i -g speccle@${pin}

      # \`origin/\` prefixes the base ref because checkout leaves it as a remote-tracking ref;
      # a bare branch name would not resolve.
      - name: Review the change set
        env:
          ${API_KEY_SECRET}: \${{ secrets.${API_KEY_SECRET} }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: >-
          speccle review run
          --pr \${{ steps.pr.outputs.number }}
          --base origin/\${{ steps.pr.outputs.base }}
          \${{ github.event_name == 'issue_comment' && '--force' || '' }}

      # The status check. \`risk\` exits 1 at or above the review threshold, so a failing step is
      # the failing check. Whether that blocks the merge is branch protection — GitHub's, and
      # this repo's call to make, not Speccle's. It runs last so the findings post either way.
      - name: Risk gate
        run: speccle risk --base origin/\${{ steps.pr.outputs.base }}
`;
}

async function readMaybe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}
