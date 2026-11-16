/**
 * QA suite 3: visual regression (project `visual`, `pnpm test:visual`). Full-page screenshots of representative pages
 * at the four design widths in both themes, against baselines in tests/e2e/__screenshots__/visual-<os>/.
 * Fonts render differently per operating system, so a baseline is made and checked on the same one:
 * first run `pnpm test:visual --update-snapshots`, LOOK at the images, and only then commit them.
 * Also: no horizontal scroll at 320 px and at 200 % zoom on every page is asserted by matrix.spec.ts.
 */
import { expect, test } from "@playwright/test";
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

for (const [name, path] of PAGES) {
  for (const theme of ["light", "dark"] as const) {
    test(`${name} (${theme}) at 1440, 1024, 768 and 390 px looks as the baseline`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      const seen = watch(page, baseURL ?? "", path === "/no-such-page" ? path : undefined);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        // Lazy photos below the fold: scroll through once so every image is drawn, then back to the top.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
        });
        expect(await settle(page, seen)).toEqual([]);
        await expect(page).toHaveScreenshot(`${name}-${theme}-${width}.png`, {
          fullPage: true,
          animations: "disabled",
          maxDiffPixelRatio: 0.01,
        });
      }
      expect(seen.problems).toEqual([]);
    });
  }
}
