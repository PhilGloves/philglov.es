import { expect, test, type Locator } from "@playwright/test";

async function expectConsecutiveLines(lines: Locator) {
  await expect(lines).toHaveCount(2);
  const first = await lines.nth(0).boundingBox();
  const second = await lines.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  if (first && second) expect(Math.abs(first.y + first.height - second.y)).toBeLessThanOrEqual(1);
}

test("home and journal captions break between sentences and fit their columns", async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, first, second] of [
      [
        "/",
        "mark entries I wrote in one language and translated myself.",
        "IT only and solo EN exist in one language so far.",
      ],
      [
        "/journal",
        "mark entries I wrote in one language and translated myself.",
        "IT only and solo EN exist in one language so far.",
      ],
      [
        "/it",
        "segnano le voci che ho scritto in una lingua e tradotto io.",
        "IT only e solo EN esistono per ora in una sola lingua.",
      ],
      [
        "/it/journal",
        "segnano le voci che ho scritto in una lingua e tradotto io.",
        "IT only e solo EN esistono per ora in una sola lingua.",
      ],
    ] as const) {
      await page.goto(path);
      const legend = page.locator("main p.small.muted").filter({ hasText: first });
      await expect(legend).toHaveCount(1);
      await expect(legend).toContainText(second);
      await expectConsecutiveLines(legend.locator(":scope > .caption-line"));
      expect(await legend.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("normal");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (path === "/" || path === "/it") {
        const hero = page.locator(".hero .lab p");
        await expectConsecutiveLines(hero.locator(":scope > .caption-line"));
        const lines = (await hero.innerText()).split("\n");
        expect(lines).toEqual(
          path === "/"
            ? ["Based in Msida, Malta.", "Writing in English and Italian."]
            : ["Vivo a Msida, Malta.", "Scrivo in inglese e in italiano."],
        );
        const caption = await hero.boundingBox();
        const title = await page.locator(".hero h1").boundingBox();
        expect(caption).not.toBeNull();
        expect(title).not.toBeNull();
        if (width <= 768 && caption && title) expect(caption.y + caption.height).toBeLessThanOrEqual(title.y);
      }
    }
  }
});
