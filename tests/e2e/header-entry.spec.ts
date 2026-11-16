import { expect, test } from "@playwright/test";

/**
 * The simplification pass (decision 0023): the round header controls, and an entry that opens with its text.
 * The topic and label checks sit in i18n.spec.ts, the signature of replies in tests/worker/comments.test.ts.
 */

test("the language switch shows IT or EN; its accessible name starts with that and names the language in full", async ({
  page,
}) => {
  await page.goto("/lisbona");
  const toIt = page.locator("header a.lang-switch");
  await expect(toIt).toHaveText("IT");
  await expect(toIt).toHaveAttribute("aria-label", "IT, Italiano"); // BUG-1: the name holds the visible text
  await expect(toIt).toHaveAttribute("lang", "it");
  await expect(toIt).toHaveAttribute("hreflang", "it");
  await expect(toIt).toHaveAttribute("href", "/it/lisbona");

  await page.goto("/it/lisbona");
  const toEn = page.locator("header a.lang-switch");
  await expect(toEn).toHaveText("EN");
  await expect(toEn).toHaveAttribute("aria-label", "EN, English");
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

test("theme toggle: an icon, a name that says what it does, a moon in light mode and a sun in dark mode", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "the toggle is hidden without JavaScript");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Switch to dark theme", exact: true })).toHaveCount(1);
  const toggle = page.locator("[data-theme-toggle]"); // the same button, whatever it is called now
  await expect(toggle).not.toHaveAttribute("aria-pressed", /.*/); // SO-05: the name carries the state, not aria-pressed
  await expect(toggle.locator(".sr-only:visible")).toHaveCount(1); // one hidden label at a time, no visible word
  await expect(toggle.locator("svg")).toHaveCount(2); // both are in the markup; CSS shows one
  await expect(toggle.locator(".i-moon")).toBeVisible();
  await expect(toggle.locator(".i-sun")).toBeHidden();

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle.locator(".i-sun")).toBeVisible();
  await expect(toggle.locator(".i-moon")).toBeHidden();
  await expect(page.getByRole("button", { name: "Switch to light theme", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Switch to dark theme", exact: true })).toHaveCount(0);

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
  await expect(page.getByRole("button", { name: "Passa al tema chiaro", exact: true })).toHaveCount(1);
  const toggle = page.locator("[data-theme-toggle]");
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

// TO-02 (third review, fixed in fix round 2): on phones every main navigation link is at least 44 × 44 px to tap, in both
// languages, and the menu looks the same: the hit area grows by padding that a negative margin takes back, so the words
// keep their place and the 22 px between them.
for (const path of ["/", "/it", "/lisbona", "/it/journal"]) {
  for (const width of [320, 390]) {
    test(`TO-02: the main navigation links on ${path} are 44 × 44 px or more at ${width} px, and their words have not moved`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const links = page.locator("header nav a");
      expect(await links.count()).toBe(4);
      const boxes = await links.evaluateAll((all) =>
        all.map((a) => {
          const r = a.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(a);
          const t = range.getBoundingClientRect();
          return { width: r.width, height: r.height, textLeft: t.left, textRight: t.right, textTop: t.top };
        }),
      );
      for (const [i, box] of boxes.entries()) {
        expect(box.width, `link ${i} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `link ${i} height`).toBeGreaterThanOrEqual(44);
        const next = boxes[i + 1];
        if (next && Math.abs(next.textTop - box.textTop) < 2)
          expect(next.textLeft - box.textRight, `gap between the words ${i} and ${i + 1}`).toBeCloseTo(22, 0);
      }
    });
  }
}
