/**
 * The smoke test of the site's own build (decision 0033), project `smoke` in playwright.site.config.ts,
 * `pnpm test:site` after `pnpm build`. The suites in tests/e2e run on the fixtures; this runs on what is deployed: the
 * owner's content, whatever it is (no entry at all, or a hundred). So it names no entry, series or photo. It takes the
 * pages from dist/ and checks what must hold for every one of them, and for the empty site:
 *  - every page answers its status, has one h1 and its language, logs nothing, makes no failed or third-party request,
 *    and has no axe violation (WCAG 2.2 AA, and AAA for the text in <main>) in either theme, at 1440 and 390 px;
 *  - every link, image, stylesheet and script a page points at on this site answers;
 *  - the sitemap lists exactly the pages that should be indexed, and each answers; the feeds list entries that answer;
 *  - with no entry, Home and Journal say "Nothing here yet."; with no series, Photos does; in both languages.
 * html-validate, the photo-rights check (tests/unit/qa-images.test.ts) and the build's own content and page checks run
 * on the same build.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { builtPages, readBuilt, settle, THEMES, transitionsDone, watch } from "../e2e/qa/lib.ts";

const ORIGIN = "https://philglov.es";
const ui = (l: "en" | "it") =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;
// The styleguide is the design reference, built from fixed markup and covered by the suites on the fixtures.
const pages = builtPages().filter((p) => p.file !== "styleguide.html");
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

interface Violation {
  id: string;
  help: string;
  nodes: { target: unknown[] }[];
}

async function axe(page: Page, options: object, context?: object): Promise<string[]> {
  // Evaluated over the DevTools protocol, so the page's CSP (no inline script) does not apply to it.
  await page.evaluate(`${axeSource}\n;0`);
  const violations = await page.evaluate(
    async ({ options, context }) => {
      const run = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: Violation[] }> } })
        .axe;
      return (await run.run(context ?? document, options)).violations;
    },
    { options, context },
  );
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => JSON.stringify(n.target)).join(", ")})`);
}

/** Paths on this site that a page's markup points at: links, images (src and srcset), stylesheets, scripts, icons. */
function pointsAt(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:href|src)="(\/[^"#]*)/g)) out.push(m[1] ?? "");
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g))
    for (const part of (m[1] ?? "").split(",")) {
      const url = part.trim().split(/\s+/)[0] ?? "";
      if (url.startsWith("/")) out.push(url);
    }
  for (const m of html.matchAll(/\s(?:href|src)="https:\/\/philglov\.es(\/[^"#]*)/g)) out.push(m[1] ?? "");
  return out.map((p) => p.replace(/\?.*$/, "") || "/").filter((p) => !p.startsWith("/api/") && !p.startsWith("/admin"));
}

test.describe.configure({ mode: "parallel" });

for (const built of pages) {
  test(`${built.path}: answers ${built.status}, one h1, its language, no console noise or failed request, no axe violation`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const seen = watch(page, baseURL ?? "", built.status === 404 ? built.path : undefined);
    const found: string[] = [];
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const res = await page.goto(built.path);
        expect(res?.status()).toBe(built.status);
        found.push(...(await settle(page, seen)));
        await transitionsDone(page);
        const rules = await axe(page, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
          // The language switch's name (BUG-1) has its own test in the suites.
          rules: { "label-content-name-mismatch": { enabled: false } },
          resultTypes: ["violations"],
        });
        const aaa = await axe(
          page,
          { runOnly: { type: "rule", values: ["color-contrast-enhanced"] }, resultTypes: ["violations"] },
          { include: [["main"]], exclude: [[".fine"]] },
        );
        found.push(...[...rules, ...aaa].map((v) => `${theme} ${width}px: ${v}`));
      }
    }
    expect(await page.locator("h1").count(), "one h1").toBe(1);
    expect(await page.locator("html").getAttribute("lang")).toBe(built.lang);
    expect([...found, ...seen.problems]).toEqual([]);
  });
}

test("every link, image, stylesheet and script the pages point at on this site answers", async ({ request }) => {
  const targets = new Set(pages.flatMap((p) => pointsAt(readBuilt(p.file))));
  const broken: string[] = [];
  for (const path of targets) {
    const status = (await request.get(path, { maxRedirects: 0 })).status();
    if (status >= 300) broken.push(`${path}: ${status}`);
  }
  expect(targets.size).toBeGreaterThan(10);
  expect(broken).toEqual([]);
});

test("the sitemap lists exactly the pages to index, and each answers 200", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => (m[1] ?? "").replace(ORIGIN, "") || "/");
  const indexable = pages.filter((p) => p.indexable).map((p) => p.path);
  expect([...new Set(listed)].sort()).toEqual(indexable.sort());
  for (const path of listed) expect((await request.get(path)).status(), path).toBe(200);
});

for (const feed of ["/feed.xml", "/it/feed.xml"]) {
  test(`${feed} is RSS, and every entry it lists answers`, async ({ request }) => {
    const res = await request.get(feed);
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml [^>]*\?>\s*<rss version="2\.0"[\s\S]*<channel>[\s\S]*<\/channel>\s*<\/rss>\s*$/);
    for (const m of xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)) {
      const path = (m[1] ?? "").replace(ORIGIN, "");
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });
}

test("robots.txt, security.txt and tdmrep.json are served", async ({ request }) => {
  for (const path of ["/robots.txt", "/.well-known/security.txt", "/.well-known/tdmrep.json"])
    expect((await request.get(path)).status(), path).toBe(200);
});

// The site before the owner's first entry or series, and the suites' fixtures never are (0033): the empty states.
test("with no entry, Home and Journal say so; with no series, Photos does; in both languages", async ({ page }) => {
  const entries =
    (readBuilt("feed.xml").match(/<item>/g) ?? []).length + (readBuilt("it/feed.xml").match(/<item>/g) ?? []).length;
  const series = pages.some((p) => /^\/(it\/)?photos\/[^/]+$/.test(p.path));
  test.skip(entries > 0 && series, "the site has entries and photo series: no empty state to show");
  for (const lang of ["en", "it"] as const) {
    const nothing = ui(lang)["noEntries"] ?? "";
    const at = (path: string) => (lang === "it" ? (path === "/" ? "/it" : `/it${path}`) : path);
    const shows = async (path: string) => {
      await page.goto(at(path));
      return page.locator("main").getByText(nothing, { exact: true }).count();
    };
    if (entries === 0) {
      expect(await shows("/"), `${at("/")}: "${nothing}"`).toBe(1);
      expect(await shows("/journal"), `${at("/journal")}: "${nothing}"`).toBe(1);
    }
    if (!series) expect(await shows("/photos"), `${at("/photos")}: "${nothing}"`).toBe(1);
  }
});
