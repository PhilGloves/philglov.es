import { expect, test } from "@playwright/test";
import { fontsSettled, requestFailure } from "./fonts.ts";

// The page × language × theme × width matrix moved to qa/matrix.spec.ts (one test per page, QA suite 1).

test("a font that really fails is still reported: 404 on the italic file", async ({ page }) => {
  const problems: string[] = [];
  page.on("requestfailed", (req) => problems.push(requestFailure(req)));
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${new URL(res.url()).pathname}`);
  });
  await page.route("**/_assets/fonts/crimson-pro-italic.woff2", (route) => route.fulfill({ status: 404, body: "" }));
  // The home page draws italic text (the hero's emphasis), so the italic file is fetched.
  await page.goto("/");
  problems.push(...(await fontsSettled(page)));
  expect(problems).toContain("HTTP 404: /_assets/fonts/crimson-pro-italic.woff2");
  expect(problems.some((p) => /^font failed: .+ italic /.test(p))).toBe(true);
});

test("a missing page answers 404 with the bilingual help page", async ({ page }) => {
  for (const path of ["/no-such-page", "/it/no-such-page"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('main a[href="/"]')).toBeVisible();
    await expect(page.locator('main a[href="/it"]')).toBeVisible();
  }
});

test("the footer error-report form is on every page and opens from the keyboard", async ({ page }) => {
  await page.goto("/about");
  const summary = page.locator("footer summary");
  const form = page.locator('footer form[action^="/api/report"]');
  await expect(form).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(form).toBeVisible();
  await expect(form.locator('textarea[name="message"][required]')).toBeVisible();
  await expect(form.locator('input[name="email"]:not([required])')).toBeVisible();
  await expect(form).toHaveAttribute("method", /post/i);
  await expect(form.locator('input[name="url"]')).toHaveValue("/about");
  await expect(form.locator('input[name="token"]')).toHaveValue(/^v1\./);
  await expect(form.locator('input[name="website"]')).toHaveCount(1);
});

test("keyboard: the skip link is the first stop and leads to the main content", async ({ page }) => {
  await page.goto("/lisbona");
  await page.keyboard.press("Tab");
  const skip = page.locator("a.skip");
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
