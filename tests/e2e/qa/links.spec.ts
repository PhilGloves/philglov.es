/**
 * QA suite 7: broken links. Crawls every built page: every internal link, image, script, stylesheet, feed, the
 * sitemap's URLs and every #anchor must answer 200 directly (no redirect, no 404). Outbound links to other sites are
 * listed, not followed. Form actions are POST-only and are checked for being this site's own.
 */
import { expect, test } from "@playwright/test";
import { builtPages, readBuilt } from "./lib.ts";

const ORIGIN = "https://philglov.es";
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');

test("every internal link, asset and anchor on every page resolves", async ({ request }) => {
  test.setTimeout(180_000);
  const pages = builtPages();
  const htmlByPath = new Map(pages.map((p) => [p.path, readBuilt(p.file)]));
  const checked = new Map<string, number>();
  const problems: string[] = [];
  const outbound = new Set<string>();

  const idsOf = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  const visit = async (from: string, raw: string, kind: string) => {
    if (raw === "" || /^(mailto:|tel:|data:)/i.test(raw)) return;
    let url: URL;
    try {
      url = new URL(raw, `${ORIGIN}${from === "/no-such-page" ? "/" : from}`);
    } catch {
      problems.push(`${from}: ${kind} "${raw}" is not a URL`);
      return;
    }
    if (url.origin !== ORIGIN) {
      outbound.add(raw);
      return;
    }
    const path = url.pathname;
    if (path !== "/" && path.endsWith("/")) problems.push(`${from}: ${kind} ${raw} ends with a slash`);
    if (!checked.has(path)) {
      if (kind === "form action") checked.set(path, 0);
      else checked.set(path, (await request.get(path, { maxRedirects: 0 })).status());
    }
    const status = checked.get(path);
    if (status !== undefined && status !== 0 && status !== 200)
      problems.push(`${from}: ${kind} ${raw} answers ${status}`);
    if (url.hash.length > 1 && kind === "link") {
      const target = htmlByPath.get(path);
      const id = decodeURIComponent(url.hash.slice(1));
      if (target !== undefined && !idsOf(target).has(id))
        problems.push(`${from}: anchor ${raw} has no element with id="${id}" on ${path}`);
    }
  };

  for (const p of pages) {
    const html = htmlByPath.get(p.path) ?? "";
    for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) await visit(p.path, decode(m[1] ?? ""), "link");
    for (const m of html.matchAll(/<link\b[^>]*?\shref="([^"]*)"/g))
      await visit(p.path, decode(m[1] ?? ""), "link element");
    for (const m of html.matchAll(/<(?:img|script|source|iframe)\b[^>]*?\ssrc="([^"]*)"/g))
      await visit(p.path, decode(m[1] ?? ""), "src");
    for (const m of html.matchAll(/\ssrcset="([^"]*)"/g))
      for (const candidate of decode(m[1] ?? "").split(","))
        await visit(p.path, candidate.trim().split(/\s+/)[0] ?? "", "srcset");
    for (const m of html.matchAll(/<form\b[^>]*?\saction="([^"]*)"/g))
      await visit(p.path, decode(m[1] ?? "").split("#")[0] ?? "", "form action");
  }

  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) await visit("/sitemap.xml", m[1] ?? "", "sitemap URL");
  for (const feed of ["/feed.xml", "/it/feed.xml"]) {
    const xml = await (await request.get(feed)).text();
    for (const m of xml.matchAll(/<link>([^<]+)<\/link>/g)) await visit(feed, m[1] ?? "", "feed link");
  }
  for (const path of ["/robots.txt", "/.well-known/tdmrep.json"]) await visit("/", path, "link");

  test.info().annotations.push({
    type: "outbound links (not followed)",
    description: [...outbound].sort().join(", ") || "none",
  });
  expect(checked.size, "the crawl found pages to check").toBeGreaterThan(60);
  expect(problems).toEqual([]);
});

test("nothing public links to /admin", async () => {
  const offenders: string[] = [];
  for (const p of builtPages()) {
    if (/href="\/admin/.test(readBuilt(p.file))) offenders.push(p.path);
  }
  expect(offenders).toEqual([]);
});
