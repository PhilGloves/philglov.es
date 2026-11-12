import { expect, test } from "@playwright/test";

const jsonLd = async (page: import("@playwright/test").Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
    (t) => JSON.parse(t) as Record<string, unknown>,
  );

test("robots.txt, tdmrep.json and the sitemap are served without the Worker's HTML handling", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const text = await robots.text();
  expect(text).toContain("Content-Signal: search=yes, ai-train=no");
  expect(text).toContain("User-agent: GPTBot");
  const tdm = await request.get("/.well-known/tdmrep.json");
  expect(tdm.status()).toBe(200);
  expect(await tdm.json()).toEqual([{ location: "/", "tdm-reservation": 1 }]);
  expect(tdm.headers()["tdm-reservation"]).toBe("1");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("xml");
});

test("images under /_assets/ carry noai, noimageai and the TDM reservation", async ({ request }) => {
  const res = await request.get("/_assets/share/default.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["x-robots-tag"]).toContain("noai, noimageai");
  expect(res.headers()["tdm-reservation"]).toBe("1");
});

test("every page carries the TDM meta tag and Open Graph tags with the share image", async ({ page }) => {
  await page.goto("/lisbona");
  await expect(page.locator('meta[name="tdm-reservation"]')).toHaveAttribute("content", "1");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://philglov.es/_assets/share/en-lisbona.png",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const image = await page.request.get("/_assets/share/en-lisbona.png");
  expect(image.status()).toBe(200);
});

test("titles follow the guide: home, and '<page> · Filippo Guanti' elsewhere", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Filippo Guanti — photographs, software and a journal");
  await expect(page.locator("h1")).toContainText("Filippo Guanti");
  await page.goto("/now");
  await expect(page).toHaveTitle("Now · Filippo Guanti");
  await page.goto("/about");
  await expect(page).toHaveTitle("About Filippo Guanti");
});

test("JSON-LD: Person on home and About, BlogPosting on an entry, ImageObject on a photo", async ({ page }) => {
  await page.goto("/");
  expect((await jsonLd(page)).map((d) => d["@type"])).toEqual(["Person"]);
  await page.goto("/it/about");
  expect((await jsonLd(page)).map((d) => d["@type"])).toEqual(["Person"]);
  await page.goto("/lisbona");
  const [post] = await jsonLd(page);
  expect(post?.["@type"]).toBe("BlogPosting");
  expect(post?.["inLanguage"]).toBe("en");
  expect(post?.["datePublished"]).toBe("2026-10-21");
  await page.goto("/photos/lisbon/tram-28");
  const [image] = await jsonLd(page);
  expect(image?.["@type"]).toBe("ImageObject");
  expect(image?.["license"]).toBe("https://philglov.es/rights");
  expect(image?.["acquireLicensePage"]).toBe("https://philglov.es/rights");
  expect(image?.["creditText"]).toBe("Filippo Guanti");
  await page.goto("/it/photos/lisbon/tram-28");
  expect((await jsonLd(page))[0]?.["license"]).toBe("https://philglov.es/it/rights");
});

test("rights and privacy pages carry the guide's texts in both languages", async ({ page }) => {
  await page.goto("/rights");
  await expect(page.locator("main")).toContainText(
    "Everything on this site — photographs, text, design — is © Filippo Guanti.",
  );
  await expect(page.locator("main")).toContainText("Directive (EU) 2019/790");
  await page.goto("/it/rights");
  await expect(page.locator("main")).toContainText("Tutti i diritti riservati");
  await page.goto("/privacy");
  await expect(page.locator("main")).toContainText("It sets no cookies, loads nothing from other companies");
  await page.goto("/it/privacy");
  await expect(page.locator("main")).toContainText("Non usa cookie");
  await expect(page.locator('footer a[href="/it/rights"]')).toContainText("No all’addestramento di IA");
});
