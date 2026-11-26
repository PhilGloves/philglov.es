import { expect, test, type Page } from "@playwright/test";
import { headMetrics } from "./head-metrics.ts";

/**
 * Decision 0025: every page starts the same way. The space under the header line mirrors the space above it, the
 * titles share one size, the intro sentences share one style, and the text starts the same distance under the intro.
 */

const widths = [390, 768, 1024, 1440] as const;
const TOLERANCE = 2; // px

/** Every kind of public page, in both languages. */
const paths = [
  "/",
  "/it",
  "/journal",
  "/it/journal",
  "/photos",
  "/it/photos",
  "/photos/lisbon",
  "/photos/lisbon/graca",
  "/it/photos/lisbon/graca",
  "/now",
  "/it/now",
  "/about",
  "/it/about",
  "/rights",
  "/it/rights",
  "/privacy",
  "/it/privacy",
  "/cv",
  "/lisbona",
  "/it/lisbona",
  "/no-such-page", // the 404
];

async function open(page: Page, path: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
}

test("the space under the header line mirrors the space above it, on every page, at four widths", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of paths) {
    for (const width of widths) {
      await open(page, path, width);
      const m = await headMetrics(page);
      const above = m.line - m.menuBaseline; // menu baseline up to the header line
      const below = m.first.capTop - m.line; // header line down to the top of the first capitals
      expect(
        Math.abs(below - above),
        `${path} at ${width}px: ${below.toFixed(1)} px below the line, ${above.toFixed(1)} px above`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  }
});

test("on desktop, whatever stands in the left column starts level with the top of the title's capitals", async ({
  page,
}) => {
  const beside = ["/", "/it", "/about", "/it/about", "/photos/lisbon/graca", "/no-such-page"];
  for (const path of beside) {
    for (const width of [1440, 1280, 1100]) {
      await open(page, path, width);
      const m = await headMetrics(page);
      expect(m.left, `${path} at ${width}px has something in the left column`).not.toBeNull();
      expect(
        Math.abs((m.left ?? 0) - m.h1.capTop),
        `${path} at ${width}px: left column at ${m.left}, capitals of the title at ${m.h1.capTop}`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  }
});

test("the page title is the same size, weight, line height and letter spacing everywhere", async ({ page }) => {
  const sizes: Record<number, string> = { 390: "40px", 768: "40px", 1024: "47.104px", 1440: "64px" };
  for (const width of widths) {
    let reference: Record<string, string> | undefined;
    for (const path of ["/journal", "/now", "/about", "/rights", "/lisbona", "/photos/lisbon/graca", "/photos"]) {
      await open(page, path, width);
      const style = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector("main h1") as Element);
        return {
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
        };
      });
      expect(style.fontSize, `${path} at ${width}px`).toBe(sizes[width]);
      reference ??= style;
      expect(style, `${path} at ${width}px`).toEqual(reference);
    }
  }
});

/** The intro sentence: its style, and where it sits. */
async function intro(page: Page): Promise<Record<string, string | number>> {
  return page.evaluate(() => {
    const lede = document.querySelector("main .lede") as Element;
    const h1 = document.querySelector("main h1") as Element;
    const cs = getComputedStyle(lede);
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      color: cs.color,
      width: Math.round(lede.getBoundingClientRect().width),
      under: Math.round(lede.getBoundingClientRect().top - h1.getBoundingClientRect().bottom),
    };
  });
}

test("the intro sentence has one style on Journal, Photos, About and Privacy", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await open(page, "/journal", width);
    const reference = await intro(page);
    expect(reference["under"], "28 px under the title").toBe(28);
    expect(reference["fontSize"]).toBe(width > 640 ? "22px" : "20px");
    for (const path of ["/photos", "/about"]) {
      await open(page, path, width);
      expect(await intro(page), `${path} at ${width}px`).toEqual(reference);
    }
    // Rights and Privacy keep their "originally written in" label between the title and the intro: the style is
    // the same, only the distance to the title differs.
    await open(page, "/privacy", width);
    const withLabel = await intro(page);
    expect({ ...withLabel, under: 0 }, `/privacy at ${width}px`).toEqual({ ...reference, under: 0 });
    expect(withLabel["under"]).toBeGreaterThan(28);
    await expect(page.locator("main h1 + .label + .lede")).toHaveCount(1);
  }
});

test("the text starts 52 / 68 / 80 px under the intro", async ({ page }) => {
  for (const [width, expected] of [
    [390, 52],
    [768, 68],
    [1024, 68],
    [1440, 80],
  ] as const) {
    for (const path of ["/rights", "/privacy"]) {
      await open(page, path, width);
      const gap = await page.evaluate(() => {
        const lede = (document.querySelector("main .lede") as Element).getBoundingClientRect();
        const text = (document.querySelector("main .prose") as Element).getBoundingClientRect();
        return text.top - lede.bottom;
      });
      expect(Math.abs(gap - expected), `${path} at ${width}px: ${gap}`).toBeLessThanOrEqual(1);
    }
    // About: on desktop the same 80 px, with the portrait beside; on phones and tablets the portrait stands
    // 28 px under the intro and the text starts 52 / 68 px under the portrait block.
    await open(page, "/about", width);
    const about = await page.evaluate(() => {
      const lede = (document.querySelector("main .lede") as Element).getBoundingClientRect();
      const text = (document.querySelector("main .prose") as Element).getBoundingClientRect();
      const lab = (document.querySelector("main .top--intro > .lab") as Element).getBoundingClientRect();
      return {
        toText: text.top - lede.bottom,
        toPortrait: lab.top - lede.bottom,
        portraitToText: text.top - lab.bottom,
      };
    });
    if (width > 1040) {
      expect(Math.abs(about.toText - expected), `/about at ${width}px: ${about.toText}`).toBeLessThanOrEqual(1);
      expect(about.toPortrait, "the portrait stands beside the head").toBeLessThan(0);
    } else {
      expect(Math.abs(about.toPortrait - 28), `/about at ${width}px: portrait ${about.toPortrait}`).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(about.portraitToText - expected),
        `/about at ${width}px: portrait to text ${about.portraitToText}`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test("a journal entry has no intro: the text keeps its distance under the title", async ({ page }) => {
  for (const [width, expected] of [
    [390, 24],
    [768, 32],
    [1440, 40],
  ] as const) {
    await open(page, "/lisbona", width);
    await expect(page.locator("main .lede")).toHaveCount(0);
    const gap = await page.evaluate(() => {
      const h1 = (document.querySelector("main h1") as Element).getBoundingClientRect();
      const text = (document.querySelector("main .prose") as Element).getBoundingClientRect();
      return text.top - h1.bottom;
    });
    expect(Math.abs(gap - expected), `entry at ${width}px: ${gap}`).toBeLessThanOrEqual(1);
  }
});

test("Home: no 'Photographer and developer'; the name stays inside the h1, hidden from sight", async ({ page }) => {
  for (const [path, kick, based] of [
    ["/", "Filippo Guanti", "Based in Msida, Malta.Writing in English and Italian."],
    ["/it", "Filippo Guanti", "Vivo a Msida, Malta.Scrivo in inglese e in italiano."],
  ] as const) {
    await page.goto(path);
    const visible = await page.locator("body").innerText();
    expect(visible).not.toContain("Photographer and developer");
    expect(visible).not.toContain("Fotografo e sviluppatore");
    await expect(page.locator(".hero .lab")).toContainText(based);
    const h1 = page.locator("main h1");
    await expect(h1).toContainText("Filippo Guanti");
    await expect(h1.locator("span.sr-only")).toHaveText(kick);
    // the hidden part takes no room: the visible title is the statement
    expect(await h1.locator("span.sr-only").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  }
});

test("Now keeps its description in metadata and shows only the authored text", async ({ page }) => {
  for (const path of ["/now", "/it/now"]) {
    await page.goto(path);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toBeTruthy();
    await expect(page.locator("main .lede")).toHaveCount(0);
    await expect(page.locator("main .prose p").first()).toBeVisible();
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", description ?? "");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const gap = await page.evaluate(() => {
        const title = document.querySelector("main h1")?.getBoundingClientRect();
        const text = document.querySelector("main .prose")?.getBoundingClientRect();
        return title && text ? text.top - title.bottom : Number.NaN;
      });
      expect(Math.abs(gap - 28), `${path} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
