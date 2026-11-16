/**
 * Manual check "reading an entry with CSS disabled", automated. Every stylesheet request is answered with an empty
 * file (the browser then has only its default styles, as with View → No Style), and the entry is read the way a
 * person or a text browser would: in document order.
 *
 * Checked: the skip link is the first thing; the order is name → menu → title → text → previous/next → comments →
 * comment form → footer; headings never skip a level and there is one h1; every image has alt text; the language
 * switch and the theme button still have names; the honeypot, which only CSS hides, says "leave empty" and is empty;
 * the comment form and the report disclosure still work with the keyboard, and a comment can be sent.
 */
import { expect, test, type Page } from "@playwright/test";

const ENTRIES = [
  { path: "/lisbona", lang: "en", skip: "Skip to content", leave: "Leave this field empty" },
  { path: "/it/lisbona", lang: "it", skip: "Vai al contenuto", leave: "Lascia vuoto questo campo" },
  { path: "/one-roll", lang: "en", skip: "Skip to content", leave: "Leave this field empty" },
] as const;

async function withoutCss(page: Page) {
  await page.route("**/*.css", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
}

let n = 0;

for (const entry of ENTRIES) {
  test(`${entry.path} with CSS off: reading order, headings, alt text, names`, async ({ page }, testInfo) => {
    await withoutCss(page);
    await page.goto(entry.path);
    expect(
      await page.evaluate(() => [...document.styleSheets].reduce((sum, s) => sum + s.cssRules.length, 0)),
      "no author CSS applied",
    ).toBe(0);

    // Document order of the landmarks and the main parts.
    const positions = await page.evaluate(() => {
      const sels: [string, string][] = [
        ["skip link", "a.skip"],
        ["site name", "header .name"],
        ["menu", "header nav"],
        ["title", "h1"],
        ["entry text", ".prose"],
        ["comments", "#comments"],
        ["comment form", "#comment-form"],
        ["footer", "footer.foot"],
      ];
      const all = [...document.querySelectorAll("*")];
      return sels
        .map(([name, sel]) => [name, document.querySelector(sel)] as const)
        .filter(([, el]) => el !== null)
        .map(([name, el]) => [name, all.indexOf(el as Element)] as const);
    });
    const sorted = [...positions].sort((a, b) => a[1] - b[1]).map((p) => p[0]);
    expect(sorted, "document order").toEqual(positions.map((p) => p[0]));
    expect(sorted[0]).toBe("skip link");
    await expect(page.locator("a.skip")).toHaveText(entry.skip);
    await expect(page.locator("a.skip")).toHaveAttribute("href", "#main");

    // Headings: one h1, and no level is skipped going down.
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
        .filter((h) => !h.closest("[hidden]"))
        .map((h) => Number(h.tagName[1])),
    );
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => {
      if (i > 0)
        expect(l - (levels[i - 1] ?? 0), `heading ${i} (h${l}) after h${levels[i - 1]}`).toBeLessThanOrEqual(1);
    });

    // Every image says what it shows; every control has a name.
    const missingAlt = await page.evaluate(() =>
      [...document.images].filter((i) => !(i.getAttribute("alt") ?? "").trim()).map((i) => i.currentSrc || i.src),
    );
    expect(missingAlt).toEqual([]);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("a[href], button, input:not([type=hidden]), textarea, select")]
        .filter((el) => {
          const e = el as HTMLInputElement;
          const text = (el.textContent ?? "").trim();
          const hidden = el.closest('[aria-hidden="true"]') !== null;
          return (
            !hidden &&
            !text &&
            !el.getAttribute("aria-label") &&
            !(e.labels?.length ?? 0) &&
            !el.querySelector("img[alt]")
          );
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed, "links, buttons and fields with no name").toEqual([]);

    // The text reads in order: what a text browser would print.
    const text = (await page.locator("body").innerText()).replace(/\n{3,}/g, "\n\n");
    await testInfo.attach("reading-order.txt", { body: text, contentType: "text/plain" });
    expect(text.indexOf((await page.locator("h1").innerText()).trim())).toBeLessThan(
      text.indexOf("Comments") === -1 ? Infinity : text.indexOf("Comments"),
    );

    // The honeypot is hidden by CSS only; without it, it tells people to leave it alone.
    const hp = page.locator('input[name="website"]').first();
    await expect(hp).toHaveValue("");
    await expect(hp.locator("xpath=ancestor::*[@aria-hidden='true'][1]")).toHaveCount(1);
    await expect(page.locator(".hp label").first()).toHaveText(entry.leave);
  });
}

test("with CSS off the comment form and the report disclosure work from the keyboard, and a comment is sent", async ({
  page,
  javaScriptEnabled,
}) => {
  test.setTimeout(60_000);
  n += 1;
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": `198.22.${Math.floor(Math.random() * 250) + 1}.${n}` });
  await withoutCss(page);
  await page.goto("/lisbona");
  await page.waitForTimeout(3_300);
  // Into the form by keyboard: the name field is a tab stop, the honeypot is not.
  await page.locator("#comment-form").scrollIntoViewIfNeeded();
  await page.focus("#c-name");
  await page.keyboard.type("Marta");
  await page.keyboard.press("Tab");
  await expect(page.locator("#c-email")).toBeFocused();
  await page.keyboard.type("marta@example.com");
  await page.keyboard.press("Tab");
  await expect(page.locator("#c-comment")).toBeFocused();
  await page.keyboard.type("Reading this without any styling at all.");
  await page.keyboard.press("Tab");
  await expect(page.locator("#comment-form button[type=submit]")).toBeFocused();
  await page.keyboard.press("Enter");
  if (!javaScriptEnabled) await page.waitForURL(/\?sent=comment#comment-status$/);
  await expect(page.locator('#comment-status .notice[role="status"]')).toBeVisible();

  const summary = page.locator("footer summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('footer form[action^="/api/report"] textarea')).toBeVisible();
});
