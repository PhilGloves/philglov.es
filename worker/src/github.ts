/**
 * The GitHub App behind /admin/write (B8, decision 0006). Installed on this
 * repository only, with Contents and Pull requests: write. It opens a branch
 * and a pull request and turns on auto-merge for it (decision 0021): the
 * ruleset on main still requires the Test check, which also proves that a
 * publisher pull request changes entry files only. The private key is a
 * wrangler secret in PKCS#8 form (docs/setup.md, step 10), which jose can sign with.
 */
import { importPKCS8, SignJWT } from "jose";
import { base64ToUtf8, utf8ToBase64 } from "./crypto.ts";
import { required } from "./secrets.ts";

const API = "https://api.github.com";
let installation: { token: string; expires: number; for: string } | undefined;

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly step: string,
  ) {
    super(`GitHub ${step} answered ${status}`);
    this.name = "GitHubError";
  }
}

export const githubConfigured = (env: Env): boolean =>
  Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_INSTALLATION_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_REPO);

async function appJwt(env: Env): Promise<string> {
  const key = await importPKCS8(required(env.GITHUB_APP_PRIVATE_KEY), "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(required(env.GITHUB_APP_ID))
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 540)
    .sign(key);
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "philglov-publisher",
  };
}

/** An installation token limited to this repository, cached until 5 minutes before it expires. */
async function token(env: Env): Promise<string> {
  const now = Date.now();
  if (installation && installation.for === env.GITHUB_APP_INSTALLATION_ID && installation.expires - 300_000 > now)
    return installation.token;
  const repo = env.GITHUB_REPO.split("/")[1] ?? "";
  const res = await fetch(`${API}/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`, {
    method: "POST",
    headers: { ...headers(await appJwt(env)), "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: [repo], permissions: { contents: "write", pull_requests: "write" } }),
  });
  if (!res.ok) throw new GitHubError(res.status, "installation token");
  const data = (await res.json()) as { token: string; expires_at: string };
  installation = {
    token: data.token,
    expires: Date.parse(data.expires_at),
    for: required(env.GITHUB_APP_INSTALLATION_ID),
  };
  return data.token;
}

async function call<T>(env: Env, step: string, method: string, path: string, body?: unknown): Promise<T | null> {
  const res = await fetch(`${API}/repos/${env.GITHUB_REPO}${path}`, {
    method,
    headers: { ...headers(await token(env)), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 404 && method === "GET") return null;
  if (!res.ok) throw new GitHubError(res.status, step);
  return (await res.json()) as T;
}

export interface RepoFile {
  sha: string;
  text: string;
}

/** A file on main, or null when it does not exist. */
export async function readFile(env: Env, path: string, ref = "main"): Promise<RepoFile | null> {
  const file = await call<{ sha: string; content: string; encoding: string }>(
    env,
    "read file",
    "GET",
    `/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  if (!file) return null;
  return { sha: file.sha, text: file.encoding === "base64" ? base64ToUtf8(file.content) : file.content };
}

/** The login GitHub gives the App's pull requests; ci.yml checks the same name. */
export const PUBLISHER = "philglov-publisher[bot]";

export interface Publication {
  path: string;
  text: string;
  /** The blob sha of the file being replaced, when the entry already exists in this language. */
  sha?: string | undefined;
  branch: string;
  title: string;
  body: string;
}

export interface PullRequest {
  url: string;
  number: number;
  /** GraphQL id, for enablePullRequestAutoMerge. */
  nodeId: string;
}

/**
 * New branch from main, one commit with the file, one pull request. With `sha`, GitHub refuses the write (409) when
 * the file on main is no longer that version: the entry changed since it was opened.
 */
export async function openPullRequest(env: Env, p: Publication): Promise<PullRequest> {
  const main = await call<{ object: { sha: string } }>(env, "read main", "GET", "/git/ref/heads/main");
  if (!main) throw new GitHubError(404, "read main");
  await call(env, "create branch", "POST", "/git/refs", { ref: `refs/heads/${p.branch}`, sha: main.object.sha });
  await call(env, "write file", "PUT", `/contents/${p.path}`, {
    message: p.title,
    content: utf8ToBase64(p.text),
    branch: p.branch,
    ...(p.sha ? { sha: p.sha } : {}),
  });
  const pr = await call<{ html_url: string; number: number; node_id: string }>(
    env,
    "open pull request",
    "POST",
    "/pulls",
    { title: p.title, head: p.branch, base: "main", body: p.body },
  );
  if (!pr) throw new GitHubError(500, "open pull request");
  return { url: pr.html_url, number: pr.number, nodeId: pr.node_id };
}

/**
 * Auto-merge (merge commit) as soon as the required checks pass. Needs "Allow auto-merge" on in the repository
 * settings (docs/setup.md, step 10b) and no permission beyond Contents and Pull requests: write.
 */
export async function enableAutoMerge(env: Env, pr: PullRequest): Promise<void> {
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...headers(await token(env)), "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: MERGE }) { clientMutationId } }",
      variables: { id: pr.nodeId },
    }),
  });
  if (!res.ok) throw new GitHubError(res.status, "auto-merge");
  // GraphQL reports refusals (auto-merge not allowed, already clean, …) with 200 and an errors list.
  const data = (await res.json()) as { errors?: unknown[] };
  if (data.errors?.length) throw new GitHubError(422, "auto-merge");
}

export interface OpenPublication {
  url: string;
  title: string;
  openedAt: number;
}

/** The publisher's pull requests that are still open (not merged yet), oldest first. */
export async function openPublications(env: Env): Promise<OpenPublication[]> {
  const pulls = await call<{ html_url: string; title: string; created_at: string; user: { login: string } }[]>(
    env,
    "list pull requests",
    "GET",
    "/pulls?state=open&base=main&sort=created&direction=asc&per_page=50",
  );
  return (pulls ?? [])
    .filter((p) => p.user.login === PUBLISHER)
    .map((p) => ({ url: p.html_url, title: p.title, openedAt: Date.parse(p.created_at) }));
}
