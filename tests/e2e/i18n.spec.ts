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
  await expect(page.locator("dl.entry-meta")).toContainText("My translation");
});

test("the Italian original: label, link to the English twin, own number", async ({ page }) => {
  await page.goto("/it/lisbona");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.locator("p.label")).toContainText("Scritto in italiano");
  await expect(page.locator("p.label a")).toHaveAttribute("href", "/lisbona");
  await expect(page.locator("p.label a")).toHaveAttribute("lang", "en");
  await expect(page.locator("header a.lang-switch")).toHaveAttribute("href", "/lisbona");
  await expect(page.locator("dl.entry-meta")).toContainText("002");
});

test("an English-only entry: no hreflang, switch goes to the Italian home and says so, label says not yet", async ({
  page,
}) => {
  await page.goto("/one-roll");
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  const switchLink = page.locator("header a.lang-switch");
  await expect(switchLink).toHaveAttribute("href", "/it");
  await expect(switchLink).toContainText("not available in Italian");
  await expect(page.locator("p.label")).toContainText("Not yet available in Italian");
});

test("the Italian journal lists the English-only entry as solo EN, linking to it with lang=en", async ({ page }) => {
  await page.goto("/it/journal");
  const row = page.locator("tr", { hasText: "An entry that exists in English only" });
  await expect(row.locator("td.ln")).toContainText("solo EN");
  await expect(row.locator("a")).toHaveAttribute("href", "/one-roll");
  await expect(row.locator("a")).toHaveAttribute("lang", "en");
  await page.goto("/it/journal/photography");
  await expect(page.locator("tr", { hasText: "An entry that exists in English only" })).toHaveCount(1);
  await page.goto("/it/journal/projects");
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("feeds: an entry appears only in the feed of each language it exists in", async ({ request }) => {
  const en = await (await request.get("/feed.xml")).text();
  const it = await (await request.get("/it/feed.xml")).text();
  expect(en).toContain("https://philglov.es/lisbona");
  expect(en).toContain("https://philglov.es/one-roll");
  expect(it).toContain("https://philglov.es/it/lisbona");
  expect(it).not.toContain("one-roll");
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
  const form = page.locator('form[action="/api/comment"]');
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
  await expect(page.locator('form[action="/api/comment"]')).toHaveCount(0);
});

test("theme toggle: flips, remembers, and is hidden without JavaScript", async ({ page, javaScriptEnabled }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.locator("[data-theme-toggle]");
  if (!javaScriptEnabled) {
    await expect(toggle).toBeHidden();
    return;
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
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
  await expect(page.locator("[data-theme-toggle]")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
