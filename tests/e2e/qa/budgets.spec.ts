/**
 * QA suite 8 (the part Playwright can do reliably; Lighthouse CI covers the category scores, see lighthouserc.json):
 * first-visit transfer sizes from the network log, and LCP and CLS on a Slow 4G phone (1.6 Mbit/s, 150 ms, CPU ×4).
 * Budgets of the brief (rule 3 and 8): text page ≤ 180 KB, CSS ≤ 20 KB, fonts ≤ 2 files / 80 KB, public JavaScript
 * ≤ 1.5 KB (raw), no third-party request, LCP < 2 s, CLS < 0.05.
 * The local Worker does not compress; Cloudflare does. Text answers are sized as Brotli (what a phone downloads);
 * images and fonts as they are.
 */
import { brotliCompressSync } from "node:zlib";
import { expect, test } from "@playwright/test";

test.skip(
  ({ browserName, javaScriptEnabled }) => browserName !== "chromium" || !javaScriptEnabled,
  "Chromium with JavaScript",
);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const TEXT_PAGES = ["/", "/it", "/journal", "/about", "/now", "/lisbona", "/it/lisbona", "/photos"];
const PHOTO_PAGES = ["/photos/lisbon", "/photos/lisbon/tram-28", "/it/photos/lisbon/tram-28"];

async function visit(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  path: string,
) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    w.__lcp = 0;
    w.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  const files: { url: string; type: string; bytes: number }[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (res) => {
    pending.push(
      (async () => {
        const body = await res.body().catch(() => Buffer.alloc(0));
        const type = (res.headers()["content-type"] ?? "").split(";")[0] ?? "";
        const text = /text\/|json|xml|javascript|svg/.test(type);
        // Playwright hands over the decoded body. If the server compressed it, the wire size is what the request
        // reports; if it did not (the local Worker), a text answer is sized as Brotli, as Cloudflare would send it.
        const wire =
          (
            await res
              .request()
              .sizes()
              .catch(() => null)
          )?.responseBodySize ?? 0;
        const encoded = res.headers()["content-encoding"];
        files.push({
          url: new URL(res.url()).pathname,
          type,
          bytes: encoded && wire > 0 ? wire : text ? brotliCompressSync(body).length : body.length,
        });
      })(),
    );
  });
  await page.goto(path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  const vitals = await page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number };
    return { lcp: w.__lcp, cls: w.__cls };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return { files, ...vitals };
}

for (const path of TEXT_PAGES) {
  test(`${path}: first visit within the text-page budgets, LCP and CLS on Slow 4G`, async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const { files, lcp, cls } = await visit(page, context, path);
    const sum = (pred: (f: (typeof files)[number]) => boolean) => files.filter(pred).reduce((n, f) => n + f.bytes, 0);
    const total = sum(() => true);
    const css = sum((f) => f.type === "text/css");
    const fonts = files.filter((f) => /font|woff/.test(f.type) || f.url.endsWith(".woff2"));
    const fontBytes = fonts.reduce((n, f) => n + f.bytes, 0);
    const scripts = files.filter((f) => /javascript/.test(f.type));
    const html = files.find((f) => f.type === "text/html");
    const inline = [...(await page.content()).matchAll(/<script>([\s\S]*?)<\/script>/g)].reduce(
      (n, m) => n + Buffer.byteLength(m[1] ?? ""),
      0,
    );
    const scriptRaw =
      inline +
      (await Promise.all(scripts.map(async (f) => (await (await page.request.get(f.url)).body()).length))).reduce(
        (a, b) => a + b,
        0,
      );
    testInfo.annotations.push({
      type: "measured",
      description: `total ${(total / 1024).toFixed(1)} KB, css ${(css / 1024).toFixed(1)} KB, fonts ${fonts.length} / ${(fontBytes / 1024).toFixed(1)} KB, js ${scriptRaw} B, html ${((html?.bytes ?? 0) / 1024).toFixed(1)} KB, LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}`,
    });
    expect(
      files.filter((f) => !f.url.startsWith("/")),
      "own origin only",
    ).toEqual([]);
    expect(total, `${path} transfers ${(total / 1024).toFixed(1)} KB`).toBeLessThanOrEqual(180 * 1024);
    expect(css, "CSS").toBeLessThanOrEqual(20 * 1024);
    expect(fonts.length, "font files").toBeLessThanOrEqual(2);
    expect(fontBytes, "font bytes").toBeLessThanOrEqual(80 * 1024);
    expect(scriptRaw, "public JavaScript (raw bytes)").toBeLessThanOrEqual(1536);
    expect(lcp, "LCP").toBeLessThan(2000);
    expect(cls, "CLS").toBeLessThan(0.05);
    void baseURL;
  });
}

for (const path of PHOTO_PAGES) {
  test(`${path}: LCP and CLS on Slow 4G (photo page: images are outside the text-page budget)`, async ({
    page,
    context,
  }, testInfo) => {
    const { files, lcp, cls } = await visit(page, context, path);
    const total = files.reduce((n, f) => n + f.bytes, 0);
    testInfo.annotations.push({
      type: "measured",
      description: `total ${(total / 1024).toFixed(1)} KB, LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}`,
    });
    expect(lcp, "LCP").toBeLessThan(2000);
    expect(cls, "CLS").toBeLessThan(0.05);
  });
}
