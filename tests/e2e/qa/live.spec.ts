/**
 * QA suite 15: the live-site check after every deploy, through playwright.live.config.ts (`pnpm test:live`).
 * Runs the console, network, cookie and header tests against the deployed site, to catch what Cloudflare adds on its
 * side: injected scripts, cookies, headers that differ from the Worker's.
 *
 *   LIVE_URL                     https://philglov-staging.philglov-es.workers.dev   (https://philglov.es after launch)
 *   CF_ACCESS_CLIENT_ID / _SECRET   an Access service token, while staging is behind Access (docs/setup.md)
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { watch } from "./lib.ts";

// The pages every deploy has. Entries and photo pages are the owner's content, so they are not named here: the last
// test below takes them from the deployed sitemap (decision 0033).
const PAGES = [
  "/",
  "/it",
  "/journal",
  "/it/journal",
  "/photos",
  "/it/photos",
  "/about",
  "/now",
  "/rights",
  "/privacy",
  "/no-such-page",
];
const production = (process.env["LIVE_URL"] ?? "").replace(/\/$/, "") === "https://philglov.es";

for (const path of PAGES) {
  test(`live ${path}: no console noise, no failed or third-party request, no cookie, no injected script`, async ({
    page,
    context,
    baseURL,
  }) => {
    await checkPage(page, context, baseURL ?? "", path);
  });
}

test("live: every other page the sitemap lists (entries, series, photographs) passes the same checks", async ({
  context,
  baseURL,
  request,
}) => {
  test.setTimeout(300_000);
  const xml = await (await request.get("/sitemap.xml")).text();
  const listed = [...xml.matchAll(/<loc>https:\/\/philglov\.es([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  for (const path of [...new Set(listed)].filter((p) => !PAGES.includes(p))) {
    // A fresh page each time, so one page's watch never sees the next page's requests.
    const page = await context.newPage();
    await test.step(path, () => checkPage(page, context, baseURL ?? "", path));
    await page.close();
  }
});

async function checkPage(page: Page, context: BrowserContext, baseURL: string, path: string): Promise<void> {
  const seen = watch(page, baseURL, path === "/no-such-page" ? path : undefined);
  const res = await page.goto(path, { waitUntil: "load" });
  expect(res?.status()).toBe(path === "/no-such-page" ? 404 : 200);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForLoadState("networkidle");
  expect(seen.problems).toEqual([]);
  // No cookie. On staging, Cloudflare Access sets its own CF_Authorization after a service-token login; that one is
  // Access's, and goes away at launch (production has no Access in front of it), so it is the only one let through.
  const cookies = (await context.cookies()).filter((c) => production || c.name !== "CF_Authorization");
  expect(
    cookies.map((c) => c.name),
    "no cookie of the site's, and none of Cloudflare's apart from Access's own",
  ).toEqual([]);
  // Scripts: the one inline theme script, JSON-LD data, and files of this site. Nothing Cloudflare injected.
  const scripts = await page.evaluate(() =>
    [...document.scripts].map((s) => ({ src: s.getAttribute("src"), type: s.type, len: s.textContent?.length ?? 0 })),
  );
  for (const s of scripts) {
    if (s.src) expect(s.src, "scripts come from /_assets/").toMatch(/^\/_assets\/[^/]+\.js$/);
    else expect(["", "application/ld+json", "text/javascript", "module"]).toContain(s.type);
  }
  expect(
    scripts.filter((s) => !s.src && s.type !== "application/ld+json"),
    "one inline script",
  ).toHaveLength(1);
  expect(await page.locator('script[src*="cloudflare"], script[src*="cdn-cgi"], iframe').count()).toBe(0);
}

test("live headers: CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, TDM; no Set-Cookie", async ({
  request,
}) => {
  const problems: string[] = [];
  for (const path of [
    "/",
    "/it/journal",
    "/no-such-page",
    "/api/comment",
    "/feed.xml",
    "/robots.txt",
    "/_assets/share/default.png",
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    if (!h["content-security-policy"]?.includes("default-src 'self'")) problems.push(`${path}: CSP`);
    if (/unsafe-inline|unsafe-eval/.test(h["content-security-policy"] ?? "")) problems.push(`${path}: CSP unsafe`);
    if (!/max-age=\d{8}/.test(h["strict-transport-security"] ?? "")) problems.push(`${path}: HSTS`);
    if (h["x-content-type-options"] !== "nosniff") problems.push(`${path}: nosniff`);
    if (!h["referrer-policy"]) problems.push(`${path}: Referrer-Policy`);
    if (!h["permissions-policy"]) problems.push(`${path}: Permissions-Policy`);
    if (h["cross-origin-opener-policy"] !== "same-origin") problems.push(`${path}: COOP`);
    if (h["tdm-reservation"] !== "1") problems.push(`${path}: tdm-reservation`);
    if (h["set-cookie"]) problems.push(`${path}: Set-Cookie ${h["set-cookie"]?.slice(0, 40)}`);
    const noindex = /noindex/.test(h["x-robots-tag"] ?? "");
    if (production && noindex && path === "/") problems.push("production home says noindex");
    if (!production && !noindex) problems.push(`${path}: staging must say noindex`);
  }
  expect(problems).toEqual([]);
});

test("live robots.txt and tdmrep.json are served", async ({ request }) => {
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/.well-known/tdmrep.json")).status()).toBe(200);
});

test("live /admin is not open to the public: a request with no token is turned away", async ({
  playwright,
  baseURL,
}) => {
  // The suite's own requests carry the service token, which Access lets in. A visitor has none.
  const visitor = await playwright.request.newContext({ baseURL: baseURL ?? "", extraHTTPHeaders: {} });
  for (const path of ["/admin", "/admin/write"]) {
    const res = await visitor.get(path, { maxRedirects: 0 });
    expect([302, 401, 403], `${path} answers ${res.status()} to a visitor`).toContain(res.status());
  }
  await visitor.dispose();
});
