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

test("the home page preloads the upright font only; the italic (the hero's emphasis) loads when drawn", async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on("response", (res) => {
    if (res.request().resourceType() === "font") fonts.push(new URL(res.url()).pathname);
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(fonts).toContain("/_assets/fonts/crimson-pro.woff2");
  for (const path of fonts) expect(path).toMatch(/^\/_assets\/fonts\/crimson-pro(-italic)?\.woff2$/);
  const preloads = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((links) => links.map((l) => new URL((l as HTMLLinkElement).href).pathname));
  expect(preloads).toEqual(["/_assets/fonts/crimson-pro.woff2"]);
});
