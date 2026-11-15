/**
 * QA suite 9: security headers and the CSP.
 *  - CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy and COOP on every kind of response: pages, the 404
 *    page, redirects, the API (every status it answers with), feeds, the sitemap, fonts and images.
 *  - On every built page the only executable inline script is the theme script, whose SHA-256 is the one in the CSP
 *    header; JSON-LD data blocks are allowed; no <style> element, no inline style attribute, no inline event handler,
 *    no javascript: URL; every script, stylesheet, image and font is this site's own.
 *  - The browser enforces it: an injected inline script, a third-party script, a third-party image and a request to
 *    another host are all blocked, and each raises a securitypolicyviolation event.
 */
import { createHash } from "node:crypto";
import { expect, test, type APIResponse } from "@playwright/test";
import { builtPages, readBuilt } from "./lib.ts";

function assertSecurityHeaders(res: APIResponse, label: string, hash?: string): string[] {
  const h = res.headers();
  const out: string[] = [];
  const csp = h["content-security-policy"] ?? "";
  // The admin pages have their own, stricter CSP (default-src 'none', scripts from /admin/*.js behind Access).
  const admin = label.includes("admin");
  if (!csp.includes(admin ? "default-src 'none'" : "default-src 'self'")) out.push(`${label}: CSP default-src is not the expected one (${csp})`);
  if (/unsafe-inline|unsafe-eval/.test(csp)) out.push(`${label}: CSP allows unsafe-inline or unsafe-eval`);
  for (const must of ["frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'self'"])
    if (!csp.includes(must)) out.push(`${label}: CSP lacks ${must}`);
  if (hash && !csp.includes(`'${hash}'`)) out.push(`${label}: CSP does not carry the theme script's hash ${hash}`);
  const hsts = h["strict-transport-security"] ?? "";
  if (!/max-age=(\d+)/.test(hsts) || Number(/max-age=(\d+)/.exec(hsts)?.[1]) < 31_536_000)
    out.push(`${label}: HSTS max-age under a year (${hsts})`);
  if (!/includeSubDomains/i.test(hsts)) out.push(`${label}: HSTS without includeSubDomains`);
  if (h["x-content-type-options"] !== "nosniff") out.push(`${label}: no X-Content-Type-Options: nosniff`);
  if (!h["referrer-policy"]) out.push(`${label}: no Referrer-Policy`);
  if (!/camera=\(\)/.test(h["permissions-policy"] ?? "")) out.push(`${label}: no Permissions-Policy`);
  if (h["cross-origin-opener-policy"] !== "same-origin") out.push(`${label}: COOP is ${h["cross-origin-opener-policy"]}`);
  if (h["set-cookie"]) out.push(`${label}: sets a cookie`);
  return out;
}

const sha256 = (text: string) => `sha256-${createHash("sha256").update(text).digest("base64")}`;

test("every kind of response carries the security headers", async ({ request }) => {
  const problems: string[] = [];
  const get = async (path: string, label: string) =>
    problems.push(...assertSecurityHeaders(await request.get(path, { maxRedirects: 0 }), `${label} ${path}`));

  await get("/", "page");
  await get("/it/lisbona", "entry");
  await get("/no-such-page", "404 page");
  await get("/it/", "redirect"); // trailing slash → slash-less
  await get("/api/comment", "API 405");
  await get("/api/nothing", "API 404");
  await get("/admin", "admin 403");
  await get("/feed.xml", "feed");
  await get("/it/feed.xml", "feed");
  await get("/sitemap.xml", "sitemap");
  await get("/robots.txt", "robots");
  await get("/.well-known/tdmrep.json", "tdmrep");
  await get("/_assets/fonts/crimson-pro.woff2", "font");
  await get("/_assets/share/default.png", "image");

  // POST answers: a refused form post (422), and the background answer (200 JSON).
  const form = { name: "", email: "x", comment: "", website: "", token: "x", slug: "lisbona", lang: "en" };
  const refused = await request.post("/api/comment", { form, maxRedirects: 0, headers: { "CF-Connecting-IP": "198.18.9.9" } });
  problems.push(...assertSecurityHeaders(refused, `API ${refused.status()} (plain post)`));
  const json = await request.post("/api/comment", {
    form,
    maxRedirects: 0,
    headers: { Accept: "application/json", "CF-Connecting-IP": "198.18.9.10" },
  });
  problems.push(...assertSecurityHeaders(json, `API ${json.status()} (JSON)`));
  expect(json.headers()["content-type"]).toContain("application/json");
  expect(problems).toEqual([]);
});

test("every built page: one inline script, the theme script, and the CSP hash is its hash", async ({ request }) => {
  const header = (await request.get("/")).headers()["content-security-policy"] ?? "";
  const hashes = [...header.matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]);
  expect(hashes, "the CSP names exactly one script hash").toHaveLength(1);
  const problems: string[] = [];
  for (const p of builtPages()) {
    const html = readBuilt(p.file);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1] ?? "", body: m[2] ?? "" }));
    const executable = scripts.filter((s) => !/type="application\/ld\+json"/.test(s.attrs));
    const inline = executable.filter((s) => !/\ssrc=/.test(s.attrs));
    for (const s of inline) if (sha256(s.body) !== hashes[0]) problems.push(`${p.path}: an inline script that is not the hashed one`);
    if (inline.length > 1) problems.push(`${p.path}: ${inline.length} inline scripts`);
    for (const s of executable.filter((x) => /\ssrc=/.test(x.attrs)))
      if (!/\ssrc="\/_assets\/[^"]+\.js"/.test(s.attrs)) problems.push(`${p.path}: script from ${s.attrs.trim()}`);
    if (/<style[\s>]/i.test(html)) problems.push(`${p.path}: a <style> element`);
    if (/\sstyle=/i.test(html)) problems.push(`${p.path}: an inline style attribute`);
    if (/\son[a-z]+=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) problems.push(`${p.path}: an inline event handler`);
    if (/(href|src|action)="\s*javascript:/i.test(html)) problems.push(`${p.path}: a javascript: URL`);
    for (const m of html.matchAll(/<(script|img|source|link|iframe|video|audio|object|embed)\b[^>]*?\s(?:src|href|srcset)="(https?:\/\/[^"]+)"/g)) {
      const url = m[2] ?? "";
      const loads = m[1] !== "link" || /rel="(stylesheet|preload|icon|apple-touch-icon|modulepreload)"/.test(m[0]);
      // Metadata links to philglov.es itself (canonical, alternate) are fine; anything else that loads is not.
      if (loads && !url.startsWith("https://philglov.es")) problems.push(`${p.path}: loads ${url}`);
    }
    if (/<iframe|<embed|<object/i.test(html)) problems.push(`${p.path}: an embed`);
  }
  expect(problems).toEqual([]);
});

test.describe("the browser enforces the CSP", () => {
  test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, "needs JavaScript");

  test("an injected inline script, a third-party script, image and request are all blocked", async ({ page }) => {
    // Chromium reports a request the CSP stops, and then fails it with ERR_BLOCKED_BY_CSP ("csp" in Playwright): nothing leaves the machine.
    const left: string[] = [];
    const elsewhere = new Set<string>();
    page.on("request", (req) => {
      if (new URL(req.url()).hostname !== "127.0.0.1") elsewhere.add(req.url());
    });
    page.on("requestfailed", (req) => {
      if (!/^(csp|.*BLOCKED_BY_CSP.*)$/.test(req.failure()?.errorText ?? "")) left.push(`${req.url()} failed with ${req.failure()?.errorText}`);
      elsewhere.delete(req.url());
    });
    await page.goto("/lisbona");
    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => violations.push(`${e.effectiveDirective}: ${e.blockedURI || "inline"}`));
      const w = window as unknown as { __ran?: boolean };

      const inline = document.createElement("script");
      inline.textContent = "window.__ran = true";
      document.body.append(inline);

      const remote = document.createElement("script");
      remote.src = "https://example.com/x.js";
      document.body.append(remote);

      const img = document.createElement("img");
      img.src = "https://example.com/x.png";
      document.body.append(img);

      const sheet = document.createElement("style");
      sheet.textContent = "body { outline: 9px solid red }";
      document.head.append(sheet);

      let fetchBlocked = false;
      try {
        await fetch("https://example.com/");
      } catch {
        fetchBlocked = true;
      }
      await new Promise((r) => setTimeout(r, 300));
      return { ran: w.__ran === true, violations, fetchBlocked, outline: getComputedStyle(document.body).outlineStyle };
    });
    expect(result.ran, "an injected inline script did not run").toBe(false);
    expect(result.fetchBlocked, "fetch to another origin is blocked").toBe(true);
    expect(result.outline, "an injected <style> did not apply").not.toBe("solid");
    const directives = result.violations.map((v) => v.split(":")[0]);
    for (const d of ["script-src-elem", "img-src", "connect-src", "style-src-elem"])
      expect(directives, `a ${d} violation was raised (${result.violations.join(" | ")})`).toContain(d);
    await page.waitForTimeout(300);
    expect([...elsewhere, ...left], "every request to another host was blocked by the CSP").toEqual([]);
  });
});
