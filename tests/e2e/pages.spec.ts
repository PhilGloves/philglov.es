import { expect, test } from "@playwright/test";
import { fontsSettled, requestFailure } from "./fonts.ts";

const widths = [320, 390, 768, 1024, 1440];

/** Every public URL: the sitemap lists them all, plus a path that does not exist. */
async function allPaths(request: import("@playwright/test").APIRequestContext): Promise<string[]> {
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>https:\/\/philglov\.es([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  return [...new Set(paths)];
}

test("every page × language × theme × five widths: one h1, no overflow, no style attributes, nothing third-party, no console noise", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const paths = await allPaths(request);
  expect(paths.length).toBeGreaterThan(20);

  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => problems.push(requestFailure(req)));
  page.on("request", (req) => {
    if (new URL(req.url()).origin !== new URL(baseURL ?? "").origin) problems.push(`third-party: ${req.url()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });

  for (const path of paths) {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const lang = path.startsWith("/it") ? "it" : "en";
      await expect(page.locator("html"), path).toHaveAttribute("lang", lang);
      await expect(page.locator("h1"), `${path} h1`).toHaveCount(1);
      await expect(page.locator("main#main"), path).toHaveCount(1);
      await expect(page.locator("[style]"), `${path} style attributes`).toHaveCount(0);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute(
        "href",
        `https://philglov.es${path === "/" ? "/" : path}`,
      );
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} at ${width}px (${colorScheme}) overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
      // Before the next navigation: let late font loads (the italic) finish, and record any that failed (Q18).
      problems.push(...(await fontsSettled(page)).map((p) => `${path}: ${p}`));
    }
  }
  expect(problems).toEqual([]);
});

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
