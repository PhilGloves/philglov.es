import { expect, test } from "@playwright/test";

const homes = [
  { path: "/", lang: "en", other: "/it" },
  { path: "/it", lang: "it", other: "/" },
] as const;

for (const home of homes) {
  test(`home ${home.path} renders in ${home.lang} with no console noise or third-party requests`, async ({
    page,
    baseURL,
  }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") problems.push(`console ${msg.type()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    page.on("requestfailed", (req) => problems.push(`requestfailed: ${req.url()}`));
    page.on("request", (req) => {
      if (new URL(req.url()).origin !== new URL(baseURL ?? "").origin) problems.push(`third-party: ${req.url()}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
    });

    const response = await page.goto(home.path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", home.lang);
    await expect(page).toHaveTitle(/Filippo Guanti/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("a.skip")).toHaveAttribute("href", "#main");
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.locator(`header a[hreflang][href="${home.other}"]`)).toBeVisible();
    await expect(page.locator("[style]")).toHaveCount(0);
    expect(problems).toEqual([]);
  });
}

test("HTML responses carry the security headers and noindex outside production", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).not.toContain("unsafe-inline");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["tdm-reservation"]).toBe("1");
  expect(h["x-robots-tag"]).toBe("noindex");
  expect(h["cache-control"]).toBe("no-cache");
});

test("trailing slashes redirect to the slash-less URL", async ({ request }) => {
  const res = await request.get("/it/", { maxRedirects: 0 });
  expect([301, 307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toMatch(/\/it$/);
});

test("/admin and /api are not served yet", async ({ request }) => {
  for (const path of ["/admin", "/admin/write", "/ADMIN", "/api/comment"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
  }
});
