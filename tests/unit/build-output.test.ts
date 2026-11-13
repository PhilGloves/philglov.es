import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { localiseFootnotes } from "../../scripts/lib/footnotes.ts";
import { inlineScripts, sha256 } from "../../scripts/lib/inline-scripts.ts";

const dist = new URL("../../dist/", import.meta.url);
const built = existsSync(new URL("index.html", dist));
const skip = built ? false : "run `pnpm build` first";

function walk(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)],
  );
}
const htmlFiles = (): URL[] => walk(dist).filter((f) => f.pathname.endsWith(".html"));

test("footnote back-links get the SVG arrow and the page's language, never the ↩ glyph", () => {
  const page = (lang: string) =>
    `<html lang="${lang}"><section data-footnotes class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2><li><a href="#x" data-footnote-backref="" aria-label="Back to reference 2" class="data-footnote-backref">↩</a></li></section></html>`;
  const en = localiseFootnotes(page("en"));
  assert.doesNotMatch(en, /↩/);
  assert.match(en, /<svg class="arr arr--left"/);
  assert.match(en, /aria-label="Back to reference 2"/);
  assert.match(en, />Footnotes<\/h2>/);
  const it = localiseFootnotes(page("it"));
  assert.match(it, /aria-label="Torna al riferimento 2"/);
  assert.match(it, />Note<\/h2>/);
  const none = '<html lang="en"><p>no footnotes ↩</p></html>';
  assert.equal(localiseFootnotes(none), none);
});

test("inline scripts: only executing ones are found, and the hash is the CSP form", () => {
  const html =
    '<script type="application/ld+json">{"a":1}</script><script src="/x.js"></script><script>var a=1;</script>';
  assert.deepEqual(inlineScripts(html), ["var a=1;"]);
  assert.match(sha256("var a=1;"), /^sha256-[A-Za-z0-9+/]+=*$/);
});

test("every page carries the same single inline script, and the Worker's CSP hash matches it", { skip }, () => {
  const hashes = new Set<string>();
  for (const file of htmlFiles()) {
    const scripts = inlineScripts(readFileSync(file, "utf8"));
    assert.ok(scripts.length <= 1, `${file.pathname}: ${scripts.length} inline scripts`);
    for (const s of scripts) {
      assert.ok(Buffer.byteLength(s) <= 1024, "inline theme script is over 1 KB");
      hashes.add(sha256(s));
    }
  }
  assert.equal(hashes.size, 1);
  const workerHashes = JSON.parse(
    readFileSync(new URL("../../worker/src/script-hashes.json", import.meta.url), "utf8"),
  ) as string[];
  assert.deepEqual(workerHashes, [...hashes]);
  assert.match(
    readFileSync(new URL("_headers", dist), "utf8"),
    new RegExp(`'${[...hashes][0]}'`.replace(/[+/]/g, "\\$&")),
  );
});

test("no page has a style attribute, an external URL in src/href, or an arrow glyph", { skip }, () => {
  for (const file of htmlFiles()) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /\sstyle=/, `${file.pathname}: inline style`);
    assert.doesNotMatch(html, /\s(?:src|href)="https?:\/\/(?!philglov\.es)/, `${file.pathname}: third-party URL`);
    assert.doesNotMatch(html, /[→←↩↗↑↓]/, `${file.pathname}: arrow glyph (the font has none; use <Arrow>)`);
  }
});

// Rule 3: at most 1.5 KB of JavaScript on any public page, counted strictly as raw bytes: the inline theme script
// plus every script file the page loads (the background form sending, src/scripts/forms.ts; owner decision 2026-11-13).
const BUDGET = 1536;

test(
  "public JavaScript: theme script plus the form script, under 1.5 KB on every page, same origin only",
  { skip },
  () => {
    const files = new Set<string>();
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf8");
      const sources = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]*)"[^>]*>/g)].map((m) => m[1] ?? "");
      let bytes = inlineScripts(html).reduce((sum, body) => sum + Buffer.byteLength(body), 0);
      for (const src of sources) {
        assert.match(src, /^\/_assets\/[^/]+\.js$/, `${file.pathname}: script from ${src}`);
        files.add(src);
        bytes += readFileSync(new URL(`.${src}`, dist)).length;
      }
      assert.ok(bytes <= BUDGET, `${file.pathname}: ${bytes} bytes of JavaScript (budget ${BUDGET})`);
      // No inline event handlers anywhere (the CSP would block them; this keeps them out of the source too).
      assert.doesNotMatch(html, /<[^>]+\son[a-z]+=/i, `${file.pathname}: inline event handler`);
    }
    // Every script file under /_assets/ is one a page loads, and there is only the form script.
    const assets = walk(new URL("_assets/", dist))
      .filter((f) => f.pathname.endsWith(".js"))
      .map((f) => `/${f.pathname.slice(f.pathname.indexOf("_assets/"))}`);
    assert.deepEqual(assets.sort(), [...files].sort());
    assert.equal(files.size, 1, [...files].join(", "));
  },
);

test("share images are 1200×630 PNGs, one default and one per entry version", { skip }, () => {
  const dir = new URL("_assets/share/", dist);
  const files = readdirSync(dir);
  assert.ok(files.includes("default.png"));
  for (const name of files) {
    const png = readFileSync(new URL(name, dir));
    assert.equal(png.toString("ascii", 1, 4), "PNG", name);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], name);
  }
  assert.equal(existsSync(new URL("share-manifest.json", dist)), false, "the manifest must not be served");
});

test("dist/_headers: assets carry noai, noimageai; everything carries tdm-reservation", { skip }, () => {
  const headers = readFileSync(new URL("_headers", dist), "utf8");
  assert.match(headers, /\/_assets\/\*\n {2}X-Robots-Tag: noai, noimageai/);
  assert.match(headers, /tdm-reservation: 1/);
  assert.match(headers, /script-src 'self' 'sha256-/);
});
