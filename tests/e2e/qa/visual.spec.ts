/**
 * QA suite 3: visual regression (project `visual`, `pnpm test:visual`). Full-page screenshots of representative pages
 * at the four design widths in both themes, against baselines in tests/e2e/__screenshots__/visual-<os>/.
 * Fonts render differently per operating system, so a baseline is made and checked on the same one:
 * first run `pnpm test:visual --update-snapshots`, LOOK at the images, and only then commit them.
 * Also: no horizontal scroll at 320 px and at 200 % zoom on every page is asserted by matrix.spec.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { settle, watch } from "./lib.ts";

const PAGES = [
  ["home", "/"],
  ["home-it", "/it"],
  ["journal", "/journal"],
  ["entry", "/lisbona"],
  ["photos", "/photos/lisbon"],
  ["photo", "/photos/lisbon/tram-28"],
  ["about", "/about"],
  ["not-found", "/no-such-page"],
] as const;

/**
 * Draw every image, then wait for each one (not for a time). A lazy image below the fold only starts loading once layout
 * has put it near the viewport, which can be after the page looks idle; leaving the page then cancels the request
 * (`net::ERR_ABORTED`). Setting `loading` to eager starts every request now, and the promise below resolves when each image
 * has loaded or failed, so nothing is in flight when the test navigates, resizes or takes the screenshot.
 */
async function loadEveryImage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const images = [...document.images];
    for (const image of images) image.loading = "eager";
    await Promise.all(
      images.map((image) =>
        image.complete
          ? undefined
          : new Promise<void>((done) => {
              image.addEventListener("load", () => done(), { once: true });
              image.addEventListener("error", () => done(), { once: true });
            }),
      ),
    );
    window.scrollTo(0, 0);
  });
}

/**
 * The real cause of the intermittent `net::ERR_ABORTED` (round 3): a full-page screenshot makes Chromium enlarge the
 * viewport to the whole page for the moment of the capture. `<picture>` then picks another, larger source for images whose
 * size depends on the viewport height (the tall Graça photo), starts that request in the middle of the screenshot, and
 * the next navigation cancels it; if it did finish, the screenshot showed the other resolution. So the viewport is made as
 * tall as the page first, images are re-chosen and loaded for it, and the screenshot then changes nothing.
 */
async function fitViewportToPage(page: Page, width: number): Promise<void> {
  let height = 900;
  for (let round = 0; round < 4; round++) {
    const wanted = await page.evaluate(() => document.documentElement.scrollHeight);
    if (wanted === height && round > 0) return;
    height = wanted;
    await page.setViewportSize({ width, height });
    // One frame after a resize, so the page has chosen its sources for the new size; then wait for them.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await loadEveryImage(page);
  }
}

for (const [name, path] of PAGES) {
  for (const theme of ["light", "dark"] as const) {
    test(`${name} (${theme}) at 1440, 1024, 768 and 390 px looks as the baseline`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      const seen = watch(page, baseURL ?? "", path === "/no-such-page" ? path : undefined);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      // The italic face is `font-display: optional` (decision 0025) and not preloaded: a first visit that does not
      // have the file within the first ~100 ms never shows it, so the same page drew upright "italics" or real ones
      // depending on how busy the machine was (one baseline had the one, a later run the other). Every screenshot here
      // is of a returning visitor: the faces are loaded once first, and the browser then has them for the first paint.
      await page.goto(path);
      await page.evaluate(() => Promise.allSettled([...document.fonts].map((face) => face.load())).then(() => undefined));
      await loadEveryImage(page); // nothing of the warm-up visit is still in flight when the page is left
      expect(await settle(page, seen)).toEqual([]);
      for (const width of [1440, 1024, 768, 390]) {
        // Why this test used to fail now and then with `requestfailed ... net::ERR_ABORTED` on an image (also on an
        // unchanged main): changing the width of a page that is still showing makes `<picture>` pick another source, so
        // the browser starts a new image request; the `goto` that follows cancels it if it has not finished. Whether it
        // had finished was a race. Leave the page first (everything on it has settled by now), resize the empty page,
        // and only then load the page at its new width: nothing is in flight at any moment the test itself changes.
        await page.goto("about:blank");
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await loadEveryImage(page);
        await fitViewportToPage(page, width);
        expect(await settle(page, seen)).toEqual([]);
        await expect(page).toHaveScreenshot(`${name}-${theme}-${width}.png`, {
          fullPage: true,
          animations: "disabled",
          // What the old 1% (maxDiffPixelRatio: 0.01) could hide, and why it is gone (round 3, W-08): of a 1440 px full-page
          // screenshot of 4 million pixels, 1% is 40,000 pixels, a block 200 px square: a missing control, a moved
          // button or a lost focus ring fits inside it. And Playwright's per-pixel `threshold` (default 0.2) ignores a
          // colour that moved a few steps, which is exactly what round 2's two colour changes were: they passed against
          // the old baselines. Baselines and checks run on the same machine, so the comparison is exact: no pixel may
          // differ, in any colour (anti-aliasing excepted, which pixelmatch skips by default).
          threshold: 0,
          maxDiffPixels: 0,
        });
      }
      expect(seen.problems).toEqual([]);
    });
  }
}
