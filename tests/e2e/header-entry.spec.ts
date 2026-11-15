import { expect, test } from "@playwright/test";

/**
 * The simplification pass (decision 0023): the round header controls, and an entry that opens with its text.
 * The topic and label checks sit in i18n.spec.ts, the signature of replies in tests/worker/comments.test.ts.
 */

test("the language switch shows IT or EN; its accessible name is the full language name", async ({ page }) => {
  await page.goto("/lisbona");
  const toIt = page.locator("header a.lang-switch");
  await expect(toIt).toHaveText("IT");
  await expect(toIt).toHaveAttribute("aria-label", "Italiano");
  await expect(toIt).toHaveAttribute("lang", "it");
  await expect(toIt).toHaveAttribute("hreflang", "it");
  await expect(toIt).toHaveAttribute("href", "/it/lisbona");

  await page.goto("/it/lisbona");
  const toEn = page.locator("header a.lang-switch");
  await expect(toEn).toHaveText("EN");
  await expect(toEn).toHaveAttribute("aria-label", "English");
  await expect(toEn).toHaveAttribute("lang", "en");
  await expect(toEn).toHaveAttribute("hreflang", "en");
});

test("both header controls are round, and at least 44 px on phones", async ({ page }) => {
  for (const [width, least] of [
    [390, 44],
    [320, 44],
    [1440, 40],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const control of await page.locator("header .rbtn").all()) {
      if (!(await control.isVisible())) continue; // the theme toggle is hidden without JavaScript
      const box = await control.boundingBox();
      expect(box?.width, `${width}px`).toBeGreaterThanOrEqual(least);
      expect(box?.height, `${width}px`).toBeGreaterThanOrEqual(least);
      expect(await control.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("50%");
    }
  }
});

test("theme toggle: an icon, a fixed name, a moon in light mode and a sun in dark mode", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "the toggle is hidden without JavaScript");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Dark theme", exact: true });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveText(""); // no word, only the icons
  await expect(toggle.locator("svg")).toHaveCount(2); // both are in the markup; CSS shows one
  await expect(toggle.locator(".i-moon")).toBeVisible();
  await expect(toggle.locator(".i-sun")).toBeHidden();

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle.locator(".i-sun")).toBeVisible();
  await expect(toggle.locator(".i-moon")).toBeHidden();
  await expect(page.getByRole("button", { name: "Dark theme", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The visitor's choice wins over the system setting, in both directions.
  await page.emulateMedia({ colorScheme: "dark" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle.locator(".i-moon")).toBeVisible();
  await expect(toggle.locator(".i-sun")).toBeHidden();
});

test("with the system in dark mode and no choice yet, the toggle shows the sun", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "the toggle is hidden without JavaScript");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/it");
  const toggle = page.getByRole("button", { name: "Tema scuro", exact: true });
  await expect(toggle.locator(".i-sun")).toBeVisible();
  await expect(toggle.locator(".i-moon")).toBeHidden();
});

test("an entry opens with its text: no breadcrumb, label line, standfirst or side column of details", async ({
  page,
}) => {
  await page.goto("/lisbona");
  const article = page.locator("article.page");
  await expect(article.locator(".top").locator("> *")).toHaveCount(1); // the title's header, nothing else
  await expect(article.locator(".top h1")).toHaveCount(1);
  await expect(article.locator(".crumb, .stand, .entry-meta, dl, aside, .top .label, .top .lab")).toHaveCount(0);
  // The description is for search engines and share cards only: it is in the head, not in the page.
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toBeTruthy();
  expect(await page.locator("main").innerText()).not.toContain(description ?? "");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", description ?? "");
  // No topics in the structured data either.
  const jsonLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
  expect(jsonLd).not.toMatch(/keywords|articleSection/);
});

test("the details block closes the text: after the sign-off, before previous/next and the comments", async ({
  page,
}) => {
  await page.goto("/lisbona");
  const about = page.locator("footer.about");
  await expect(about).toHaveAttribute("aria-label", "About this entry");
  await expect(about.locator(".facts time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
  await expect(about.locator(".facts")).toContainText("min read");
  await expect(about.locator("p.label a")).toHaveAttribute("href", "/it/lisbona");
  const order = await page.evaluate(() => {
    const at = (selector: string) => document.querySelector(selector) as Element;
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      afterText: before(at(".prose"), at("footer.about")),
      beforePrevNext: before(at("footer.about"), at("nav.pn")),
      beforeComments: before(at("footer.about"), at("#comments")),
    };
  });
  expect(order).toEqual({ afterText: true, beforePrevNext: true, beforeComments: true });
});
