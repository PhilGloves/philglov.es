/**
 * QA suites 1, 3 (overflow), 10 (image attributes) and 13 (cookies): every built page × light/dark × five widths,
 * in both projects (JavaScript on and off). One test per page, so a failure names the page.
 *
 * Fails on: a console error or warning, an uncaught error, a failed request, any response ≥ 400, any request to a
 * host other than this site's, a page that scrolls sideways at 1440, 1024, 768, 390 or 320 px or at 200 % zoom
 * (640 CSS px) and 400 % zoom (320 CSS px), an inline style attribute, an <img> without width, height or alt, an
 * empty alt without a reason, and any cookie.
 */
import { expect, test } from "@playwright/test";
import { builtPages, overflowX, settle, THEMES, watch, WIDTHS } from "./lib.ts";

test.describe.configure({ mode: "parallel" });

for (const built of builtPages()) {
  test(`${built.path}: console, network, overflow, images, cookies`, async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    const seen = watch(page, baseURL ?? "", built.status === 404 ? built.path : undefined);
    const problems: string[] = [];

    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 1440, height: 900 });
      const response = await page.goto(built.path);
      expect(response?.status(), `${built.path} status`).toBe(built.status);
      await expect(page.locator("html")).toHaveAttribute("lang", built.lang);
      await expect(page.locator("h1"), `${built.path} h1`).toHaveCount(1);
      await expect(page.locator("main#main")).toHaveCount(1);
      await expect(page.locator("[style]"), "inline style attributes").toHaveCount(0);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        problems.push(...(await settle(page, seen)).map((p) => `${theme} ${width}px: ${p}`));
        const over = await overflowX(page);
        if (over > 0) problems.push(`${theme} ${width}px: scrolls sideways by ${over}px`);
      }
      // 200 % zoom of a 1280 px window is 640 CSS px; 400 % is 320 CSS px (WCAG 1.4.10, reflow).
      await page.setViewportSize({ width: 640, height: 450 });
      await settle(page, seen);
      const zoomed = await overflowX(page);
      if (zoomed > 0) problems.push(`${theme} 200% zoom (640px): scrolls sideways by ${zoomed}px`);

      const images = await page.evaluate(() =>
        [...document.images].map((img) => {
          const reason = img.closest('[role="presentation"], [role="none"], [aria-hidden="true"]') !== null;
          return {
            src: img.getAttribute("src") ?? "",
            width: img.getAttribute("width"),
            height: img.getAttribute("height"),
            alt: img.getAttribute("alt"),
            reason,
          };
        }),
      );
      for (const img of images) {
        const id = `<img src="${img.src.slice(0, 60)}">`;
        if (!/^\d+$/.test(img.width ?? "")) problems.push(`${id}: no numeric width`);
        if (!/^\d+$/.test(img.height ?? "")) problems.push(`${id}: no numeric height`);
        if (img.alt === null) problems.push(`${id}: no alt attribute`);
        else if (img.alt.trim() === "" && !img.reason) problems.push(`${id}: empty alt with no role justification`);
      }

      problems.push(...(await settle(page, seen)).map((p) => `${theme}: ${p}`));
      expect(await page.evaluate(() => document.cookie), "document.cookie").toBe("");
    }

    expect(await context.cookies(), "the browser holds no cookie for this site").toEqual([]);
    expect([...seen.problems, ...problems]).toEqual([]);
  });
}
