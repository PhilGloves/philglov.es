/**
 * Worker tests (Vitest inside the Workers runtime, @cloudflare/vitest-plugin).
 * Run after `pnpm build:fixtures`: the Worker serves dist/ through its ASSETS binding (the test build, decision 0033).
 *
 * Nothing leaves the machine. Miniflare's outboundService answers every
 * outbound fetch here, in Node:
 *  - https://test-team.cloudflareaccess.com/cdn-cgi/access/certs: a JWKS made
 *    for this run, so the Access JWT check runs for real against it;
 *  - https://api.github.com: a small stand-in for the GitHub App calls that
 *    reads files from this checkout (src/content/… from the fixtures) and records what the Worker sent. A test
 *    can set, through /__set: files that differ from the checkout (or exist only
 *    on a branch, as "<path>@<branch>"), the open pull requests, a refused
 *    auto-merge, and a write refused as a conflict. Like GitHub, it keeps what the
 *    Worker wrote on a branch and lists the pull requests it opened as open, until
 *    a test merges or closes them (/__set pulls).
 */
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { defineConfig } from "vitest/config";
import { assertFixtureBuild } from "./tests/fixtures/content.ts";
import { fakeGitHub, githubFetch, type FakeGitHub } from "./tests/fixtures/github.ts";

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

/** Miniflare runs in another process, so the Worker tests control the stand-in over fetch. */
function githubAdapter() {
  let state = fakeGitHub();
  // The installation token is cached per isolate, so this history survives individual test resets.
  const history: FakeGitHub["calls"] = [];
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/__recorded") return Response.json(url.searchParams.has("all") ? history : state.calls);
    if (url.pathname === "/__reset") {
      state = fakeGitHub();
      return Response.json({});
    }
    if (url.pathname === "/__set") {
      Object.assign(state, (await request.json()) as Partial<Omit<FakeGitHub, "calls">>);
      return Response.json({});
    }
    return githubFetch(state, request, history);
  };
}

export default defineConfig(async () => {
  assertFixtureBuild();
  const migrations = await readD1Migrations("worker/migrations");
  const access = await accessFixtures();
  const github = githubAdapter();
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
      // Vitest 5.1.1 (vitest-dev/vitest#11750) ends each cached module with a `//# vitestSourceMap=` line of raw JSON;
      // the U+2028/U+2029 in worker/src/frontmatter.ts end that comment line inside workerd, and every file fails to
      // load ("Invalid or unexpected token"). The cache only speeds up reruns.
      fsModuleCache: false,
    },
  };
});
