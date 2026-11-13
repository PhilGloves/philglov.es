/**
 * Worker tests (Vitest inside the Workers runtime, @cloudflare/vitest-plugin).
 * Run after `pnpm build`: the Worker serves dist/ through its ASSETS binding.
 *
 * Nothing leaves the machine. Miniflare's outboundService answers every
 * outbound fetch here, in Node:
 *  - https://test-team.cloudflareaccess.com/cdn-cgi/access/certs: a JWKS made
 *    for this run, so the Access JWT check runs for real against it;
 *  - https://api.github.com: a small stand-in for the GitHub App calls that
 *    reads files from this checkout and records what the Worker sent. A test
 *    can set, through /__set: files that differ from the checkout, the open
 *    pull requests, a refused auto-merge, and a write refused as a conflict.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { defineConfig } from "vitest/config";

const TEAM = "test-team.cloudflareaccess.com";
const AUD = "test-aud";

async function accessFixtures() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const sign = (aud: string, sub = "owner-sub") =>
    new SignJWT({ email: "owner@example.test" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`https://${TEAM}`)
      .setAudience(aud)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(privateKey);
  // A key Access never published: a token signed with it must be refused.
  const stranger = await generateKeyPair("RS256");
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(`https://${TEAM}`)
    .setAudience(AUD)
    .setSubject("owner-sub")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(stranger.privateKey);
  return { jwks: { keys: [jwk] }, good: await sign(AUD), wrongAud: await sign("someone-else"), forged };
}

interface Recorded {
  method: string;
  path: string;
  body: unknown;
}

interface FakeState {
  files: Record<string, string>;
  pulls: unknown[];
  autoMergeRefused: boolean;
  writeConflict: boolean;
}

const fresh = (): FakeState => ({ files: {}, pulls: [], autoMergeRefused: false, writeConflict: false });
/** A blob sha that changes with the text, like GitHub's. */
const blobSha = (text: string): string => createHash("sha1").update(text).digest("hex");

function fakeGitHub() {
  let state = fresh();
  const recorded: Recorded[] = [];
  // Every call since the start: the installation token is cached per isolate, so it is asked for once.
  const all: Recorded[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/__recorded") return json(200, url.searchParams.has("all") ? all : recorded);
    if (url.pathname === "/__reset") {
      recorded.length = 0;
      state = fresh();
      return json(200, {});
    }
    if (url.pathname === "/__set") {
      state = { ...state, ...((await request.json()) as Partial<FakeState>) };
      return json(200, {});
    }
    const body = request.method === "GET" ? null : await request.json().catch(() => null);
    recorded.push({ method: request.method, path: url.pathname + url.search, body });
    all.push({ method: request.method, path: url.pathname + url.search, body });
    if (/^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname))
      return json(201, { token: "ghs_test", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    const contents = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(url.pathname);
    if (contents && request.method === "GET") {
      try {
        const path = contents[1] ?? "";
        const text = state.files[path] ?? readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
        return json(200, {
          sha: blobSha(text),
          encoding: "base64",
          content: Buffer.from(text).toString("base64"),
        });
      } catch {
        return json(404, { message: "Not Found" });
      }
    }
    if (contents && request.method === "PUT")
      return state.writeConflict ? json(409, { message: "does not match" }) : json(201, { content: {} });
    if (url.pathname === "/graphql")
      return json(
        200,
        state.autoMergeRefused
          ? { errors: [{ message: "Auto merge is not allowed for this repository" }] }
          : { data: { enablePullRequestAutoMerge: { clientMutationId: null } } },
      );
    if (url.pathname.endsWith("/pulls") && request.method === "GET") return json(200, state.pulls);
    if (url.pathname.endsWith("/git/ref/heads/main")) return json(200, { object: { sha: "main-sha" } });
    if (url.pathname.endsWith("/git/refs")) return json(201, {});
    if (url.pathname.endsWith("/pulls"))
      return json(201, { html_url: "https://github.com/test/repo/pull/99", number: 99, node_id: "PR_node99" });
    return json(404, { message: "Not Found" });
  };
}

export default defineConfig(async () => {
  const migrations = await readD1Migrations("worker/migrations");
  const access = await accessFixtures();
  const github = fakeGitHub();
  const { privateKey: appKey } = await generateKeyPair("RS256", { extractable: true });
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Per-slug comment caching is not under test; off, so each test sees the database.
          cacheAPI: false,
          bindings: {
            TEST_MIGRATIONS: migrations,
            TEST_ACCESS_JWT: access.good,
            TEST_ACCESS_JWT_WRONG_AUD: access.wrongAud,
            TEST_ACCESS_JWT_FORGED: access.forged,
            FORM_HMAC_KEY: "test-form-key",
            IP_SALT: "test-salt",
            ACCESS_TEAM_DOMAIN: TEAM,
            ACCESS_AUD: AUD,
            GITHUB_APP_ID: "12345",
            GITHUB_APP_INSTALLATION_ID: "678",
            GITHUB_APP_PRIVATE_KEY: await exportPKCS8(appKey),
            NOTIFY_TO: "",
          },
          outboundService: async (request: Request) => {
            const url = new URL(request.url);
            if (url.host === TEAM && url.pathname === "/cdn-cgi/access/certs")
              return new Response(JSON.stringify(access.jwks), { headers: { "Content-Type": "application/json" } });
            if (url.host === "api.github.com") return github(request);
            return new Response("blocked in tests", { status: 599 });
          },
        },
      }),
    ],
    test: {
      include: ["tests/worker/**/*.test.ts"],
      setupFiles: ["tests/worker/setup.ts"],
    },
  };
});
