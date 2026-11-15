/**
 * QA suite 15: the live-site check after every deploy, through playwright.live.config.ts (`pnpm test:live`).
 * Runs the console, network, cookie and header tests against the deployed site, to catch what Cloudflare adds on its
 * side: injected scripts, cookies, headers that differ from the Worker's.
 *
 *   LIVE_URL                     https://philglov-staging.philglov-es.workers.dev   (https://philglov.es after launch)
 *   CF_ACCESS_CLIENT_ID / _SECRET   an Access service token, while staging is behind Access (docs/setup.md)
 */
import { expect, test } from "@playwright/test";
import { watch } from "./lib.ts";

const PAGES = ["/", "/it", "/journal", "/lisbona", "/it/lisbona", "/photos", "/photos/lisbon", "/photos/lisbon/tram-28", "/about", "/now", "/rights", "/privacy", "/no-such-page"];
const production = (process.env["LIVE_URL"] ?? "").replace(/\/$/, "") === "https://philglov.es";

for (const path of PAGES) {
  test(`live ${path}: no console noise, no failed or third-party request, no cookie, no injected script`, async ({
    page,
    context,
    baseURL,
  }) => {
    const seen = watch(page, baseURL ?? "", path === "/no-such-page" ? path : undefined);
    const res = await page.goto(path, { waitUntil: "load" });
    expect(res?.status()).toBe(path === "/no-such-page" ? 404 : 200);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState("networkidle");
    expect(seen.problems).toEqual([]);
    expect(await context.cookies(), "no cookie, not even Cloudflare's").toEqual([]);
    // Scripts: the one inline theme script, JSON-LD data, and files of this site. Nothing Cloudflare injected.
    const scripts = await page.evaluate(() =>
      [...document.scripts].map((s) => ({ src: s.getAttribute("src"), type: s.type, len: s.textContent?.length ?? 0 })),
    );
    for (const s of scripts) {
      if (s.src) expect(s.src, "scripts come from /_assets/").toMatch(/^\/_assets\/[^/]+\.js$/);
      else expect(["", "application/ld+json", "text/javascript", "module"]).toContain(s.type);
    }
    expect(scripts.filter((s) => !s.src && s.type !== "application/ld+json"), "one inline script").toHaveLength(1);
    expect(await page.locator('script[src*="cloudflare"], script[src*="cdn-cgi"], iframe').count()).toBe(0);
  });
}

test("live headers: CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, TDM; no Set-Cookie", async ({ request }) => {
  const problems: string[] = [];
  for (const path of ["/", "/it/lisbona", "/no-such-page", "/api/comment", "/feed.xml", "/robots.txt", "/_assets/share/default.png"]) {
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
  expect((await request.get("/admin", { maxRedirects: 0 })).status(), "/admin is not open to the public").not.toBe(200);
});
