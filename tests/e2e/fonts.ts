import type { Page } from "@playwright/test";

/**
 * Call before leaving a page. Waits until every font the page has started to
 * load has finished (document.fonts.ready), then returns the font faces that
 * failed, so a broken font is a problem while a font cut off by the next
 * navigation never happens.
 *
 * Why (TICKETS.md, Q18): the upright Crimson Pro is preloaded, but the italic
 * file is fetched only when italic text is first drawn. A test that moves on
 * at once can navigate while that request is still in flight; Chromium then
 * aborts it (net::ERR_ABORTED) and Playwright reports `requestfailed`.
 */
export async function fontsSettled(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    // The two "Crimson Pro Fallback" faces are local() fonts (Palatino, Georgia) that tune the fallback text while
    // the real font loads. A machine that has none of them, such as a Linux CI runner, reports them as "error"
    // whenever a page paints before Crimson Pro is ready. That is by design, not a broken font.
    return [...document.fonts]
      .filter((face) => face.status === "error" && !face.family.replace(/"/g, "").startsWith("Crimson Pro Fallback"))
      .map((face) => `font failed: ${face.family} ${face.style} ${face.weight}`);
  });
}

/**
 * Call after load, after each viewport change and before leaving a page. Waits until every
 * image that has started to load has finished, then returns the ones that
 * failed (a photo answered 404, say), so a broken photo is a problem while a
 * photo request cut off by the test's own next step never happens.
 *
 * Why (TICKETS.md, Q20): a wider viewport makes a `<picture>` pick a larger
 * candidate. If the previous width's file is still downloading, Chromium drops
 * that request for the new one (net::ERR_ABORTED) and Playwright reports
 * `requestfailed`; leaving the page with a lazy photo in flight does the same.
 * Users never see an error from this; it only happens because the test
 * resizes faster than the photos load.
 *
 * "Started" means the image has a current source: a lazy image still outside
 * the viewport has none (`currentSrc` is empty, `complete` false) and is
 * skipped, as it would otherwise never finish.
 *
 * The page is polled from here with a synchronous check, because with
 * JavaScript disabled (the chromium-no-js project) the page runs no
 * callbacks: no requestAnimationFrame, timers or load listeners. The images
 * count as settled after two checks in a row, 100 ms apart, find nothing in
 * flight, so a source switch or lazy load the last resize or scroll triggered
 * has had time to begin. No deadline of its own: the test's timeout is it.
 * A page with no images returns at once.
 */
export async function imagesSettled(page: Page): Promise<string[]> {
  if ((await page.evaluate(() => document.images.length)) === 0) return [];
  const inFlight = () =>
    page.evaluate(() => [...document.images].filter((img) => img.currentSrc !== "" && !img.complete).length);
  for (let quiet = 0; quiet < 2;) {
    await page.waitForTimeout(100);
    quiet = (await inFlight()) === 0 ? quiet + 1 : 0;
  }
  // complete with no pixels: the current source failed to load or decode.
  return page.evaluate(() =>
    [...document.images]
      .filter((img) => img.currentSrc !== "" && img.complete && img.naturalWidth === 0)
      .map((img) => `image failed: ${new URL(img.currentSrc).pathname}`),
  );
}

/** fontsSettled and imagesSettled together: everything a page started to load has finished (Q18, Q20). */
export async function pageSettled(page: Page): Promise<string[]> {
  return [...(await fontsSettled(page)), ...(await imagesSettled(page))];
}

/** `requestfailed: <url> (<reason>)`, with the reason Chromium gives, e.g. net::ERR_ABORTED. */
export const requestFailure = (req: import("@playwright/test").Request): string =>
  `requestfailed: ${req.url()} (${req.failure()?.errorText ?? "no reason"})`;
