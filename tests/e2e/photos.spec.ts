import { expect, test } from "@playwright/test";

/**
 * Photo pages (ticket P). With no originals in the build (a fork, a laptop) the
 * pages draw placeholders and these checks skip; CI fetches the originals.
 */
test.use({ viewport: { width: 390, height: 844 } });

for (const path of ["/photos/lisbon", "/it/photos/lisbon"]) {
  test(`${path}: first screen on a 390 px phone stays under 400 KB, every image has alt text`, async ({ page }) => {
    let bytes = 0;
    page.on("response", async (res) => {
      if (/\.(avif|webp|jpe?g)(\?|$)/.test(res.url())) bytes += (await res.body()).length;
    });
    await page.goto(path, { waitUntil: "load" });
    test.skip((await page.locator(".frame picture").count()) === 0, "no originals in this build: placeholders only");
    await page.waitForLoadState("networkidle");

    const html = await page.locator("html").getAttribute("lang");
    const imgs = page.locator(".frame img");
    for (let i = 0; i < (await imgs.count()); i++) {
      const alt = (await imgs.nth(i).getAttribute("alt")) ?? "";
      expect(alt.trim().length, `image ${i} has alt text in ${html}`).toBeGreaterThan(0);
    }
    // Only what is on screen loads: the rest is lazy. 400 KB is the guide's budget for the first screen.
    expect(bytes).toBeLessThan(400 * 1024);
  });
}

test("a photograph page shows its picture with width, height and the largest sensible size", async ({ page }) => {
  await page.goto("/photos/lisbon/tram-28");
  test.skip((await page.locator(".frame picture").count()) === 0, "no originals in this build: placeholders only");
  const img = page.locator(".frame img");
  await expect(img).toHaveAttribute("fetchpriority", "high");
  await expect(img).toHaveAttribute("width", /\d+/);
  await expect(img).toHaveAttribute("height", /\d+/);
  await expect(img).not.toHaveAttribute("style", /.*/);
  const sources = await page.locator(".frame source").evaluateAll((els) => els.map((e) => e.getAttribute("type")));
  expect(sources).toContain("image/avif");
  expect(sources).toContain("image/webp");
});
