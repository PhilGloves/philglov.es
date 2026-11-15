import { expect, test } from "@playwright/test";
import { fontsSettled, imagesSettled, pageSettled, requestFailure } from "./fonts.ts";

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
  // The step the test is in, so a failed request says where it happened (Q20).
  let step = "";
  page.on("requestfailed", (req) => problems.push(`[${step}] ${requestFailure(req)}`));
  page.on("request", (req) => {
    if (new URL(req.url()).origin !== new URL(baseURL ?? "").origin) problems.push(`third-party: ${req.url()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });

  for (const path of paths) {
    for (const colorScheme of ["light", "dark"] as const) {
      step = `${path} ${colorScheme}, load`;
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
      // Before the first width: let the photos the default viewport picked finish (Q20).
      problems.push(...(await imagesSettled(page)).map((p) => `${path}: ${p}`));
      for (const width of widths) {
        step = `${path} ${colorScheme}, ${width}px`;
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} at ${width}px (${colorScheme}) overflows by ${overflow}px`).toBeLessThanOrEqual(0);
        // Before the next width: let the photos this width picked finish, or the next one cuts them off (Q20).
        problems.push(...(await imagesSettled(page)).map((p) => `${path} at ${width}px: ${p}`));
      }
      // Before the next navigation: let late font loads (the italic, Q18) and late photo loads (Q20) finish, and
      // record any that failed.
      step = `${path} ${colorScheme}, leaving`;
      problems.push(...(await pageSettled(page)).map((p) => `${path}: ${p}`));
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

test("a photo that really fails is still reported: 404 on a lazy photo of the series", async ({ page }) => {
  const problems: string[] = [];
  page.on("requestfailed", (req) => problems.push(requestFailure(req)));
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${new URL(res.url()).pathname}`);
  });
  // Every size and format of the series' second photo (lazy, below the first one) answers 404.
  await page.route("**/_assets/graca.*", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/photos/lisbon");
  // Like tests/e2e/photos.spec.ts: without originals in the build the page draws placeholders, no <img>.
  test.skip((await page.locator(".frame picture").count()) === 0, "no originals in this build: placeholders only");
  const photo = page.locator('img[src*="/_assets/graca."]');
  await expect(photo).toHaveAttribute("loading", "lazy");
  // As in the page matrix: the widths change after load, which brings the lazy photo in and picks new sources.
  for (const width of widths) await page.setViewportSize({ width, height: 900 });
  await photo.scrollIntoViewIfNeeded();
  problems.push(...(await imagesSettled(page)));
  expect(
    problems.some((p) => /^HTTP 404: \/_assets\/graca\./.test(p)),
    problems.join("\n"),
  ).toBe(true);
  expect(
    problems.some((p) => /^image failed: \/_assets\/graca\./.test(p)),
    problems.join("\n"),
  ).toBe(true);
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
