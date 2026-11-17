/**
 * QA suite 13: print and cookies.
 *  - An entry prints without the navigation, the theme button, the forms, the report disclosure and the footer, in
 *    both languages, and its text is all there (print media, and a PDF is made without error).
 *  - No page and no API answer sets a cookie, and the browser holds none after a visit and a form post.
 *  - Every entry has a favicon (SVG and PNG), an apple-touch-icon and a 1200×630 share image that exist.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { builtPages, readBuilt, transitionsDone } from "./lib.ts";

const entries = ["en", "it"].flatMap((l) =>
  readdirSync(new URL(`../../../src/content/journal/${l}/`, import.meta.url))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${l === "it" ? "/it" : ""}/${f.replace(/\.md$/, "")}`),
);

for (const path of entries) {
  test(`print: ${path} has no navigation, forms or footer, and keeps its text`, async ({ page, browserName }) => {
    await page.emulateMedia({ media: "print", colorScheme: "dark" }); // a dark theme must not print dark
    await page.goto(path);
    for (const selector of [".skip", ".head", ".foot", ".theme-toggle", "form", "details", ".tools", "nav"]) {
      const shown = await page.locator(selector).evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
      expect(shown, `${selector} is hidden in print`).toBe(0);
    }
    await expect(page.locator("h1")).toBeVisible();
    const text = await page.locator("main").innerText();
    expect(text.length, "the entry text prints").toBeGreaterThan(100);
    await transitionsDone(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(
      ["rgb(255, 255, 255)", "rgba(0, 0, 0, 0)", "rgb(251, 251, 248)"],
      `print background (${bg}) is light`,
    ).toContain(bg);
    if (browserName === "chromium") {
      const pdf = await page.pdf({ format: "A4" });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });
}

test("no page or API answer sets a cookie", async ({ request }) => {
  const offenders: string[] = [];
  for (const p of builtPages()) {
    const res = await request.get(p.path, { maxRedirects: 0 });
    if (res.headers()["set-cookie"]) offenders.push(p.path);
  }
  for (const path of [
    "/feed.xml",
    "/it/feed.xml",
    "/sitemap.xml",
    "/robots.txt",
    "/api/comment",
    "/_assets/share/default.png",
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    if (res.headers()["set-cookie"]) offenders.push(path);
  }
  const post = await request.post("/api/comment", {
    form: { name: "", email: "", comment: "", token: "x", slug: "lisbona", lang: "en", website: "" },
    maxRedirects: 0,
    headers: { "CF-Connecting-IP": "198.18.77.77" },
  });
  if (post.headers()["set-cookie"]) offenders.push("POST /api/comment");
  expect(offenders).toEqual([]);
});

test("after visiting pages and sending a form the browser holds no cookie", async ({
  page,
  context,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "uses the background send");
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": "198.18.88.88" });
  await page.goto("/lisbona");
  await page.waitForTimeout(3_300);
  await page.fill("#c-name", "Marta");
  await page.fill("#c-email", "marta@example.com");
  await page.fill("#c-comment", "A comment, only to see whether anything is stored.");
  await page.locator("#comment-form button[type=submit]").click();
  await expect(page.locator("#comment-status .notice")).toBeVisible();
  expect(await context.cookies()).toEqual([]);
});

test("every entry has its icons and a 1200×630 share image that exist", async ({ request }) => {
  const problems: string[] = [];
  for (const path of entries) {
    const html = readBuilt(`${path.slice(1)}.html`);
    const icons = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*?href="([^"]+)"/g)].map((m) => m[2] ?? "");
    if (icons.length < 3) problems.push(`${path}: ${icons.length} icon links (svg, png, apple-touch-icon expected)`);
    for (const href of icons) {
      const res = await request.get(href);
      if (res.status() !== 200) problems.push(`${path}: icon ${href} answers ${res.status()}`);
    }
    const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? "";
    const res = await request.get(new URL(og).pathname);
    if (res.status() !== 200) {
      problems.push(`${path}: share image ${og} answers ${res.status()}`);
      continue;
    }
    const png = await res.body();
    const isPng = png.subarray(1, 4).toString() === "PNG";
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (!isPng || width !== 1200 || height !== 630)
      problems.push(`${path}: share image is ${isPng ? `${width}×${height}` : "not a PNG"}`);
    if (og.includes("/default.png")) problems.push(`${path}: uses the default share image, not its own`);
  }
  expect(problems).toEqual([]);
});

// BUG-8 (fixed in fix round 2): crawlers and feed readers ask for /favicon.ico whatever the pages declare. It is the
// site icon in the .ico container (scripts/postbuild.ts), served by the static assets, so the Worker never runs for it.
test("/favicon.ico answers 200 with the site icon as an .ico file", async ({ request }) => {
  const res = await request.get("/favicon.ico");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^image\/(x-icon|vnd\.microsoft\.icon)/);
  const body = await res.body();
  expect([...body.subarray(0, 6)], "an icon header: type 1, one image").toEqual([0, 0, 1, 0, 1, 0]);
  const png = readFileSync(new URL("../../../src/assets/brand/favicon-32.png", import.meta.url));
  expect(body.subarray(22).equals(png), "the image inside is the site's own icon").toBe(true);
});
