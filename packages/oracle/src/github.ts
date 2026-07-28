import { spawnSync } from "node:child_process";
import { gitStdout } from "./git.ts";

/**
 * The GitHub seam, shared by the CI driver that writes a review and the command that reads one
 * back. It lives outside `reviewrun.ts` so a deterministic command never has to import the one
 * module that calls a model (ADR-0047) to reach an API client.
 */

const GITHUB_API = "https://api.github.com";

/** Marks a review as the CI driver's, so its own reruns — and `review findings` — recognise it. */
export const REVIEW_MARKER = "<!-- speccle-review -->";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GithubClient {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<{ ok: boolean; status: number; text: string }>;
}

export function githubClient(doFetch: FetchLike, token: string): GithubClient {
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "speccle-review",
  };
  return {
    get: async (path) => {
      const response = await doFetch(`${GITHUB_API}${path}`, { headers });
      if (!response.ok) {
        throw new Error(
          `GitHub API ${String(response.status)} on ${path}: ${await errorText(response)}`,
        );
      }
      return asUnknown(await response.json());
    },
    post: async (path, body) => {
      const response = await doFetch(`${GITHUB_API}${path}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: response.ok, status: response.status, text: await errorText(response) };
    },
  };
}

/**
 * `owner/name`, from the flag, then the variable Actions always sets, then the `origin` remote.
 * The last rung is what a human standing in a clone needs; CI never reaches it.
 */
export function resolveRepo(root: string, explicit: string | undefined): string {
  const named = explicit ?? process.env.GITHUB_REPOSITORY;
  if (named !== undefined && named !== "") return named;
  const remote = repoFromRemote(gitStdout(root, ["remote", "get-url", "origin"])?.trim());
  if (remote !== undefined) return remote;
  throw new Error(
    "no repository — pass --repo <owner/name>, set GITHUB_REPOSITORY, or run inside a clone with a GitHub `origin`",
  );
}

/** `owner/name` out of either remote spelling, or undefined when the remote is not GitHub's. */
export function repoFromRemote(url: string | undefined): string | undefined {
  if (url === undefined || url === "") return undefined;
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  if (match === null) return undefined;
  return `${match[1] ?? ""}/${match[2] ?? ""}`;
}

/**
 * A token, from the flag, then the environment, then the `gh` CLI a human is likely already
 * signed into. An explicitly-passed empty token is a refusal, not a reason to keep looking.
 */
export function resolveToken(explicit: string | undefined): string {
  if (explicit !== undefined) {
    if (explicit === "") throw new Error("no GitHub token — GITHUB_TOKEN was set to nothing");
    return explicit;
  }
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const fromCli = ghAuthToken();
  if (fromCli !== undefined) return fromCli;
  throw new Error(
    "no GitHub token — set GITHUB_TOKEN (Actions provides it as a secret) or sign in with `gh auth login`",
  );
}

function ghAuthToken(): string | undefined {
  const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) return undefined;
  const token = result.stdout.trim();
  return token === "" ? undefined : token;
}

export interface PullRequest {
  /** The base branch's name, unqualified — `main`, not `origin/main`. */
  base: string;
  headSha: string;
}

export async function pullRequest(
  github: GithubClient,
  repo: string,
  pr: number,
): Promise<PullRequest> {
  const body = asRecord(await github.get(`/repos/${repo}/pulls/${String(pr)}`));
  const base = asString(asRecord(body?.base)?.ref);
  const headSha = asString(asRecord(body?.head)?.sha);
  if (base === undefined || headSha === undefined) {
    throw new Error(`could not read the base ref and head sha of ${repo}#${String(pr)}`);
  }
  return { base, headSha };
}

export async function errorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}

// The API payloads are untrusted input, so they are narrowed rather than asserted into shape.

export function asUnknown(value: unknown): unknown {
  return value;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
