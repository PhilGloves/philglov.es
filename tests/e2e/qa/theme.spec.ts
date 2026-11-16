/**
 * QA suite 4: theme.
 *  - The toggle's choice persists across navigation (both languages) and reload.
 *  - No flash of the wrong theme: the very first paint already has the stored theme's background (the inline script
 *    runs in <head> before any paint). Measured with a paint observer started before the page's own scripts, and a
 *    screenshot of that first paint is attached to the report.
 *  - With no choice made, the system preference decides, and follows it when it changes.
 *  - A stored choice beats the system preference, in both directions.
 * Without JavaScript there is no toggle and no stored choice: the system preference is all there is.
 */
import { expect, test, type Page } from "@playwright/test";

/** Background colours from the tokens (docs/design, tokens.css): near-white and #141513. */
const BG = { light: "rgb(251, 251, 248)", dark: "rgb(20, 21, 19)" } as const;

const background = (page: Page) =>
  page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor;
    return body !== "rgba(0, 0, 0, 0)" ? body : getComputedStyle(document.documentElement).backgroundColor;
  });

/**
 * Records the theme attribute and the background colour at the first animation frame after the document is parsed:
 * frame callbacks run just before the first paint, with the styles already applied. Paint entries are kept too when
 * the browser reports them.
 */
async function observeFirstPaint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __paints: Record<string, { theme: string | undefined; bg: string }> };
    w.__paints = {};
    const record = (name: string) => {
      const root = document.documentElement;
      const body = document.body ? getComputedStyle(document.body).backgroundColor : "no body yet";
      const bg = body !== "rgba(0, 0, 0, 0)" ? body : getComputedStyle(root).backgroundColor;
      w.__paints[name] = { theme: root.dataset["theme"], bg };
    };
    document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(() => record("first-frame")));
    new PerformanceObserver((list) => list.getEntries().forEach((e) => record(e.name))).observe({
      type: "paint",
      buffered: true,
    });
  });
}

test.describe("with JavaScript", () => {
  test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, "needs JavaScript");

  test("the choice persists across navigation, both languages, and reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    for (const [link, url] of [
      ['header a[href="/about"]', /\/about$/],
      ["header a.lang-switch", /\/it\/about$/],
      ['header nav a[href="/it/journal"]', /\/it\/journal$/],
      ["header .name a", /\/it$/],
    ] as const) {
      await page.locator(link).first().click();
      await page.waitForURL(url);
      await expect(page.locator("html"), `after going to ${link}`).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("[data-theme-toggle]")).toHaveAttribute("aria-pressed", "true");
      expect(await background(page)).toBe(BG.dark);
    }
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator("[data-theme-toggle]").click();
    await page.goto("/lisbona");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await background(page)).toBe(BG.light);
  });

  for (const [stored, system] of [
    ["dark", "light"],
    ["light", "dark"],
  ] as const) {
    test(`no flash: a stored ${stored} choice is already painted at first paint with the system on ${system}`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: system });
      await page.goto("/");
      await page.evaluate((t) => localStorage.setItem("theme", t), stored);
      await observeFirstPaint(page);
      // Slow the stylesheet so the first paint is a real, observable moment; the colour must still be right.
      await page.route("**/_assets/*.css", async (route) => {
        await new Promise((r) => setTimeout(r, 400));
        await route.continue();
      });
      await page.reload({ waitUntil: "commit" });
      await page.waitForLoadState("load");
      await page.evaluate(() => document.fonts.ready);
      const paints = await page.evaluate(
        () => (window as unknown as { __paints: Record<string, { theme?: string; bg: string }> }).__paints,
      );
      expect(Object.keys(paints), "the first frame was recorded").toContain("first-frame");
      for (const [name, seen] of Object.entries(paints)) {
        expect(seen.theme, `${name}: data-theme was already set`).toBe(stored);
        expect(seen.bg, `${name}: background`).toBe(BG[stored]);
      }
      await testInfo.attach(`settled-${stored}`, { body: await page.screenshot(), contentType: "image/png" });
    });
  }

  test("a stored choice beats the system preference, and the toggle says so", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("[data-theme-toggle]")).toHaveAttribute("aria-pressed", "true");
    await page.locator("[data-theme-toggle]").click(); // → light, stored
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    expect(await background(page)).toBe(BG.light);
    await expect(page.locator("[data-theme-toggle]")).toHaveAttribute("aria-pressed", "false");
  });

  test("a stored value that is not a theme is ignored, and the page follows the system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("theme", "<script>"));
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await background(page)).toBe(BG.dark);
  });
});

test("with no choice made, the system preference decides, and the page follows when it changes", async ({
  page,
  javaScriptEnabled,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/lisbona");
  expect(await background(page)).toBe(BG.dark);
  if (javaScriptEnabled) {
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    await expect(page.locator("[data-theme-toggle]")).toHaveAttribute("aria-pressed", "true");
  }
  await page.emulateMedia({ colorScheme: "light" });
  // The colours ease over 250 ms (motion tokens), so poll rather than read once.
  await expect.poll(() => background(page)).toBe(BG.light);
  if (javaScriptEnabled) await expect(page.locator("[data-theme-toggle]")).toHaveCount(1);
});

test("without JavaScript the toggle is not shown (it could do nothing)", async ({ page, javaScriptEnabled }) => {
  test.skip(javaScriptEnabled, "the no-JavaScript project only");
  await page.goto("/");
  await expect(page.locator("[data-theme-toggle]")).toBeHidden();
});

test("text keeps its contrast in both themes: body text in the page is AAA against its background", async ({
  page,
}) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/lisbona");
    const ratio = await page.evaluate(() => {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = (css: string) => {
        const [r = 0, g = 0, b = 0] = (css.match(/\d+(\.\d+)?/g) ?? []).map(Number);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const p = document.querySelector(".prose p") as HTMLElement;
      const fg = lum(getComputedStyle(p).color);
      const bgCss = getComputedStyle(document.body).backgroundColor;
      const bg = lum(bgCss);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(ratio, `${scheme}: body text contrast`).toBeGreaterThanOrEqual(7);
  }
});
