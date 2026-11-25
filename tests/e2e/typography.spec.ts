import { expect, test } from "@playwright/test";

// One typeface (Crimson Pro), two files, no arrow glyphs (the font has none).
test("only the Crimson Pro files are fetched, and no arrow character is drawn", async ({ page }) => {
  const fonts: string[] = [];
  page.on("response", (res) => {
    if (res.request().resourceType() === "font") fonts.push(new URL(res.url()).pathname);
  });
  await page.goto("/styleguide");
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.length).toBeGreaterThan(0);
  for (const path of fonts) expect(path).toMatch(/^\/_assets\/fonts\/crimson-pro(-italic)?\.woff2$/);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
  );
  expect(loaded).toContain("Crimson Pro");
  for (const family of loaded) expect(family).toMatch(/^Crimson Pro( Fallback( Georgia)?)?$/); // the web font and its local fallbacks
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toMatch(/[→←↑↓↩]/);
  expect(await page.locator("svg.arr").count()).toBeGreaterThan(10);
});

const UPRIGHT = "/_assets/fonts/crimson-pro.woff2";
const ITALIC = "/_assets/fonts/crimson-pro-italic.woff2";

async function fontPreloads(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((links) => links.map((l) => new URL((l as HTMLLinkElement).href).pathname));
}

test("the home page loads only the upright font: its statement is upright (0042)", async ({ page }) => {
  for (const path of ["/", "/it"]) {
    const fonts: string[] = [];
    page.on("response", (res) => {
      if (res.request().resourceType() === "font") fonts.push(new URL(res.url()).pathname);
    });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    expect(fonts, path).toEqual([UPRIGHT]);
    expect(await page.locator(".state em").evaluate((em) => getComputedStyle(em).fontStyle), path).toBe("normal");
    const crossorigin = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((l) => l.getAttribute("crossorigin")));
    expect(crossorigin.every((c) => c !== null)).toBe(true);
    page.removeAllListeners("response");
  }
});

test("no page preloads the italic", async ({ page }) => {
  for (const path of [
    "/",
    "/it",
    "/journal",
    "/photos",
    "/now",
    "/about",
    "/rights",
    "/lisbona",
    "/photos/lisbon/graca",
    "/it/journal",
    "/it/about",
    "/no-such-page",
  ]) {
    await page.goto(path);
    expect(await fontPreloads(page), path).toEqual([UPRIGHT]);
  }
});

test("a page with no italic text never requests the italic file", async ({ page }) => {
  const fonts: string[] = [];
  page.on("response", (res) => {
    if (res.request().resourceType() === "font") fonts.push(new URL(res.url()).pathname);
  });
  await page.goto("/journal");
  await page.evaluate(() => document.fonts.ready);
  expect(fonts).not.toContain(ITALIC);
});
