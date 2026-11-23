import { expect, test } from "@playwright/test";

test("an entry with a twin: switch goes to the twin, hreflang pair, own-translation label", async ({ page }) => {
  await page.goto("/lisbona");
  await expect(page.locator('header a.lang-switch[href="/it/lisbona"]')).toHaveAttribute("hreflang", "it");
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(3);
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute("href", "https://philglov.es/lisbona");
  await expect(page.locator("p.label")).toContainText("Originally written in Italian");
  await expect(page.locator("p.label a")).toHaveAttribute("href", "/it/lisbona");
  await expect(page.locator("p.label .marker")).toHaveText("ITEN"); // the arrow between is an SVG
  await expect(page.locator("p.label .marker svg.arr")).toHaveCount(1);
  // The details block closes the text: number, date in words, reading time, then the label with its link.
  const about = page.locator("footer.about");
  await expect(about.locator(".facts")).toContainText(/^No\. \d{3} \d{1,2} [A-Z][a-z]+ 20\d\d \d+ min read$/);
  await expect(about.locator("p.label")).toHaveCount(1);
});

test("the Italian original: label, link to the English twin, own number", async ({ page }) => {
  await page.goto("/it/lisbona");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.locator("p.label")).toContainText("Scritto in italiano");
  await expect(page.locator("p.label a")).toHaveAttribute("href", "/lisbona");
  await expect(page.locator("p.label a")).toHaveAttribute("lang", "en");
  await expect(page.locator("header a.lang-switch")).toHaveAttribute("href", "/lisbona");
  await expect(page.locator("footer.about .facts")).toContainText("N. 002");
  await expect(page.locator("footer.about .facts")).toContainText("21/10/2026");
});

test("an English-only entry: no hreflang, switch goes to the Italian home and says so, label says not yet", async ({
  page,
}) => {
  await page.goto("/one-roll");
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  const switchLink = page.locator("header a.lang-switch");
  await expect(switchLink).toHaveAttribute("href", "/it");
  // The visible text is the code; the accessible name is the language and says what the link does here.
  await expect(switchLink).toHaveText("IT");
  await expect(switchLink).toHaveAttribute("aria-label", /^IT, Italiano - This page is not available in Italian/);
  await expect(page.locator("p.label")).toContainText("Not yet available in Italian");
});

test("the Italian journal lists the English-only entry as solo EN, linking to it with lang=en", async ({ page }) => {
  await page.goto("/it/journal");
  const row = page.locator("tr", { hasText: "An entry that exists in English only" });
  await expect(row.locator("td.ln")).toContainText("solo EN");
  await expect(row.locator("a")).toHaveAttribute("href", "/one-roll");
  await expect(row.locator("a")).toHaveAttribute("lang", "en");
});

test("no topics: no topic column, filter or pages", async ({ page }) => {
  for (const path of ["/journal", "/it/journal"]) {
    await page.goto(path);
    await expect(page.locator("th", { hasText: /^(Topic|Argomento)$/ })).toHaveCount(0);
    await expect(page.locator("ul.tags, .idx .tp")).toHaveCount(0);
    await expect(page.locator('a[href*="/journal/travel"], a[href*="/journal/photography"]')).toHaveCount(0);
  }
  for (const path of ["/journal/travel", "/journal/photography", "/it/journal/projects", "/it/journal/thoughts"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("About and Now carry no 'written in' label, in both languages; the legal pages and entries do", async ({
  page,
}) => {
  for (const path of ["/about", "/now", "/it/about", "/it/now"]) {
    await page.goto(path);
    await expect(page.locator("p.label, .marker"), path).toHaveCount(0);
    await expect(page.locator("h1"), path).toHaveCount(1);
  }
  for (const path of ["/rights", "/privacy", "/it/rights", "/lisbona"]) {
    await page.goto(path);
    await expect(page.locator("p.label"), path).toHaveCount(1);
  }
});

test("feeds: an entry appears only in the feed of each language it exists in", async ({ request }) => {
  const en = await (await request.get("/feed.xml")).text();
  const it = await (await request.get("/it/feed.xml")).text();
  expect(en).toContain("https://philglov.es/lisbona");
  expect(en).toContain("https://philglov.es/one-roll");
  expect(it).toContain("https://philglov.es/it/lisbona");
  expect(it).not.toContain("one-roll");
  expect(en).not.toContain("<category>");
  expect(en).toContain("<language>en</language>");
  expect(it).toContain("<language>it</language>");
});

test("sitemap: hreflang pairs only where both versions exist", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const urlBlock = (loc: string) => new RegExp(`<url>\\s*<loc>${loc}</loc>[\\s\\S]*?</url>`).exec(xml)?.[0] ?? "";
  expect(urlBlock("https://philglov.es/lisbona")).toContain('hreflang="it" href="https://philglov.es/it/lisbona"');
  expect(urlBlock("https://philglov.es/one-roll")).not.toContain("xhtml:link");
  expect(xml).not.toContain("/it/one-roll");
});

test("the entry page has the comment form with every field, the consent line and the Worker's slots", async ({
  page,
}) => {
  await page.goto("/lisbona");
  const form = page.locator('form[action^="/api/comment"]');
  await expect(form).toHaveAttribute("method", /post/i);
  for (const name of ["name", "email", "comment"])
    await expect(form.locator(`[name="${name}"][required]`)).toHaveCount(1);
  await expect(form.locator('input[name="website"]')).toHaveCount(1);
  // The Worker writes a fresh signed token as it serves the page (B3b).
  await expect(form.locator('input[name="token"][type="hidden"]')).toHaveValue(/^v1\./);
  await expect(form.locator('input[name="slug"]')).toHaveValue("lisbona");
  await expect(form.locator('input[name="lang"]')).toHaveValue("en");
  await expect(form.locator(".consent a")).toHaveAttribute("href", "/privacy");
  await expect(page.locator("section#comments")).toHaveAttribute("data-slug", "lisbona");
  for (const slot of ["comments", "comment-status", "error-name", "error-email", "error-comment"])
    await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Your thoughts? Please leave a reply:" })).toBeVisible();
});

test("an entry with comments off has neither the comments section nor the form", async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator("section#comments")).toHaveCount(0);
  await expect(page.locator('form[action^="/api/comment"]')).toHaveCount(0);
});

test("theme toggle: flips, remembers, and is hidden without JavaScript", async ({ page, javaScriptEnabled }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.locator("[data-theme-toggle]");
  if (!javaScriptEnabled) {
    await expect(toggle).toBeHidden();
    return;
  }
  await expect(toggle).toHaveAccessibleName("Switch to dark theme");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAccessibleName("Switch to light theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAccessibleName("Switch to light theme");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("with localStorage blocked the page still renders and follows the system theme", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "needs JavaScript");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("[data-theme-toggle]")).toHaveAccessibleName("Switch to light theme");
  expect(errors).toEqual([]);
});

// SO-06 (fixed in fix round 2): in the previous/next links of an entry only the entry's title carries the other
// language's lang attribute; the "Previous" / "Next" label is the page's own language. /it/lisbona links to /one-roll,
// which exists in English only.
test("previous/next links: only the title of an entry in the other language is marked with its language", async ({
  page,
}) => {
  let marked = 0;
  for (const path of ["/lisbona", "/it/lisbona", "/foto", "/it/provafoto"]) {
    await page.goto(path);
    const pageLang = await page.locator("html").getAttribute("lang");
    const links = page.locator(".pn-grid a");
    const count = await links.count();
    expect(count, path).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const href = (await link.getAttribute("href")) ?? "";
      const langs = await link.evaluate((a) => ({
        link: a.getAttribute("lang"),
        label: a.querySelector(".k")?.closest("[lang]")?.getAttribute("lang") ?? null,
        title: a.querySelector(".v")?.closest("[lang]")?.getAttribute("lang") ?? null,
      }));
      expect(langs.link, path + " → " + href + ": the link itself has no lang").toBeNull();
      expect(langs.label, path + " → " + href + ": the label keeps the page language").toBe(pageLang);
      const entryLang = href === "/it" || href.startsWith("/it/") ? "it" : "en";
      if (href.endsWith("/journal")) continue; // "back to the journal" is in the page's language
      expect(langs.title, path + " → " + href + ": the title is in the language of its entry").toBe(entryLang);
      if (entryLang !== pageLang) marked++;
    }
  }
  expect(marked, "at least one link to an entry in the other language was checked").toBeGreaterThan(0);
});
