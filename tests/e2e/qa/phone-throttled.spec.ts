/**
 * Manual check "publish a test entry from a phone on a throttled connection", emulated. A 390 × 844 touch phone,
 * Slow 4G (1.6 Mbit/s down, 750 kbit/s up, 150 ms), CPU ×4, against the real Worker behind a test Access
 * (`pnpm preview` has no /admin: Access is not there; tests/e2e/admin-worker.ts is the same Worker with its own).
 * A real photo of about 1.2 MB goes up while the page shows progress; the connection drops in the middle and the
 * upload carries on by itself; the entry is published as a pull request on its own branch.
 * What this cannot say: how it feels on a real phone and a real network (docs: QA-REPORT.md, "For the owner").
 */
import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { serveAdmin, type Admin } from "../admin-worker.ts";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.skip(
  ({ browserName, javaScriptEnabled }) => browserName !== "chromium" || !javaScriptEnabled,
  "Chromium with JavaScript",
);

let admin: Admin | undefined;
test.afterEach(async () => {
  await admin?.close();
});

test("publish with a photo on Slow 4G, with the connection dropping for a few seconds mid-upload", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  admin = await serveAdmin();
  const noise: string[] = [];
  page.on("console", (m) => {
    if (
      (m.type() === "error" || m.type() === "warning") &&
      !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())
    )
      noise.push(m.text());
  });
  page.on("pageerror", (e) => noise.push(e.message));

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // The page itself: usable in a reasonable time on this connection.
  const t0 = Date.now();
  await page.goto(`${admin.origin}/admin/write`, { waitUntil: "load" });
  await expect(page.locator("#w-title")).toBeVisible();
  const loadMs = Date.now() - t0;
  testInfo.annotations.push({ type: "measured", description: `/admin/write ready in ${loadMs} ms on Slow 4G` });
  expect(loadMs, "the write page is ready within 8 s on Slow 4G").toBeLessThan(8_000);

  await page.tap("#w-title");
  await page.keyboard.type("Una prova dal treno");
  await page.tap("#w-desc");
  await page.keyboard.type("Scritta con il pollice, in viaggio.");
  await page.tap("#w-body");
  await page.keyboard.type("Testo di prova scritto mentre il treno è in galleria.");

  // A real JPEG, about 1.5 MB (noise does not compress).
  const width = 1400;
  const height = 1000;
  const jpeg = await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  expect(jpeg.length).toBeGreaterThan(1_000_000);
  testInfo.annotations.push({ type: "photo", description: `${(jpeg.length / 1048576).toFixed(1)} MB` });

  // The connection drops: the first two sends of the photo are cut at the network, the third goes through. (Emulated
  // "offline" does not cut an upload that is already on the wire: it went on to 100 %, so the cut is made on the request.)
  let dropUploads = true;
  await page.route("**/admin/upload*", (route) => (dropUploads ? route.abort("connectionfailed") : route.continue()));
  await page.setInputFiles("#w-photos", { name: "IMG_0042.JPG", mimeType: "image/jpeg", buffer: jpeg });
  const progress = page.locator(".upload progress");
  await expect(progress).toBeVisible({ timeout: 20_000 });
  // Wait for what the page says, not for a time: it lost the connection twice (the first retry comes at once, the second
  // after a growing pause). Then the connection is back.
  await expect(page.locator(".upload")).toContainText("connection lost, retrying (2 of 5)", { timeout: 60_000 });
  dropUploads = false;
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  // It finishes by itself (retrying with growing pauses), and the photo's fields appear.
  const alt = page
    .locator('#photo-list input[name="photo_alt"], [data-photos] input[name="photo_alt"], input[name="photo_alt"]')
    .first();
  await expect(alt).toBeVisible({ timeout: 120_000 });
  await alt.tap();
  await page.keyboard.type("Una galleria buia vista dal finestrino");
  await expect(page.getByRole("status").filter({ hasText: "uploaded" })).toContainText("Add its alt text");

  await page.getByRole("button", { name: "Publish" }).tap();
  await expect(page.locator("#published")).toBeVisible({ timeout: 60_000 });

  const puts = admin.github.calls.filter((c) => c.method === "PUT");
  expect(puts).toHaveLength(1);
  expect(String(puts[0]?.body?.["branch"])).toMatch(/^publish\//);
  const text = Buffer.from(String(puts[0]?.body?.["content"]), "base64").toString("utf8");
  expect(text).toContain("Una galleria buia vista dal finestrino");
  expect(text).toMatch(/!\[Una galleria buia vista dal finestrino\]\(/);
  expect(admin.github.calls.some((c) => c.method === "POST" && /\/pulls$/.test(c.path))).toBe(true);
  expect(noise).toEqual([]);
});
