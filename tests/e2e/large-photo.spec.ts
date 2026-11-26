import { expect, test } from "@playwright/test";

/**
 * A click on a photograph opens its large version (decision 0043): a plain link, no script, so it works the same with
 * JavaScript on and off (both projects run this file). The fixtures have a series photo and an entry photo in each
 * language (0033), and the About portrait. Without originals in the build the pages draw placeholders, with no link, and these checks skip.
 */
const PAGES = [
  { path: "/photos/lisbon/tram-28", text: "Open the large version" },
  { path: "/it/photos/lisbon/alfama", text: "Apri la foto" },
  { path: "/foto", text: "Open the large version" },
  { path: "/it/provafoto", text: "Apri la foto" },
  { path: "/about", text: "Open the large version" },
  { path: "/it/about", text: "Apri la foto" },
];

for (const { path, text } of PAGES) {
  test(`${path}: the photograph is a link to its large version, named by its alt text and "${text}"`, async ({
    page,
  }) => {
    await page.goto(path);
    const link = page.locator("a.large");
    test.skip((await link.count()) === 0, "no originals in this build: placeholders only");
    await expect(link).toHaveCount(1);
    const alt = (await link.locator("img").getAttribute("alt")) ?? "";
    expect(alt.length).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: `${alt} ${text}`, exact: true })).toHaveCount(1);
    await expect(link).toHaveAttribute("href", /^\/_assets\/large\/[^/]+\.jpeg$/);
    await expect(link).not.toHaveAttribute("target", /.*/);
    await expect(link).toHaveCSS("display", "block");
    await expect(link).toHaveCSS("cursor", "zoom-in");

    // Keyboard: Tab reaches the link, and its focus ring has a box to draw around (0028).
    let focused = false;
    for (let i = 0; i < 40 && !focused; i++) {
      await page.keyboard.press("Tab");
      focused = await link.evaluate((a) => a === document.activeElement);
    }
    expect(focused, "Tab reaches the link").toBe(true);
    await expect(link).toHaveCSS("outline-style", "solid");
    const box = await link.boundingBox();
    expect(box && box.width > 100 && box.height > 100, "the focus ring surrounds the photograph").toBe(true);

    // Enter opens the large version in the same tab: a JPEG that says noindex.
    const [response] = await Promise.all([page.waitForResponse(/\/_assets\/large\//), page.keyboard.press("Enter")]);
    await expect(page).toHaveURL(/\/_assets\/large\/[^/]+\.jpeg$/);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/jpeg");
    expect(response.headers()["x-robots-tag"]).toMatch(/\bnoindex\b/);
    expect(page.context().pages()).toHaveLength(1);
  });
}

test("the home page and a series page link no photograph to a large version", async ({ page }) => {
  for (const path of ["/", "/photos/lisbon", "/it/photos/lisbon"]) {
    await page.goto(path);
    await expect(page.locator("a.large"), path).toHaveCount(0);
  }
});
