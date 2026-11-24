import { expect, test, type Locator } from "@playwright/test";

async function expectConsecutiveLines(lines: Locator, count = 2) {
  await expect(lines).toHaveCount(count);
  for (let i = 1; i < count; i++) {
    const above = await lines.nth(i - 1).boundingBox();
    const below = await lines.nth(i).boundingBox();
    expect(above).not.toBeNull();
    expect(below).not.toBeNull();
    if (above && below) expect(Math.abs(above.y + above.height - below.y)).toBeLessThanOrEqual(1);
  }
}

test("home and journal captions break between sentences and fit their columns", async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    // The fixtures' newest entry is "we", English only; the Italian journal has no EN→IT entry.
    for (const [path, expected] of [
      ["/", ["EN - written in English"]],
      [
        "/journal",
        [
          "EN - written in English",
          "IT→EN - written in Italian, translated to English",
          "IT only - exists only in Italian so far",
        ],
      ],
      ["/it", ["solo EN - ad oggi esiste solo in inglese"]],
      ["/it/journal", ["IT - scritto in italiano", "solo EN - ad oggi esiste solo in inglese"]],
    ] as const) {
      await page.goto(path);
      const legend = page.locator("main .sec .lab p.small.muted").filter({ has: page.locator(".caption-line") });
      await expect(legend).toHaveCount(1);
      await expectConsecutiveLines(legend.locator(":scope > .caption-line"), expected.length);
      // The arrow is an inline SVG (Arrows), so the text has none.
      expect((await legend.innerText()).split("\n")).toEqual(expected.map((line) => line.replace("→", "")));
      await expect(legend.locator("svg.arr")).toHaveCount(expected.filter((line) => line.includes("→")).length);
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
