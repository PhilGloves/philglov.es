import { expect, test, type Locator } from "@playwright/test";

/**
 * Decision 0039: a visible date reads day/month/year with slashes on Italian pages and keeps its format on English
 * ones; the machine-readable value (the datetime attribute) is always YYYY-MM-DD. The helper itself is tested in
 * tests/unit/dates.test.ts, comments in tests/worker/comments.test.ts.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toItalian = (iso: string) => iso.split("-").reverse().join("/");

/** Every <time> in `scope`: its text is the datetime written for the page language. */
async function expectTimes(scope: Locator, locale: "en" | "it", howMany = 1) {
  const times = scope.locator("time");
  expect(await times.count()).toBeGreaterThanOrEqual(howMany);
  for (const time of await times.all()) {
    const iso = (await time.getAttribute("datetime")) ?? "";
    expect(iso).toMatch(ISO);
    await expect(time).toHaveText(locale === "it" ? toItalian(iso) : iso);
  }
}

for (const [locale, prefix] of [
  ["en", ""],
  ["it", "/it"],
] as const) {
  test(`journal index and home list (${locale}): dates in the page's format, datetime stays ISO`, async ({ page }) => {
    await page.goto(`${prefix}/journal`);
    await expectTimes(page.locator("main table"), locale);
    await page.goto(prefix || "/");
    await expectTimes(page.locator("main"), locale);
  });

  test(`a photo (${locale}): its date in the page's format, datetime stays ISO`, async ({ page }) => {
    await page.goto(`${prefix}/photos/lisbon/tram-28`);
    await expectTimes(page.locator("main"), locale);
  });
}

test("the Now page says when it was updated: 20/11/2026 style in Italian, 2026-11-20 style in English", async ({
  page,
}) => {
  await page.goto("/it/now");
  await expect(page.locator("main")).toContainText(/Aggiornato il \d{2}\/\d{2}\/\d{4}/);
  await expect(page.locator("main")).not.toContainText(/\d{4}-\d{2}-\d{2}/);
  await page.goto("/now");
  await expect(page.locator("main")).toContainText(/Updated \d{4}-\d{2}-\d{2}/);
});

test("an entry's details block stays written out in both languages, the datetime attribute ISO in both", async ({
  page,
}) => {
  await page.goto("/it/lisbona");
  const italian = page.locator("footer.about .facts time");
  await expect(italian).toHaveAttribute("datetime", "2026-10-21");
  await expect(italian).toHaveText("21 ottobre 2026");
  await page.goto("/lisbona");
  const english = page.locator("footer.about .facts time");
  await expect(english).toHaveAttribute("datetime", "2026-10-21");
  await expect(english).toHaveText("21 October 2026");
});

test("sitemap, feed and structured data keep their machine-readable dates", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  expect(sitemap).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  const feed = await (await request.get("/feed.xml")).text();
  expect(feed).toMatch(/<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/);
  await page.goto("/it/lisbona");
  const jsonLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
  expect(jsonLd).toMatch(/"datePublished":"\d{4}-\d{2}-\d{2}/);
  expect(jsonLd).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
});
