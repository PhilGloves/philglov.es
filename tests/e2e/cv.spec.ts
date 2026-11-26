/**
 * /cv (decision 0046): an unlisted page with a button for the CV, built from the fixtures' placeholder PDF
 * (scripts/fixture-photos.ts; dated 2026-11-01). Axe, overflow and console checks come with the QA suites, which take
 * their pages from dist/.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { builtPages, readBuilt } from "./qa/lib.ts";

const PDF = "/cv/filippo-guanti-cv.pdf";
const original = new URL("../fixtures/.originals/cv/filippo-guanti-cv.pdf", import.meta.url);

test("/cv has the title, the line, the button, the size and the date, and says noindex", async ({ page }) => {
  const res = await page.goto("/cv");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("CV");
  await expect(page.locator("main .lede")).toHaveText("My CV, as a PDF.");
  const button = page.getByRole("link", { name: "Download the CV (PDF)", exact: true });
  await expect(button).toHaveAttribute("href", PDF);
  await expect(button).toHaveAttribute("download", "");
  await expect(page.locator("main .updated")).toHaveText("1 KB · Last updated: 2026-11-01");
  // No twin: no hreflang, and the switch opens the Italian home page, saying so.
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  await expect(page.locator("header a.lang-switch")).toHaveAttribute("href", "/it");
  await expect(page.locator("header a.lang-switch")).toHaveAttribute("aria-label", /not available in Italian/);
  expect((await page.request.get("/it/cv")).status()).toBe(404);
});

test("the button downloads the PDF under its own name", async ({ page }) => {
  await page.goto("/cv");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download the CV (PDF)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Filippo-Guanti-CV.pdf");
});

test("the PDF is served unchanged, as a download, noindex", async ({ request }) => {
  const res = await request.get(PDF, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toBe('attachment; filename="Filippo-Guanti-CV.pdf"');
  expect(res.headers()["x-robots-tag"]).toBe("noindex");
  expect((await res.body()).equals(readFileSync(original))).toBe(true);
});

test("nothing points at /cv: not a page, the sitemap, a feed, entries.json or robots.txt", async ({ request }) => {
  const linking = builtPages()
    .filter((p) => p.file !== "cv.html")
    .filter((p) => /["'(]\/cv(?:[/"'?#)]|$)|philglov\.es\/cv\b/.test(readBuilt(p.file)))
    .map((p) => p.path);
  expect(linking).toEqual([]);
  for (const path of ["/sitemap.xml", "/feed.xml", "/it/feed.xml", "/robots.txt", "/_assets/entries.json"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(await res.text(), path).not.toMatch(/\/cv\b|"cv"/);
  }
});
