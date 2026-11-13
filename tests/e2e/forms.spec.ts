/**
 * Both ways of sending the comment and report forms, against the real Worker (pnpm preview):
 *  - JavaScript on: src/scripts/forms.ts sends in the background; no reload, no scroll jump, the answer in the
 *    status slot, which takes focus so screen readers announce it.
 *  - JavaScript off: a plain POST; the browser lands on the status slot at once, without smooth scrolling.
 * Each test gets its own client address, so the Worker's rate limit (5 per 10 minutes) never carries over.
 */
import { expect, test, type Page } from "@playwright/test";

const ENTRY = "/lisbona";

/** Rule 11: no console errors or warnings, also while sending. */
let consoleNoise: string[] = [];
/** The one line a test may expect, written out where it does. */
let expectedNoise: string[] = [];

test.afterEach(() => {
  expect(consoleNoise).toEqual(expectedNoise);
});

test.beforeEach(async ({ page }) => {
  consoleNoise = [];
  expectedNoise = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") consoleNoise.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleNoise.push(`pageerror: ${err.message}`));
  const n = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": `198.18.${n()}.${n()}` });
  // Smooth scrolling is on for visitors who have not asked for reduced motion: test with it on.
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

/** The Worker refuses a form sent less than 3 s after the page was served. */
const humanPause = (page: Page) => page.waitForTimeout(3_200);

async function fillComment(page: Page, email = "marta@example.com") {
  await page.fill("#c-name", "Marta");
  await page.fill("#c-email", email);
  await page.fill("#c-comment", "The bit about hills being a negotiation is exactly how it felt to me too.");
}

test.describe("JavaScript on: sent in the background", () => {
  test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, "needs JavaScript");

  test("a comment: no reload, the thank-you in the status slot, focus on it, the page stays where it was", async ({
    page,
  }) => {
    await page.goto(ENTRY);
    await humanPause(page);
    await fillComment(page);
    await page.locator("#comment-form button[type=submit]").scrollIntoViewIfNeeded();
    await page.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
    const before = await page.evaluate(() => scrollY);
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => navigations.push(frame.url()));

    await page.locator("#comment-form button[type=submit]").click();

    const status = page.locator("#comment-status");
    await expect(status.locator('.notice[role="status"]')).toHaveText(
      "Thanks! I read every comment before it appears here.",
    );
    await expect(status).toBeFocused();
    expect(navigations).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
    expect(page.url()).toMatch(/\/lisbona$/);
    // Focus moves the view only as far as needed to show the message: never back to the top.
    const after = await page.evaluate(() => scrollY);
    expect(after).toBeGreaterThan(0);
    expect(Math.abs(after - before)).toBeLessThan(900);
    await expect(page.locator("#c-comment")).toHaveValue("");
  });

  test("field errors: next to the field, marked invalid, summed up in the alert; text kept; nothing reloads", async ({
    page,
  }) => {
    await page.goto(ENTRY);
    await humanPause(page);
    // Accepted by the browser's own email check, refused by the Worker's.
    await fillComment(page, "marta@example.c");
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => navigations.push(frame.url()));
    await page.locator("#comment-form button[type=submit]").click();

    const alert = page.locator('#comment-status .alert[role="alert"]');
    await expect(alert).toContainText("Your comment was not sent.");
    await expect(alert).toContainText("Email: Enter an address like name@example.com.");
    await expect(page.locator("#comment-status")).toBeFocused();
    await expect(page.locator("#c-email-err")).toHaveText("Enter an address like name@example.com");
    await expect(page.locator("#c-email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#c-name")).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#c-comment")).toHaveValue(/hills being a negotiation/);
    expect(navigations).toEqual([]);

    // Fixed and sent again: the error goes, the thank-you comes.
    await page.fill("#c-email", "marta@example.com");
    await page.locator("#comment-form button[type=submit]").click();
    await expect(page.locator('#comment-status .notice[role="status"]')).toBeVisible();
    await expect(page.locator("#c-email-err")).toHaveText("");
    await expect(page.locator("#c-email")).toHaveAttribute("aria-invalid", "false");
  });

  test("the report form in the footer: no reload, the thank-you in its own slot", async ({ page }) => {
    await page.goto("/it");
    await humanPause(page);
    await page.locator("footer summary").click();
    await page.fill("#f-msg", "Un refuso nel titolo.");
    await page.locator('footer form[action^="/api/report"] button[type=submit]').click();
    await expect(page.locator('#report-status .notice[role="status"]')).toHaveText(
      "Grazie! La segnalazione mi è arrivata.",
    );
    await expect(page.locator("#report-status")).toBeFocused();
    expect(page.url()).toMatch(/\/it$/);
  });

  test("no inline handlers, and the only request the script makes is to this origin's /api/", async ({
    page,
    baseURL,
  }) => {
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") posts.push(req.url());
    });
    await page.goto(ENTRY);
    expect(await page.locator("[onsubmit], [onclick], [onload]").count()).toBe(0);
    await humanPause(page);
    await fillComment(page);
    await page.locator("#comment-form button[type=submit]").click();
    await expect(page.locator('#comment-status .notice[role="status"]')).toBeVisible();
    expect(posts).toEqual([`${baseURL}/api/comment`]);
  });
});

test.describe("JavaScript off: a plain post", () => {
  test.skip(({ javaScriptEnabled }) => javaScriptEnabled, "the no-JavaScript project only");

  test("a comment: redirected to the status slot, which is in view at once, with no smooth scroll", async ({
    page,
  }) => {
    await page.goto(ENTRY);
    await humanPause(page);
    await fillComment(page);
    await page.locator("#comment-form button[type=submit]").click();
    await page.waitForURL(/\/lisbona\?sent=comment#comment-status$/);
    await expect(page.locator('#comment-status .notice[role="status"]')).toHaveText(
      "Thanks! I read every comment before it appears here.",
    );
    // Smooth scrolling is off while a status slot is the target, so the jump is instant ...
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    // ... and the view is already there and does not move afterwards.
    const first = await page.evaluate(() => scrollY);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => scrollY)).toBe(first);
    expect(first).toBeGreaterThan(0);
    await expect(page.locator("#comment-status")).toBeInViewport();
  });

  test("field errors: the page comes back at the status slot, not at the top", async ({ page }) => {
    // The brief answers a failed plain post with status 422, and Chrome reports any 4xx page in the console
    // (as for the 404 page). Owner question O4 in TICKETS.md; the background path answers 200 and logs nothing.
    expectedNoise = [
      "error: Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)",
    ];
    await page.goto(ENTRY);
    await humanPause(page);
    await fillComment(page, "marta@example.c");
    await page.locator("#comment-form button[type=submit]").click();
    await page.waitForURL(/\/api\/comment#comment-status$/);
    await expect(page.locator('#comment-status .alert[role="alert"]')).toContainText("Your comment was not sent.");
    await expect(page.locator("#comment-status")).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });

  test("elsewhere smooth scrolling stays as designed", async ({ page }) => {
    await page.goto(`${ENTRY}#comments`);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("smooth");
  });
});
