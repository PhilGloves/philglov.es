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
 * checkout, records what the Worker writes, keeps it on its branch, and lists as open the pull requests a test sets
 * and the ones the Worker opened. R2 is a stand-in that has
 * the photos the checkout's entries show and what the Worker uploads during the test (the upload endpoint never writes
 * over a stored key, decision 0030, so a stand-in that had every key would leave it no free name). The stylesheet and
 * entries.json come from dist/, so run `pnpm build` first.
 */
import { readdirSync, readFileSync } from "node:fs";
import { journalPhotoKeys } from "../../scripts/lib/photo-keys.ts";
import { fixtureJournal } from "../fixtures/content.ts";
import { fakeGitHub, githubFetch, type FakeGitHub } from "../fixtures/github.ts";
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

let github = fakeGitHub();

// The Worker's outbound requests: jose fetching the team's keys, and the GitHub App. Answer both here. Nothing else
// leaves this process: no test may open a real pull request or write to the real repository, so every other host
// (api.github.com is answered by the stand-in, never forwarded) is refused and listed in `blockedOutbound`.
const realFetch = globalThis.fetch;
export const blockedOutbound: string[] = [];
globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (request.url === `https://${TEAM}/cdn-cgi/access/certs`) return Promise.resolve(Response.json(jwks));
  if (url.host === "api.github.com") return githubFetch(github, request);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return realFetch(request);
  blockedOutbound.push(`${request.method} ${url.origin}${url.pathname}`);
  return Promise.reject(new TypeError(`test server: outbound request to ${url.host} refused`));
};

// workerd has FixedLengthStream (a TransformStream with a promised length, which R2 needs for a streamed upload);
// Node does not. A plain TransformStream stands in for it here.
const nodeGlobals = globalThis as unknown as { FixedLengthStream?: unknown };
nodeGlobals.FixedLengthStream ??= class {
  readable: ReadableStream;
  writable: WritableStream;
  constructor() {
    const { readable, writable } = new TransformStream();
    this.readable = readable;
    this.writable = writable;
  }
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
  // Pages as Cloudflare's asset handling serves them: /lisbona is dist/lisbona.html, / is dist/index.html.
  const file = path === "/" ? "/index.html" : /\.[a-z0-9]+$/.test(path) ? path : `${path}.html`;
  try {
    const type = file.endsWith(".html")
      ? "text/html; charset=utf-8"
      : (TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream");
    return new Response(readFileSync(new URL(`.${file}`, dist)), { headers: { "Content-Type": type } });
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
  github = fakeGitHub();
  // What the originals bucket holds at the start: every photo a fixture entry shows (the suites run on the fixtures, 0033).
  const stored = new Set(journalPhotoKeys(fixtureJournal));
  const env = {
    SITE_ENV: "local",
    PHOTO_UPLOADS: "on",
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    NOTIFY: "off",
    FORM_HMAC_KEY: crypto.randomUUID(),
    IP_SALT: crypto.randomUUID(),
    DB: d1(db),
    ASSETS: { fetch: async (request: Request) => fromDist(new URL(request.url).pathname) },
    ORIGINALS: {
      head: async (key: string) => (stored.has(key) ? {} : null),
      // The upload endpoint streams the photo into R2; read it all, as R2 would, and keep only its key.
      put: async (key: string, body: ReadableStream | null) => {
        if (body) await new Response(body).arrayBuffer();
        stored.add(key);
        return {};
      },
    },
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
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      // A test that made the Worker reach for anything but the stand-ins fails here, whatever else it checked.
      const leaked = blockedOutbound.splice(0);
      if (leaked.length) throw new Error(`the Worker tried to reach outside the test: ${leaked.join(", ")}`);
    },
  };
}
