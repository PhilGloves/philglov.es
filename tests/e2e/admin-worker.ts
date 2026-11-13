/**
 * The real Worker for the /admin browser tests, run inside the Playwright process.
 *
 * /admin cannot be opened through `pnpm preview`: there is no Access in front of it there, and the Worker has no
 * local bypass. So, like tests/worker (vitest.config.ts), these tests make their own Access: a key pair for this
 * run, its JWKS answered here when the Worker fetches it, and a JWT signed with it that the server below adds to
 * every request, as Access does at the edge. The Worker verifies it for real, then checks the CSRF token and the
 * origin. Each test gets its own server on 127.0.0.1 (a real one, so redirects behave as in a browser) and its own
 * database: the real migrations on Node's built-in SQLite (node:sqlite) behind the few D1 calls the admin makes.
 * GitHub (for /admin/write) is a small stand-in like the one in vitest.config.ts: it reads entry files from this
 * checkout, records what the Worker writes, and lists the open pull requests a test sets. R2 is a stand-in that has
 * every photo. The stylesheet and entries.json come from dist/, so run `pnpm build` first.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";

const TEAM = "test-team.cloudflareaccess.com";
const AUD = "test-aud";
const dist = new URL("../../dist/", import.meta.url);

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "e2e", alg: "RS256", use: "sig" }] };
const jwt = await new SignJWT({ email: "owner@example.test" })
  .setProtectedHeader({ alg: "RS256", kid: "e2e" })
  .setIssuer(`https://${TEAM}`)
  .setAudience(AUD)
  .setSubject("owner-sub")
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(privateKey);

const appKey = await exportPKCS8((await generateKeyPair("RS256", { extractable: true })).privateKey);

export interface GitHubCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** What the GitHub stand-in knows and has been asked; reset by each serveAdmin(). */
export interface FakeGitHub {
  /** Open pull requests, as GitHub lists them. */
  pulls: { html_url: string; title: string; created_at: string; user: { login: string } }[];
  calls: GitHubCall[];
}
let github: FakeGitHub = { pulls: [], calls: [] };

async function fakeGitHub(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = request.method === "GET" ? null : ((await request.json()) as Record<string, unknown>);
  github.calls.push({ method: request.method, path: url.pathname + url.search, body });
  if (/^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname))
    return Response.json(
      { token: "ghs_e2e", expires_at: new Date(Date.now() + 3600_000).toISOString() },
      { status: 201 },
    );
  if (url.pathname === "/graphql")
    return Response.json({ data: { enablePullRequestAutoMerge: { clientMutationId: null } } });
  const contents = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(url.pathname);
  if (contents && request.method === "GET") {
    try {
      const text = readFileSync(new URL(`../../${contents[1]}`, import.meta.url), "utf8");
      const sha = createHash("sha1").update(text).digest("hex");
      return Response.json({ sha, encoding: "base64", content: Buffer.from(text).toString("base64") });
    } catch {
      return Response.json({ message: "Not Found" }, { status: 404 });
    }
  }
  if (contents) return Response.json({ content: {} }, { status: 201 });
  if (url.pathname.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "main-sha" } });
  if (url.pathname.endsWith("/git/refs")) return Response.json({}, { status: 201 });
  if (url.pathname.endsWith("/pulls") && request.method === "GET") return Response.json(github.pulls);
  if (url.pathname.endsWith("/pulls"))
    return Response.json(
      { html_url: "https://github.com/test/repo/pull/99", number: 99, node_id: "PR_e2e" },
      { status: 201 },
    );
  return Response.json({ message: "Not Found" }, { status: 404 });
}

// The Worker's outbound requests: jose fetching the team's keys, and the GitHub App. Answer both here.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  if (request.url === `https://${TEAM}/cdn-cgi/access/certs`) return Promise.resolve(Response.json(jwks));
  if (new URL(request.url).host === "api.github.com") return fakeGitHub(request);
  return realFetch(request);
};

// The Worker's own types (workers-types) clash with the DOM types Playwright needs, so it is loaded untyped here;
// `tsc -p worker` checks it. The path is a variable so this file's type check does not follow it.
const workerPath = "../../worker/src/index.ts";
const worker = (await import(workerPath)).default as {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};

type Row = Record<string, SQLInputValue>;

/** The D1 calls the admin pages make (prepare, bind, all, first, run), on a fresh in-memory database. */
function d1(db: DatabaseSync) {
  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    all: async () => ({ results: db.prepare(sql).all(...params), success: true, meta: {} }),
    first: async (column?: string) => {
      const row = db.prepare(sql).get(...params) as Row | undefined;
      return row === undefined ? null : column ? row[column] : row;
    },
    run: async () => {
      const r = db.prepare(sql).run(...params);
      return {
        results: [],
        success: true,
        meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
      };
    },
  });
  return { prepare: (sql: string) => statement(sql) };
}

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  json: "application/json",
  woff2: "font/woff2",
  js: "text/javascript; charset=utf-8",
};
function fromDist(path: string): Response {
  try {
    const type = TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream";
    return new Response(readFileSync(new URL(`.${path}`, dist)), { headers: { "Content-Type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export interface Admin {
  /** http://127.0.0.1:<port>, this test's site. */
  origin: string;
  db: DatabaseSync;
  github: FakeGitHub;
  /** From now on every request is answered as Access answers an expired login: a redirect to its sign-in page. */
  expireLogin(): void;
  comment(row?: { name?: string; email?: string; status?: string }): number;
  report(message?: string): number;
  close(): Promise<void>;
}

/** A fresh database, the Worker, and the Access stand-in in front of it. */
export async function serveAdmin(): Promise<Admin> {
  const db = new DatabaseSync(":memory:");
  const migrations = new URL("../../worker/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, migrations), "utf8"));
  github = { pulls: [], calls: [] };
  const env = {
    SITE_ENV: "local",
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    NOTIFY: "off",
    FORM_HMAC_KEY: crypto.randomUUID(),
    IP_SALT: crypto.randomUUID(),
    DB: d1(db),
    ASSETS: { fetch: async (request: Request) => fromDist(new URL(request.url).pathname) },
    ORIGINALS: { head: async () => ({}) },
    GITHUB_APP_ID: "12345",
    GITHUB_APP_INSTALLATION_ID: "678",
    GITHUB_APP_PRIVATE_KEY: appKey,
    GITHUB_REPO: "PhilGloves/philglov.es",
  };
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} };
  let expired = false;
  let origin = "";

  async function handle(req: IncomingMessage): Promise<Response> {
    const url = new URL(req.url ?? "/", origin);
    // Access's sign-in page lives on another origin (here: localhost instead of 127.0.0.1).
    if (url.pathname === "/cdn-cgi/access/login")
      return new Response("<!doctype html><title>Sign in</title><h1>Sign in</h1>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    // Static assets never reach the Worker (run_worker_first excludes /_assets/*).
    if (url.pathname.startsWith("/_assets/")) return fromDist(url.pathname);
    if (expired)
      return new Response(null, {
        status: 302,
        headers: { Location: `${origin.replace("127.0.0.1", "localhost")}/cdn-cgi/access/login` },
      });
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    headers.set("Cf-Access-Jwt-Assertion", jwt);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    return worker.fetch(
      new Request(url, { method: req.method ?? "GET", headers, ...(body ? { body } : {}) }),
      env,
      ctx,
    );
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(req)
      .then(async (answer) => {
        res.writeHead(answer.status, Object.fromEntries(answer.headers));
        res.end(Buffer.from(await answer.arrayBuffer()));
      })
      .catch((err: unknown) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    origin,
    db,
    github,
    expireLogin: () => {
      expired = true;
    },
    comment: ({ name = "Marta", email = "marta@example.com", status = "pending" } = {}) =>
      Number(
        db
          .prepare(
            "INSERT INTO comments (slug, lang, name, email, body, status, created_at, ip_hash) VALUES ('lisbona', 'en', ?, ?, 'Hills are a negotiation.', ?, ?, 'h')",
          )
          .run(name, email, status, Date.now()).lastInsertRowid,
      ),
    report: (message = "A typo in the title.") =>
      Number(
        db
          .prepare("INSERT INTO reports (page_url, message, created_at, status) VALUES ('/it', ?, ?, 'open')")
          .run(message, Date.now()).lastInsertRowid,
      ),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
