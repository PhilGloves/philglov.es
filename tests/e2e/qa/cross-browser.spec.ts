/**
 * QA: the smoke subset in Firefox and WebKit (projects `firefox` and `webkit`): home, one entry, one photo page and
 * both forms, at 1440 and 390 px. Console, network, overflow, headers and the forms' two outcomes.
 */
import { expect, test, type Page } from "@playwright/test";
import { overflowX, settle, watch } from "./lib.ts";

/**
 * WebKit upgrades every subresource of an http page to https, even on 127.0.0.1 (Chromium and Firefox do not for
 * loopback), because of the CSP directive `upgrade-insecure-requests`; the local Worker speaks http only, so nothing
 * but the HTML would load. Production is https and the directive does nothing there. These tests drop that one
 * directive from the CSP header, in every browser, and nothing else.
 */
// A route still fetching when a test ends (the touch icon, after the last navigation) is reported against the NEXT
// test ("route.fetch: Test ended"). Drop the routes first, ignoring what is in flight.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    const csp = headers["content-security-policy"];
    if (csp) headers["content-security-policy"] = csp.replace(/;?\s*upgrade-insecure-requests/, "");
    await route.fulfill({ response: res, headers });
  });
});

/**
 * Owner ruling 2026-11-16, decision 0026 (closes BUG-9): the site keeps `Cross-Origin-Opener-Policy`, and a browser
 * engine's own notice about cross-origin isolation does not count as a console warning under rule 11, as O4 ruled for
 * the 404 line. WebKit prints it on every page that has a COOP header. This is the one message allowed, word for word
 * (the second test below proves nothing else matches); the rule-11 test and the smoke tests leave out only this.
 */
const ENGINE_NOTICE_TEXT =
  "This document is not cross-origin isolated because the Cross-Origin-Embedder-Policy header is missing (it must be 'require-corp'). window.crossOriginIsolated is false and SharedArrayBuffer is unavailable.";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ENGINE_NOTICE = new RegExp(`^warning: ${escapeRegExp(ENGINE_NOTICE_TEXT)}$`);

const PAGES = ["/", "/it", "/lisbona", "/photos/lisbon", "/photos/lisbon/tram-28"];

for (const width of [1440, 390]) {
  test(`smoke at ${width}px: pages load clean, nothing overflows, nothing third-party`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const seen = watch(page, baseURL ?? "", undefined, ENGINE_NOTICE);
    await page.setViewportSize({ width, height: 900 });
    const problems: string[] = [];
    for (const path of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main#main")).toBeVisible();
      problems.push(...(await settle(page, seen)).map((p) => `${path}: ${p}`));
      const over = await overflowX(page);
      if (over > 0) problems.push(`${path}: overflows by ${over}px`);
      const style = await page.locator("[style]").count();
      if (style) problems.push(`${path}: ${style} inline style attributes`);
    }
    expect([...seen.problems, ...problems]).toEqual([]);
  });
}

test("theme toggle and language switch work", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/lisbona");
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("a.lang-switch").click();
  await expect(page).toHaveURL(/\/it\/lisbona$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("security headers are the same in this engine", async ({ request }) => {
  const h = (await request.get("/")).headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-content-type-options"]).toBe("nosniff");
});

async function pause(page: Page) {
  await page.waitForTimeout(3_300);
}
let n = 0;

test("comment form: refused when invalid, accepted when good", async ({ page }) => {
  test.setTimeout(60_000);
  n += 1;
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": `198.20.${Math.floor(Math.random() * 250) + 1}.${n}` });
  await page.goto("/lisbona");
  await pause(page);
  await page.locator("#comment-form").evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await page.fill("#c-name", "Marta");
  await page.fill("#c-email", "not-an-email");
  await page.fill("#c-comment", "Typed text that must stay.");
  await page.locator("#comment-form button[type=submit]").click();
  await expect(page.locator('#comment-status .alert[role="alert"]')).toContainText("Your comment was not sent.");
  await expect(page.locator("#c-comment")).toHaveValue("Typed text that must stay.");
  await page.fill("#c-email", "marta@example.com");
  await page.locator("#comment-form button[type=submit]").click();
  await expect(page.locator('#comment-status .notice[role="status"]')).toBeVisible();
});

test("report form: refused when empty, accepted when good", async ({ page }) => {
  test.setTimeout(60_000);
  n += 1;
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": `198.21.${Math.floor(Math.random() * 250) + 1}.${n}` });
  await page.goto("/it");
  await pause(page);
  await page.locator("footer summary").click();
  const form = page.locator('footer form[action^="/api/report"]');
  await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#report-status .alert[role="alert"]')).toBeVisible();
  await form.locator("textarea").fill("Un refuso nel titolo.");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#report-status .notice[role="status"]')).toBeVisible();
});

test("rule 11 in this browser: no console error or warning but the engine's cross-origin isolation notice", async ({
  page,
}) => {
  const lines: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") lines.push(`${m.type()}: ${m.text()}`);
  });
  for (const path of ["/", "/it", "/lisbona", "/photos/lisbon"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  // The notice may appear (WebKit) or not (Chromium, Firefox); anything else may not.
  expect(lines.filter((line) => !ENGINE_NOTICE.test(line))).toEqual([]);
});

test("the allowance is exactly one message: a different line, level or wording is still a problem", () => {
  expect(ENGINE_NOTICE.test(`warning: ${ENGINE_NOTICE_TEXT}`)).toBe(true);
  for (const line of [
    `error: ${ENGINE_NOTICE_TEXT}`,
    `warning: ${ENGINE_NOTICE_TEXT} More.`,
    `warning: Note: ${ENGINE_NOTICE_TEXT}`,
    "warning: This document is not cross-origin isolated because the Cross-Origin-Opener-Policy header is wrong.",
    "warning: Something else entirely.",
    "error: Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
  ])
    expect(ENGINE_NOTICE.test(line), line).toBe(false);
});
