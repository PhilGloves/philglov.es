/**
 * QA suite 2: accessibility.
 *  - axe-core on every built page, in both themes, at 1440 and 390 px: zero violations (WCAG 2.0, 2.1 and 2.2 A/AA
 *    plus axe's best-practice rules), and the AAA contrast rule on body text (rule 6 asks for AAA body-text contrast).
 *  - Keyboard: Tab through a page; the skip link comes first; every stop shows a focus indicator (proved by a
 *    screenshot of the element with and without focus, which must differ); nothing is a trap; the theme toggle, the
 *    language switch and the report disclosure work from the keyboard.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { builtPages, THEMES } from "./lib.ts";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

async function axe(page: Page, options: object, context?: object): Promise<Violation[]> {
  // Evaluated over the DevTools protocol, so the page's CSP (no inline script) does not apply to it.
  await page.evaluate(`${axeSource}\n;0`);
  return page.evaluate(
    async ({ options, context }) => {
      const run = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: Violation[] }> } })
        .axe;
      return (await run.run(context ?? document, options)).violations;
    },
    { options, context },
  );
}

const describeViolations = (list: Violation[]) =>
  list.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => JSON.stringify(n.target)).join(", ")}`);

test.describe.configure({ mode: "parallel" });

for (const built of builtPages()) {
  test(`axe: ${built.path} has no violations in light and dark, at 1440 and 390 px`, async ({ page }) => {
    test.setTimeout(90_000);
    const found: string[] = [];
    for (const theme of THEMES) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(built.path);
        await page.evaluate(() => document.fonts.ready);
        const violations = await axe(page, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
          resultTypes: ["violations"],
        });
        found.push(...describeViolations(violations).map((v) => `${theme} ${width}px: ${v}`));
      }
      // Rule 6: AAA contrast for body text. Other text is held to AA by the rule above.
      await page.setViewportSize({ width: 1440, height: 900 });
      const enhanced = await axe(
        page,
        { runOnly: { type: "rule", values: ["color-contrast-enhanced"] }, resultTypes: ["violations"] },
        { include: [["main p"]], exclude: [[".foot"], [".fine"], [".sr-only"]] },
      );
      found.push(...describeViolations(enhanced).map((v) => `${theme} body text AAA: ${v}`));
    }
    expect(found).toEqual([]);
  });
}

const KEYBOARD_PAGES = ["/", "/it", "/lisbona", "/it/lisbona", "/journal", "/photos/lisbon", "/photos/lisbon/tram-28", "/about"];

for (const path of KEYBOARD_PAGES) {
  for (const theme of THEMES) {
    test(`keyboard: ${path} (${theme}): skip link first, every stop has a visible focus ring, no trap`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const stops: string[] = [];
      const problems: string[] = [];
      const first = new Set<string>();
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body || el === document.documentElement) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
          const id = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${name}`;
          const rect = { x: r.x, y: r.y, width: r.width, height: r.height };
          return {
            id,
            rect,
            visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none",
            inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
            ring:
              (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
              (cs.boxShadow !== "none" && cs.boxShadow !== ""),
            isSkip: el.classList.contains("skip"),
          };
        });
        if (info === null) break; // focus left the page: the cycle is complete, nothing trapped it
        if (first.has(info.id) && stops.length > 3) break;
        first.add(info.id);
        stops.push(info.id);
        if (i === 0 && !info.isSkip) problems.push(`first tab stop is "${info.id}", not the skip link`);
        if (!info.visible) problems.push(`${info.id}: focused but not visible`);
        if (!info.inView) problems.push(`${info.id}: focused but scrolled out of view`);
        if (!info.ring) problems.push(`${info.id}: no outline or box-shadow when focused`);

        // The ring is really drawn: the element looks different with and without focus.
        if (info.visible && info.inView && info.rect.width < 700) {
          const pad = 8;
          const clip = {
            x: Math.max(0, info.rect.x - pad),
            y: Math.max(0, info.rect.y - pad),
            width: info.rect.width + 2 * pad,
            height: info.rect.height + 2 * pad,
          };
          const withFocus = await page.screenshot({ clip, animations: "disabled" });
          const focused = await page.evaluateHandle(() => document.activeElement as HTMLElement);
          await focused.evaluate((el) => el.blur());
          const without = await page.screenshot({ clip, animations: "disabled" });
          if (withFocus.equals(without)) problems.push(`${info.id}: looks the same with and without focus`);
          if (stops.length <= 2) await testInfo.attach(`focus-${stops.length}-${theme}`, { body: withFocus, contentType: "image/png" });
          // Put focus back where it was so the next Tab goes on from here (the last input was the keyboard).
          await focused.evaluate((el) => el.focus());
          await focused.dispose();
        }
      }
      expect(stops.length, "the page has tab stops").toBeGreaterThan(5);
      expect(stops[0], "the skip link is first").toMatch(/^a Skip to content|^a Salta al contenuto/);
      expect(problems).toEqual([]);
    });
  }
}

test("the theme toggle, the language switch and the report disclosure work from the keyboard", async ({
  page,
  javaScriptEnabled,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/lisbona");

  if (javaScriptEnabled) {
    const toggle = page.locator("[data-theme-toggle]");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }

  const summary = page.locator("footer summary");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(page.locator('footer form[action^="/api/report"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator('footer form[action^="/api/report"]')).toBeHidden();

  await page.locator("a.lang-switch").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/it\/lisbona$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
});

test("every form control has a programmatic label, and errors are tied to their field", async ({ page }) => {
  for (const path of ["/lisbona", "/it/lisbona"]) {
    await page.goto(path);
    await page.locator("footer summary").click();
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
        .filter((el) => {
          const input = el as HTMLInputElement;
          const labelled =
            (input.labels?.length ?? 0) > 0 || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
          // The honeypot is hidden from people and assistive technology on purpose.
          const hidden = el.closest("[aria-hidden='true'], [hidden]") !== null;
          return !labelled && !hidden;
        })
        .map((el) => el.getAttribute("name")),
    );
    expect(missing, `${path}: controls with no label`).toEqual([]);
  }
});
