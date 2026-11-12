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
    return [...document.fonts]
      .filter((face) => face.status === "error")
      .map((face) => `font failed: ${face.family} ${face.style} ${face.weight}`);
  });
}

/** `requestfailed: <url> (<reason>)`, with the reason Chromium gives, e.g. net::ERR_ABORTED. */
export const requestFailure = (req: import("@playwright/test").Request): string =>
  `requestfailed: ${req.url()} (${req.failure()?.errorText ?? "no reason"})`;
