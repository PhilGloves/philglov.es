import { expect, test } from "@playwright/test";

/**
 * Decision 0024: no breadcrumb anywhere, no heading that repeats the page title, a tighter head on the journal and
 * photos pages, and header controls without a ring.
 */

/** Every public URL: the sitemap lists them all (both languages), plus two that do not exist. */
async function allPaths(request: import("@playwright/test").APIRequestContext): Promise<string[]> {
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>https:\/\/philglov\.es([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  return [...new Set([...paths, "/no-such-page", "/it/no-such-page"])];
}

test("no breadcrumb on any public page, in either language", async ({ request }) => {
  const paths = await allPaths(request);
  expect(paths.length).toBeGreaterThan(20);
  const withCrumb: string[] = [];
  for (const path of paths) {
    const html = await (await request.get(path)).text();
    if (/class="[^"]*\bcrumb\b/.test(html)) withCrumb.push(path);
  }
  expect(withCrumb).toEqual([]);
});

test("a .lab block that held only the breadcrumb is not rendered at all", async ({ page }) => {
  const paths = [
    "/journal",
    "/it/journal",
    "/photos",
    "/it/photos",
    "/photos/lisbon",
    "/now",
    "/it/now",
    "/rights",
    "/privacy",
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator(".hero > .lab, .top > .lab"), path).toHaveCount(0);
  }
  // Where the block has other content, that content stays.
  await page.goto("/about");
  await expect(page.locator(".top > .lab .portrait")).toHaveCount(1);
  await expect(page.locator(".top > .lab > p")).toHaveCount(0);
});

test("no heading repeats the page title; the heading order stays valid", async ({ page }) => {
  await page.goto("/photos");
  await expect(page.locator("h1")).toHaveText("Photos");
  await expect(page.locator("h2", { hasText: /^Photos$/ })).toHaveCount(0);
  await expect(page.locator(".sec .lab p")).toContainText("series"); // the count stays
  // The series names are h2 (they were h3), and no level is skipped.
  const levels = await page
    .locator("main :is(h1, h2, h3, h4)")
    .evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  expect(levels[0]).toBe(1);
  levels.forEach((level, i) => expect(level - (levels[i - 1] ?? 0), `heading ${i}`).toBeLessThanOrEqual(1));
  await expect(page.locator(".series h2")).not.toHaveCount(0);
  await expect(page.locator(".series h3")).toHaveCount(0);

  await page.goto("/journal");
  await expect(page.locator("h1")).toHaveText("Journal");
  await expect(page.locator("h2", { hasText: /^Journal$/ })).toHaveCount(0);
  await expect(page.locator(".sec .lab p")).toContainText("EN - written in English"); // the legend of the language marks stays

  // A series page keeps its "Photos" heading: the title there is the series name.
  await page.goto("/photos/lisbon");
  await expect(page.locator("h2", { hasText: /^Photos$/ })).toHaveCount(1);
  await expect(page.locator("h1")).not.toHaveText("Photos");

  await page.goto("/it/photos");
  await expect(page.locator("h2", { hasText: /^Foto$/ })).toHaveCount(0);
});

// Distance in the browser, in px, at the owner's three widths (decision 0024); 1 px is allowed. The space above
// the title is no longer a fixed number: decision 0025 replaced it with the mirror rule (tests/e2e/page-head.spec.ts).
const targets = [
  { width: 390, intro: 52 },
  { width: 768, intro: 68 },
  { width: 1440, intro: 80 },
] as const;

for (const path of ["/journal", "/photos"]) {
  test(`${path}: intro to the section below, at 390, 768 and 1440 px`, async ({ page }) => {
    for (const { width, intro } of targets) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const m = await page.evaluate(() => {
        const rect = (selector: string) => (document.querySelector(selector) as Element).getBoundingClientRect();
        const section = document.querySelector(".hero + .sec") as Element;
        const tops = [...section.children].map((c) => c.getBoundingClientRect().top);
        return { lede: rect(".hero .lede").bottom, content: Math.min(...tops) };
      });
      const introGap = m.content - m.lede;
      expect(Math.abs(introGap - intro), `${path} at ${width}px: intro to content is ${introGap}`).toBeLessThanOrEqual(
        1,
      );
    }
  });
}

test("only the journal index, the photos index and the series pages use the tighter head", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero--inner")).toHaveCount(0);
  await page.goto("/photos/lisbon");
  await expect(page.locator(".hero.hero--inner")).toHaveCount(1);
  await page.goto("/about");
  await expect(page.locator(".hero--inner")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`header controls have no ring at rest (${scheme}): transparent border, no background, 44 px on phones`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const controls = page.locator("header .rbtn");
    expect(await controls.count()).toBeGreaterThanOrEqual(1);
    for (const control of await controls.all()) {
      const style = await control.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.borderTopColor, width: s.borderTopWidth, style: s.borderTopStyle, bg: s.backgroundColor };
      });
      // The border is kept (1px solid), only invisible, so forced-colours mode still draws an outline.
      expect(style).toEqual({ color: "rgba(0, 0, 0, 0)", width: "1px", style: "solid", bg: "rgba(0, 0, 0, 0)" });
      if (await control.isVisible()) {
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
}

test("the two controls touch, and the moon or sun ends where the header line ends, at four widths", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "the theme toggle is hidden without JavaScript");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const m = await page.evaluate(() => {
      const box = (selector: string) => (document.querySelector(selector) as Element).getBoundingClientRect();
      const icon = [...document.querySelectorAll(".theme-toggle svg")].find(
        (s) => getComputedStyle(s).display !== "none",
      ) as Element;
      return {
        headRight: box("header.head").right,
        iconRight: icon.getBoundingClientRect().right,
        langRight: box("a.lang-switch").right,
        toggleLeft: box(".theme-toggle").left,
        size: box(".theme-toggle").width,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(
      Math.abs(m.iconRight - m.headRight),
      `${width}px: icon ends ${m.headRight - m.iconRight} px off`,
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(m.toggleLeft - m.langRight), `${width}px: gap between the controls`).toBeLessThanOrEqual(0.5);
    expect(m.size).toBe(width <= 640 ? 44 : 40);
    expect(m.overflow).toBeLessThanOrEqual(0);
  }
});

test("hover turns a control to the accent colour; keyboard focus keeps its ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const lang = page.locator("a.lang-switch");
  const resting = await lang.evaluate((el) => getComputedStyle(el).color);
  await lang.hover();
  await expect.poll(() => lang.evaluate((el) => getComputedStyle(el).color)).not.toBe(resting);
  await page.mouse.move(0, 0);
  // Tab until the language link has focus (skip link, name, four links, then the controls).
  for (let i = 0; i < 12 && !(await lang.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press("Tab");
  await expect(lang).toBeFocused();
  const outline = await lang.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline).toEqual({ style: "solid", width: "2px" });
});
