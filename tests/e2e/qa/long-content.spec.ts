/**
 * BUG-5 and SO-04 (fix round 2): no text a person can write may widen the page, at any width down to 320 px.
 * That is a comment's name and text, an entry's title, its text, its captions, the titles in the index, in the
 * previous/next links and on the photo pages. Long words and long links wrap.
 *
 * The built pages hold short placeholder text, so each test puts the worst case the content rules allow into the page
 * with the DOM: a 120-letter title (the schema's limit), a 300-letter word, a 300-character link, an 80-letter name.
 * (The comment list is written by the Worker, which the browser tests' stand-in cannot run; the same markup it writes
 * is put in here, as in comments-layout.spec.ts.) Each page type also proves that the text really went in, so a
 * changed template cannot turn the test into a no-op.
 */
import { expect, test, type Page } from "@playwright/test";
import { overflowX, WIDTHS } from "./lib.ts";

const TITLE = "W".repeat(120);
const WORD = "x".repeat(300);
const URL_TEXT = `https://example.com/${"a-very-long-path-segment/".repeat(12)}end`;
const NAME = "N".repeat(80);

/** Entry text, titles and captions: the selectors that hold text written by the owner. */
const TITLES = ["main h1", ".pn-grid .v", ".idx .t a", ".latest h3 a", ".series h2", ".top .title"] as const;
const TEXT = [
  ".prose p",
  ".prose h2",
  ".prose h3",
  ".prose li",
  ".prose blockquote",
  ".lede",
  ".latest .ex p",
] as const;
const CAPTIONS = ["figcaption", ".cap", ".shots figcaption"] as const;

/** Puts the worst case into every matching element; returns how many it touched, per group. */
async function fill(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    ({ titles, text, captions, TITLE, WORD, URL_TEXT }) => {
      const touched: Record<string, number> = { titles: 0, text: 0, captions: 0 };
      const put = (group: string, selectors: readonly string[], build: (el: Element) => void) => {
        for (const el of document.querySelectorAll(selectors.join(","))) {
          if (el.closest("footer.foot, header, .sr-only")) continue;
          build(el);
          touched[group] = (touched[group] ?? 0) + 1;
        }
      };
      put("titles", titles, (el) => void (el.textContent = TITLE));
      put("text", text, (el) => {
        el.textContent = `${WORD} `;
        const link = document.createElement("a");
        link.href = "https://example.com/";
        link.textContent = URL_TEXT;
        el.append(link);
      });
      put("captions", captions, (el) => void (el.textContent = `${WORD} ${URL_TEXT}`));
      return touched;
    },
    { titles: [...TITLES], text: [...TEXT], captions: [...CAPTIONS], TITLE, WORD, URL_TEXT },
  );
}

/** The comment list as the Worker writes it (worker/src/page.ts, commentList), with a reply. */
async function addComment(page: Page) {
  await page.evaluate(
    ({ NAME, WORD, URL_TEXT }) => {
      const slot = document.querySelector('[data-slot="comments"]');
      if (!slot) throw new Error("no comment slot");
      const li = document.createElement("li");
      li.className = "c";
      li.innerHTML =
        '<span class="c-n" aria-hidden="true">001</span><div><p class="c-who"><b></b> <span class="fine">13 November 2026</span></p>' +
        '<p class="c-body"></p><div class="c-reply"><span class="fine">Phil replied</span><p></p></div></div>';
      const text = `${WORD} ${URL_TEXT}`;
      for (const [selector, value] of [
        ["b", NAME],
        [".c-body", text],
        [".c-reply p", text],
      ] as const) {
        const el = li.querySelector(selector);
        if (!el) throw new Error(`the comment markup has no ${selector}`);
        el.textContent = value;
      }
      slot.append(li);
    },
    { NAME, WORD, URL_TEXT },
  );
}

const PAGES: { path: string; expects: ("titles" | "text" | "captions")[]; comments?: true }[] = [
  { path: "/lisbona", expects: ["titles", "text"], comments: true },
  { path: "/it/lisbona", expects: ["titles", "text"], comments: true },
  { path: "/journal", expects: ["titles"] },
  { path: "/", expects: ["titles", "text"] },
  { path: "/about", expects: ["titles", "text"] },
  { path: "/photos", expects: ["titles"] },
  { path: "/photos/lisbon", expects: ["titles", "captions"] },
  { path: "/photos/lisbon/tram-28", expects: ["titles", "captions"] },
];

for (const width of WIDTHS) {
  for (const page of PAGES) {
    test(`${page.path}: long titles, words, links, captions and comments do not widen the page at ${width} px`, async ({
      page: browserPage,
    }) => {
      await browserPage.setViewportSize({ width, height: 900 });
      await browserPage.goto(page.path);
      const before = await overflowX(browserPage);
      expect(before, "the page fits before anything is added (the control)").toBeLessThanOrEqual(0);
      const touched = await fill(browserPage);
      for (const group of page.expects) expect(touched[group], `${group} were filled in`).toBeGreaterThan(0);
      if (page.comments) await addComment(browserPage);
      expect(await overflowX(browserPage)).toBeLessThanOrEqual(0);
    });
  }
}

test("an entry's long title also wraps in dark mode at 320 px, and a long word wraps inside a list and a quote", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/lisbona");
  await page.evaluate(
    ({ TITLE, WORD }) => {
      const h1 = document.querySelector("h1");
      const prose = document.querySelector(".prose");
      if (!h1 || !prose) throw new Error("the entry has no title or text");
      h1.textContent = TITLE;
      prose.insertAdjacentHTML("afterbegin", `<ul><li>${WORD}</li></ul><blockquote><p>${WORD}</p></blockquote>`);
    },
    { TITLE, WORD },
  );
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
});
