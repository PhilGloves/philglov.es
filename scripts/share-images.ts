/**
 * Build step: turns the share-image SVG template into the 1200×630 PNGs that
 * social networks need (they do not accept SVG). Runs after `astro build`, before
 * scripts/postbuild.ts. Build-time only: nothing here ships to visitors.
 *
 * What it does
 *  - reads dist/share-manifest.json (an Astro endpoint lists one image per entry
 *    version plus a default), then deletes it so it is never served;
 *  - fills src/assets/brand/share-template.svg with each title (the same pure
 *    function the unit tests cover) and draws it with headless Chromium, using
 *    the Playwright that the end-to-end tests already install, so there is no new
 *    dependency; the text is set in the site's own Crimson Pro, embedded from
 *    public/_assets/fonts/crimson-pro.woff2, so the image matches the pages;
 *  - writes dist/_assets/share/<name>.png; a PNG is reused from
 *    node_modules/.cache/share-images/ while its title, template and font are
 *    unchanged, so only new or edited entries cost time.
 *
 * Needs Chromium: `pnpm exec playwright install chromium` (CI does it before the build).
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { fillShareTemplate } from "../src/assets/brand/share-image.ts";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const manifestUrl = new URL("share-manifest.json", dist);
const outDir = new URL("_assets/share/", dist);
const cacheDir = new URL("node_modules/.cache/share-images/", root);

const items = JSON.parse(readFileSync(manifestUrl, "utf8")) as { file: string; title: string }[];
const template = readFileSync(new URL("src/assets/brand/share-template.svg", root), "utf8");
const font = readFileSync(new URL("public/_assets/fonts/crimson-pro.woff2", root));
const hash = (...parts: (string | Buffer)[]) => {
  const h = createHash("sha256");
  for (const part of parts) h.update(part).update("\0");
  return h.digest("hex").slice(0, 32);
};
const fontHash = hash(font);

mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const pending = items.filter((item) => {
  const cached = new URL(`${hash(item.title, template, fontHash)}.png`, cacheDir);
  if (!existsSync(cached)) return true;
  copyFileSync(cached, new URL(item.file, outDir));
  return false;
});

if (pending.length > 0) {
  const browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      `Chromium is needed to draw the share images. Run: pnpm exec playwright install chromium\n${String(error)}`,
    );
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const fontFace = `@font-face{font-family:"Crimson Pro";src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2");font-weight:300 600;font-style:normal}`;
    for (const item of pending) {
      const html = `<!doctype html><meta charset="utf-8"><style>${fontFace}html,body{margin:0;background:#fbfbf8}svg{display:block}</style>${fillShareTemplate(item.title, template)}`;
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
      writeFileSync(new URL(item.file, outDir), png);
      writeFileSync(new URL(`${hash(item.title, template, fontHash)}.png`, cacheDir), png);
    }
  } finally {
    await browser.close();
  }
}

rmSync(manifestUrl);
console.log(
  `share-images: ${items.length} images in dist/_assets/share/ (${pending.length} drawn, ${items.length - pending.length} from cache)`,
);
