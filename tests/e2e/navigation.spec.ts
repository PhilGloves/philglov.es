/**
 * Q19: link clicks between pages log nothing in the console, with motion allowed (the setting most visitors have).
 * The cross-document view transitions that Chromium aborted with an uncaught InvalidStateError on about 5 of 8 clicks
 * are gone (owner decision 2026-11-13, decision 0021); this keeps them from coming back unnoticed.
 */
import { expect, test } from "@playwright/test";

test("clicking through the site logs nothing in the console", async ({ page }) => {
  const noise: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") noise.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => noise.push(`pageerror: ${err.message}`));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const route: [string, RegExp][] = [
    ["/about", /\/about$/],
    ["/", /\/$/],
    ["/lisbona", /\/lisbona$/],
    ["/", /\/$/],
    ["/about", /\/about$/],
    ["/", /\/$/],
    ["/lisbona", /\/lisbona$/],
    ["/", /\/$/],
  ];
  for (const [href, url] of route) {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForURL(url);
    await page.waitForLoadState("load");
    // Long enough for a transition (250 ms) to have run or failed.
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => document.fonts.ready);
  expect(noise).toEqual([]);
});
