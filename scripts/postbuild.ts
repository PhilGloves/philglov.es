/**
 * Runs after `astro build` and scripts/share-images.ts.
 *
 * 0. Fixes the footnote back-links in the built HTML (scripts/lib/footnotes.ts), then reads every page with
 *    scripts/lib/page-check.ts and stops the build, naming each page and problem, if an entry's or a page's text
 *    could redirect, embed, collect or run anything (raw HTML in Markdown; security audit, decision 0030).
 * 1. Finds the one inline script in the built HTML (the theme script), checks
 *    that every page carries exactly the same one, and writes its SHA-256 to
 *    worker/src/script-hashes.json. The Worker puts it in the CSP header
 *    (script-src 'self' 'sha256-…'); Astro's own CSP feature only emits a
 *    <meta> tag, which cannot carry frame-ancestors.
 * 0b. Moves the large versions of the photographs (decision 0043) into dist/_assets/large/ and points their links
 *    there, so that one _headers rule says noindex for them in every environment (Cloudflare's _headers cannot match
 *    by file name, and has a cap on the number of rules). scripts/photo-rights.ts has already checked them.
 * 2. Writes dist/_headers, which Cloudflare applies to the files served without
 *    the Worker (/_assets/*, robots.txt, feeds, …). The headers come from the
 *    same module the Worker uses. /_assets/* adds X-Robots-Tag: noai, noimageai
 *    (with noindex outside production, assetHeaderLines).
 * 3. Writes dist/favicon.ico from the site icon (src/assets/brand/favicon-32.png): crawlers and feed readers ask for it
 *    at the root, whatever the pages declare (BUG-8). The Worker never runs for it (wrangler.jsonc).
 * 4. Moves the content manifest to dist/_assets/entries.json for the Worker
 *    (entry paths, taken slugs, the stylesheet the admin pages link; 0017).
 *
 * It also copies the CV to dist/cv/ and writes its headers, when site.json names one that was fetched (0046).
 *
 * SITE_ENV=production only in the production deploy; anything else (the
 * default) adds X-Robots-Tag: noindex, so a stray build is never indexable.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { filesUnder } from "./lib/files.ts";
import { pngToIco } from "./lib/ico.ts";
import { originalsPath } from "./lib/content-root.ts";
import { removeStandIns } from "./lib/standins.ts";
import { cvInfo } from "./lib/cv.ts";
import {
  assetHeaderLines,
  baseHeaders,
  CV_PDF,
  cvHeaderRules,
  LARGE_DIR,
  largeHeaderLines,
} from "../worker/src/headers.ts";
import { localiseFootnotes } from "./lib/footnotes.ts";
import { largeLinks } from "./lib/photo-rights.ts";
import { inlineScripts, scriptHashesFile, sha256 } from "./lib/inline-scripts.ts";
import { pageProblems } from "./lib/page-check.ts";

const dist = new URL("../dist/", import.meta.url);

const hashes = new Set<string>();
const refused: string[] = [];
const large = new Set<string>();
const LARGE_LINK = '<a class="large" href="/_assets/';
for (const file of filesUnder(dist, /\.html$/)) {
  const original = readFileSync(file, "utf8");
  for (const href of largeLinks(original))
    if (href.startsWith("/_assets/") && !href.startsWith(LARGE_DIR)) large.add(href.slice("/_assets/".length));
  const html = localiseFootnotes(original).replaceAll(LARGE_LINK, `<a class="large" href="${LARGE_DIR}`);
  if (html.includes("↩")) throw new Error(`${file.pathname}: a footnote back-link still uses the "↩" glyph`);
  if (html !== original) writeFileSync(file, html);
  const page =
    file.pathname
      .slice(dist.pathname.length - 1)
      .replace(/\.html$/, "")
      .replace(/\/index$/, "") || "/";
  const problems = await pageProblems(html, { specimens: page === "/styleguide" });
  refused.push(...problems.map((p) => `  ${page}: ${p}`));
  const scripts = inlineScripts(html);
  if (scripts.length > 1) refused.push(`  ${page}: more than one inline script`);
  // The 404 and a few pages may carry the script too; every page must carry the same one.
  for (const body of scripts) hashes.add(sha256(body));
}
if (refused.length) {
  console.error(
    `postbuild: these pages hold HTML the site does not allow (raw HTML in an entry's Markdown, most likely). ` +
      `Remove it from the text; see decision 0030.\n${refused.join("\n")}`,
  );
  process.exit(1);
}
if (hashes.size !== 1) throw new Error(`Expected exactly one inline script across all pages, found ${hashes.size}`);
const scriptHashes = [...hashes];
// One line, as the file is committed (and as Prettier keeps it), so a build changes it only when the hash changes.
writeFileSync(new URL("../worker/src/script-hashes.json", import.meta.url), scriptHashesFile(scriptHashes));

// 0b. The large versions, into their own folder (their links already point there).
if (large.size) mkdirSync(new URL(`.${LARGE_DIR}`, dist), { recursive: true });
for (const name of large) renameSync(new URL(`_assets/${name}`, dist), new URL(`.${LARGE_DIR}${name}`, dist));

// 3. /favicon.ico, made from the one site icon.
writeFileSync(
  new URL("favicon.ico", dist),
  pngToIco(readFileSync(new URL("../src/assets/brand/favicon-32.png", import.meta.url))),
);

// 3b. The CV, its bytes unchanged, when site.json names one and it was fetched (decision 0046).
const cv = cvInfo(originalsPath);
if (cv) {
  mkdirSync(new URL("cv/", dist), { recursive: true });
  copyFileSync(cv.path, new URL(`.${CV_PDF}`, dist));
} else if (existsSync(new URL("cv.html", dist))) throw new Error("postbuild: dist/cv.html has no PDF to offer");

// 4. The content manifest for the Worker (B3, B8): dist/entries.json from the
//    Astro endpoint, plus the stylesheet the admin pages link, moved under
//    /_assets/ (the Worker never runs there) and removed from the root.
const manifestSource = new URL("entries.json", dist);
const manifest = JSON.parse(readFileSync(manifestSource, "utf8")) as Record<string, unknown>;
const home = readFileSync(new URL("index.html", dist), "utf8");
const stylesheets = [...home.matchAll(/<link rel="stylesheet" href="(\/_assets\/[^"]+\.css)"/g)].map((m) => m[1]);
if (stylesheets.length === 0) throw new Error("postbuild: no stylesheet link found in dist/index.html");
writeFileSync(new URL("_assets/entries.json", dist), `${JSON.stringify({ ...manifest, stylesheets })}\n`);
rmSync(manifestSource);

const env = process.env["SITE_ENV"] ?? "local";
const lines = ["# Generated by scripts/postbuild.ts - do not edit.", "/*"];
for (const [name, value] of Object.entries(baseHeaders(env, scriptHashes))) lines.push(`  ${name}: ${value}`);
lines.push("", "/_assets/*");
for (const line of assetHeaderLines(env)) lines.push(`  ${line}`);
lines.push("", `${LARGE_DIR}*`);
for (const line of largeHeaderLines()) lines.push(`  ${line}`);
if (cv) for (const [path, rules] of cvHeaderRules()) lines.push("", path, ...rules.map((line) => `  ${line}`));

writeFileSync(new URL("_headers", dist), `${lines.join("\n")}\n`);
console.log(`postbuild: wrote dist/_headers and script-hashes.json (${scriptHashes.join(", ")}) for SITE_ENV=${env}`);

// 5. The grey stand-ins of an ALLOW_MISSING_ORIGINALS=1 build have served their purpose (scripts/lib/standins.ts).
const removed = removeStandIns(originalsPath);
if (removed.length) console.warn(`postbuild: removed ${removed.length} stand-in photograph(s) from src/.originals`);
