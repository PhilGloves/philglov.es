/**
 * QA: the smoke subset in Firefox and WebKit (projects `firefox` and `webkit`): home, one entry, one photo page and
 * both forms, at 1440 and 390 px. Console, network, overflow, headers and the forms' two outcomes.
 */
import { expect, test, type Page } from "@playwright/test";
import { overflowX, settle, watch } from "./lib.ts";

const PAGES = ["/", "/it", "/lisbona", "/photos/lisbon", "/photos/lisbon/tram-28"];

for (const width of [1440, 390]) {
  test(`smoke at ${width}px: pages load clean, nothing overflows, nothing third-party`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const seen = watch(page, baseURL ?? "");
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
