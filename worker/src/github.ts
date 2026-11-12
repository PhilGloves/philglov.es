/**
 * The GitHub App behind /admin/write (B8, decision 0006). Installed on this
 * repository only, with Contents and Pull requests: write. It opens a branch
 * and a pull request; branch protection keeps it off main, so only a merge
 * after green checks publishes. The private key is a wrangler secret in
 * PKCS#8 form (docs/setup.md, step 10), which jose can sign with.
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

export interface Publication {
  path: string;
  text: string;
  /** The blob sha of the file being replaced, when the entry already exists in this language. */
  sha?: string | undefined;
  branch: string;
  title: string;
  body: string;
}

/** New branch from main, one commit with the file, one pull request. Returns the pull request's URL. */
export async function openPullRequest(env: Env, p: Publication): Promise<string> {
  const main = await call<{ object: { sha: string } }>(env, "read main", "GET", "/git/ref/heads/main");
  if (!main) throw new GitHubError(404, "read main");
  await call(env, "create branch", "POST", "/git/refs", { ref: `refs/heads/${p.branch}`, sha: main.object.sha });
  await call(env, "write file", "PUT", `/contents/${p.path}`, {
    message: p.title,
    content: utf8ToBase64(p.text),
    branch: p.branch,
    ...(p.sha ? { sha: p.sha } : {}),
  });
  const pr = await call<{ html_url: string }>(env, "open pull request", "POST", "/pulls", {
    title: p.title,
    head: p.branch,
    base: "main",
    body: p.body,
  });
  if (!pr) throw new GitHubError(500, "open pull request");
  return pr.html_url;
}
