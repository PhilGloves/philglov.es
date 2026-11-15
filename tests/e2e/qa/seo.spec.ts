/**
 * QA suite 11: SEO, on every page the build wrote.
 *  - unique <title> containing "Filippo Guanti", a meta description, a canonical, Open Graph and Twitter tags with a
 *    share image that exists;
 *  - JSON-LD parses and validates: Person (with sameAs) on home and About in both languages, BlogPosting on journal
 *    entries, ImageObject on photo pages, and nothing else executes in a data block;
 *  - sitemap.xml lists every indexable page, once, in both languages where both exist, with hreflang pairs equal to
 *    the page's own; robots.txt points at it; the feeds list every entry once in its language.
 *  - indexing: on staging every page says noindex; with QA_PROD=1 (a SITE_ENV=production build, `pnpm qa:production`)
 *    no indexable page says noindex, anywhere: header or meta tag.
 */
import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { builtPages, readBuilt } from "./lib.ts";

const ORIGIN = "https://philglov.es";
const PROD = process.env["QA_PROD"] === "1";
const pages = builtPages();
const indexable = pages.filter((p) => p.indexable);
const journalSlugs = new Set(
  ["en", "it"].flatMap((l) =>
    readdirSync(new URL(`../../../src/content/journal/${l}/`, import.meta.url))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `${l === "it" ? "/it" : ""}/${f.replace(/\.md$/, "")}`),
  ),
);

const attr = (html: string, re: RegExp) => re.exec(html)?.[1];
const meta = (html: string, key: string, name = "name") =>
  attr(html, new RegExp(`<meta ${name}="${key}" content="([^"]*)"`));
const decode = (s: string | undefined) =>
  (s ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

interface Ld {
  "@context"?: unknown;
  "@type"?: string;
  [key: string]: unknown;
}
const jsonLd = (html: string): Ld[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1] ?? "") as Ld);

test("every page: unique title with the name, description, canonical, Open Graph and Twitter tags", async ({ request }) => {
  const titles = new Map<string, string>();
  const sameInBoth: string[] = [];
  const problems: string[] = [];
  for (const p of indexable) {
    const html = readBuilt(p.file);
    const title = decode(attr(html, /<title>([^<]*)<\/title>/));
    if (!title.includes("Filippo Guanti")) problems.push(`${p.path}: title "${title}" lacks "Filippo Guanti"`);
    const earlier = titles.get(title);
    if (earlier !== undefined) {
      // The same word in two languages ("Now", "Privacy") is a finding to report, not a failure of the build.
      if (earlier.startsWith("/it") === p.path.startsWith("/it")) problems.push(`${p.path}: title "${title}" repeats ${earlier}`);
      else sameInBoth.push(`${p.path} = ${earlier}: "${title}"`);
    }
    titles.set(title, p.path);
    if (!(meta(html, "description") ?? "").trim()) problems.push(`${p.path}: no meta description`);
    const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
    if (canonical !== `${ORIGIN}${p.path === "/" ? "/" : p.path}`) problems.push(`${p.path}: canonical is ${canonical}`);
    for (const key of ["og:title", "og:description", "og:type", "og:url", "og:image", "og:site_name", "og:locale"])
      if (!(meta(html, key, "property") ?? "").trim()) problems.push(`${p.path}: no ${key}`);
    if (meta(html, "og:url", "property") !== canonical) problems.push(`${p.path}: og:url differs from the canonical`);
    if (meta(html, "twitter:card") !== "summary_large_image") problems.push(`${p.path}: no twitter:card`);
    if (meta(html, "og:image:width", "property") !== "1200" || meta(html, "og:image:height", "property") !== "630")
      problems.push(`${p.path}: og:image is not declared 1200×630`);
    if (!(meta(html, "og:image:alt", "property") ?? "").trim()) problems.push(`${p.path}: no og:image:alt`);
    if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) problems.push(`${p.path}: no favicon link`);
  }
  // The share images the pages name exist and are PNGs (the entries' own: suite 13 checks them per entry too).
  const images = new Set(indexable.map((p) => meta(readBuilt(p.file), "og:image", "property")).filter(Boolean));
  for (const url of images) {
    const res = await request.get(new URL(url ?? "").pathname);
    if (res.status() !== 200 || res.headers()["content-type"] !== "image/png") problems.push(`${url}: ${res.status()}`);
  }
  test.info().annotations.push(...sameInBoth.map((d) => ({ type: "same title in both languages", description: d })));
  expect(problems).toEqual([]);
});

test("JSON-LD: valid JSON, schema.org context, the right type on the right page", () => {
  const problems: string[] = [];
  for (const p of indexable) {
    const html = readBuilt(p.file);
    let blocks: Ld[] = [];
    try {
      blocks = jsonLd(html);
    } catch (error) {
      problems.push(`${p.path}: JSON-LD does not parse (${String(error)})`);
      continue;
    }
    const types = blocks.map((b) => b["@type"]);
    for (const b of blocks) if (b["@context"] !== "https://schema.org") problems.push(`${p.path}: @context is ${String(b["@context"])}`);
    const isHome = p.path === "/" || p.path === "/it";
    const isAbout = p.path === "/about" || p.path === "/it/about";
    const isPhoto = /\/photos\/[^/]+\/[^/]+$/.test(p.path);

    if (isHome || isAbout) {
      const person = blocks.find((b) => b["@type"] === "Person");
      if (!person) {
        problems.push(`${p.path}: no Person`);
        continue;
      }
      if (person["name"] !== "Filippo Guanti") problems.push(`${p.path}: Person.name is ${String(person["name"])}`);
      if (person["url"] !== ORIGIN) problems.push(`${p.path}: Person.url is ${String(person["url"])}`);
      // The profiles themselves are owner question O1; launch.spec.ts requires the list to be filled.
      if (person["sameAs"] !== undefined && !Array.isArray(person["sameAs"])) problems.push(`${p.path}: Person.sameAs is not a list`);
      else for (const u of (person["sameAs"] ?? []) as string[]) if (!/^https:\/\//.test(u)) problems.push(`${p.path}: sameAs ${u}`);
    } else if (journalSlugs.has(p.path)) {
      const post = blocks.find((b) => b["@type"] === "BlogPosting");
      if (!post) {
        problems.push(`${p.path}: no BlogPosting`);
        continue;
      }
      for (const key of ["headline", "description", "url", "datePublished", "inLanguage", "author", "image"])
        if (!post[key]) problems.push(`${p.path}: BlogPosting.${key} missing`);
      if (post["inLanguage"] !== p.lang) problems.push(`${p.path}: inLanguage ${String(post["inLanguage"])}`);
      if (post["url"] !== `${ORIGIN}${p.path}`) problems.push(`${p.path}: BlogPosting.url ${String(post["url"])}`);
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(post["datePublished"]))) problems.push(`${p.path}: datePublished`);
      const author = post["author"] as Ld | undefined;
      if (author?.["name"] !== "Filippo Guanti") problems.push(`${p.path}: author is not Filippo Guanti`);
    } else if (isPhoto) {
      if (!types.includes("ImageObject")) problems.push(`${p.path}: no ImageObject`);
    }
    // No page claims a type it is not: Person only on home and About.
    if (types.includes("Person") && !isHome && !isAbout) problems.push(`${p.path}: stray Person`);
    if (types.includes("BlogPosting") && !journalSlugs.has(p.path)) problems.push(`${p.path}: stray BlogPosting`);
  }
  expect(problems).toEqual([]);
});

test("sitemap.xml lists every indexable page once, with the page's own hreflang pairs, and nothing else", async ({
  request,
}) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");
  const xml = await res.text();
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1] ?? "");
  const byLoc = new Map<string, string>();
  const problems: string[] = [];
  for (const b of blocks) {
    const loc = attr(b, /<loc>([^<]*)<\/loc>/) ?? "";
    if (byLoc.has(loc)) problems.push(`${loc}: listed twice`);
    byLoc.set(loc, b);
  }
  const expected = new Set(indexable.map((p) => `${ORIGIN}${p.path === "/" ? "/" : p.path}`));
  for (const loc of expected) if (!byLoc.has(loc)) problems.push(`${loc}: built but not in the sitemap`);
  for (const loc of byLoc.keys()) if (!expected.has(loc)) problems.push(`${loc}: in the sitemap but not a built page`);
  expect(/<loc>https:\/\/philglov\.es\/(styleguide|404)/.test(xml), "no styleguide or 404 in the sitemap").toBe(false);
  for (const loc of byLoc.keys()) if (loc !== `${ORIGIN}/` && loc.endsWith("/")) problems.push(`${loc}: trailing slash`);

  for (const p of indexable) {
    const html = readBuilt(p.file);
    const pairs = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    const block = byLoc.get(`${ORIGIN}${p.path === "/" ? "/" : p.path}`) ?? "";
    const inMap = [...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    if (pairs.join("|") !== inMap.join("|")) problems.push(`${p.path}: page hreflang ${JSON.stringify(pairs)} ≠ sitemap ${JSON.stringify(inMap)}`);
  }
  expect(problems).toEqual([]);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
});

test("feeds list each journal entry once, in the feed of the language it exists in", async ({ request }) => {
  for (const lang of ["en", "it"] as const) {
    const xml = await (await request.get(lang === "en" ? "/feed.xml" : "/it/feed.xml")).text();
    const links = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]*)<\/link>/g)].map((m) => m[1]);
    const expected = [...journalSlugs]
      .filter((s) => (lang === "it" ? s.startsWith("/it/") : !s.startsWith("/it/")))
      .map((s) => `${ORIGIN}${s}`);
    expect([...links].sort(), `${lang} feed`).toEqual([...expected].sort());
    expect(xml).toContain(`<language>${lang}</language>`);
  }
});

for (const p of pages) {
  test(`indexing: ${p.path} says ${PROD && p.indexable ? "index" : "noindex"}`, async ({ request }) => {
    const res = await request.get(p.path);
    const header = res.headers()["x-robots-tag"] ?? "";
    const html = await res.text();
    const robotsMeta = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? "";
    const noindex = /noindex/i.test(header) || /noindex/i.test(robotsMeta);
    if (PROD && p.indexable) expect(noindex, `${p.path} is indexable by accident (${header} / ${robotsMeta})`).toBe(false);
    else if (!PROD) expect(noindex, `${p.path}: staging must say noindex`).toBe(true);
    else if (p.file === "styleguide.html") expect(noindex, "/styleguide is never indexed").toBe(true);
  });
}
