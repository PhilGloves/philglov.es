import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { filesUnder } from "../../scripts/lib/files.ts";
import { localiseFootnotes } from "../../scripts/lib/footnotes.ts";
import { inlineScripts, sha256 } from "../../scripts/lib/inline-scripts.ts";
import { fixtureJournal } from "../fixtures/content.ts";

const dist = new URL("../../dist/", import.meta.url);
const built = existsSync(new URL("index.html", dist));
const skip = built ? false : "run `pnpm build` first";

const htmlFiles = (): URL[] => filesUnder(dist, /\.html$/);

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

// W-02: this used to allow a page with NO inline script ("<= 1"), and only compared the set of hashes, so deleting the
// theme script from one page passed. Every built page carries exactly one, and it is the one the Worker's CSP names.
test(
  "every page carries exactly one inline script, the theme script, and the Worker's CSP hash matches it",
  { skip },
  () => {
    const workerHashes = JSON.parse(
      readFileSync(new URL("../../worker/src/script-hashes.json", import.meta.url), "utf8"),
    ) as string[];
    assert.equal(workerHashes.length, 1, "the Worker's CSP names one script hash");
    const files = htmlFiles();
    assert.ok(files.length >= 20, `the build has its pages (${files.length})`);
    for (const file of files) {
      const scripts = inlineScripts(readFileSync(file, "utf8"));
      assert.equal(
        scripts.length,
        1,
        `${file.pathname}: ${scripts.length} inline scripts, expected the theme script only`,
      );
      const body = scripts[0] ?? "";
      assert.ok(Buffer.byteLength(body) <= 1024, `${file.pathname}: inline theme script is over 1 KB`);
      assert.equal(sha256(body), workerHashes[0], `${file.pathname}: its inline script is not the one the CSP allows`);
      assert.match(body, /localStorage/, `${file.pathname}: the inline script is the theme script`);
    }
    assert.match(
      readFileSync(new URL("_headers", dist), "utf8"),
      new RegExp(`'${workerHashes[0]}'`.replace(/[+/]/g, "\\$&")),
    );
  },
);

// W-11: rule 2 is "zero third-party REQUESTS". An ordinary outbound hyperlink (<a href>, which the guide's own Markdown
// examples use) loads nothing, so it is allowed; anything the browser fetches, connects to or posts to is not. Exported
// shape: a list of what the page would load from a host other than philglov.es.
const OWN_HOST = "philglov.es";
// <link rel> values that are only metadata or navigation hints: the browser fetches nothing for them.
const NON_LOADING_LINK = new Set([
  "canonical",
  "alternate",
  "author",
  "me",
  "license",
  "next",
  "prev",
  "bookmark",
  "help",
]);
function thirdPartyLoads(html: string): string[] {
  const found: string[] = [];
  const bare = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, "<script$1></script>");
  for (const [, tag = "", attrs = ""] of bare.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const name = tag.toLowerCase();
    const attr = (key: string) => new RegExp(`\\s${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
    const urls: string[] = [];
    for (const key of ["src", "data", "poster"]) urls.push(attr(key)?.[1] ?? attr(key)?.[2] ?? "");
    for (const part of (attr("srcset")?.[1] ?? "").split(",")) urls.push(part.trim().split(/\s+/)[0] ?? "");
    if (name === "form") urls.push(attr("action")?.[1] ?? "");
    if (name === "link") {
      const rels = (attr("rel")?.[1] ?? "").toLowerCase().split(/\s+/);
      if (!rels.every((rel) => NON_LOADING_LINK.has(rel))) urls.push(attr("href")?.[1] ?? "");
    }
    for (const url of urls) {
      if (!url) continue;
      let host = OWN_HOST;
      try {
        host = new URL(url, `https://${OWN_HOST}/`).hostname;
      } catch {
        found.push(`<${name}> with an unreadable URL ${url}`);
        continue;
      }
      if (host !== OWN_HOST) found.push(`<${name}> loads ${url}`);
    }
  }
  return found;
}

test("a link out is allowed; anything the browser would load, connect to or post to elsewhere is not (W-11)", () => {
  const page = (body: string) => `<html><head></head><body>${body}</body></html>`;
  // Allowed: an ordinary outbound link, in an entry's text, and the metadata links that fetch nothing.
  assert.deepEqual(thirdPartyLoads(page('<p>See <a href="https://example.org/a?b=1">this</a>.</p>')), []);
  assert.deepEqual(thirdPartyLoads(page('<a href="//example.org/">protocol-relative link</a>')), []);
  assert.deepEqual(
    thirdPartyLoads(page('<img src="/_assets/a.avif" srcset="/_assets/a.webp 1x, /_assets/b.webp 2x">')),
    [],
  );
  assert.deepEqual(
    thirdPartyLoads(
      '<link rel="canonical" href="https://philglov.es/x"><link rel="alternate" hreflang="it" href="https://philglov.es/it/x">',
    ),
    [],
  );
  assert.deepEqual(
    thirdPartyLoads('<link rel="alternate" type="application/rss+xml" href="https://example.org/feed">'),
    [],
  );
  // Not allowed: each way a page can make the browser talk to another host.
  for (const [what, html] of [
    ["an image", '<img src="https://example.org/a.png">'],
    ["a srcset", '<img srcset="/a.webp 1x, https://example.org/b.webp 2x">'],
    ["a script", '<script src="https://example.org/a.js"></script>'],
    ["a stylesheet", '<link rel="stylesheet" href="https://example.org/a.css">'],
    ["a preconnect", '<link rel="preconnect" href="https://fonts.example.org">'],
    ["a preload", '<link rel="preload" as="font" href="https://example.org/a.woff2">'],
    ["a protocol-relative image", '<img src="//example.org/a.png">'],
    ["an iframe", '<iframe src="https://example.org/"></iframe>'],
    ["a form post", '<form action="https://example.org/post" method="post"></form>'],
    ["a video poster", '<video poster="https://example.org/p.jpg"></video>'],
  ] as const)
    assert.equal(thirdPartyLoads(page(html)).length > 0, true, `${what} is found`);
});

test("no page has a style attribute, loads anything from another host, or has an arrow glyph", { skip }, () => {
  for (const file of htmlFiles()) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /\sstyle=/, `${file.pathname}: inline style`);
    assert.deepEqual(thirdPartyLoads(html), [], `${file.pathname}: third-party request`);
    assert.doesNotMatch(html, /[→←↩↗↑↓]/, `${file.pathname}: arrow glyph (the font has none; use <Arrow>)`);
  }
});

// W-04: "HTML ≤ 30 KB compressed" on every built page. Measured as gzip level 9 (Cloudflare sends Brotli, which is
// smaller, so this is the stricter reading). The largest page today is the style guide at about 10 KB.
test("every built page is at most 30 KB compressed", { skip }, () => {
  const big: string[] = [];
  let largest = 0;
  for (const file of htmlFiles()) {
    const size = gzipSync(readFileSync(file), { level: 9 }).length;
    largest = Math.max(largest, size);
    if (size > 30 * 1024) big.push(`${file.pathname}: ${size} bytes`);
  }
  assert.ok(largest > 1000, "pages were measured");
  assert.deepEqual(big, []);
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
    const assets = filesUnder(new URL("_assets/", dist), /\.js$/).map(
      (f) => `/${f.pathname.slice(f.pathname.indexOf("_assets/"))}`,
    );
    assert.deepEqual(assets.sort(), [...files].sort());
    assert.equal(files.size, 1, [...files].join(", "));
  },
);

// W-02: this only measured the files that happen to exist, so a missing entry image passed. The required set comes from
// the content folders now: default.png plus <lang>-<slug>.png for every entry file, and nothing else.
test("share images are 1200×630 PNGs, one default and one per entry version", { skip }, () => {
  const dir = new URL("_assets/share/", dist);
  const files = readdirSync(dir);
  const journal = fixtureJournal;
  const expected = ["default.png"];
  for (const lang of ["en", "it"])
    for (const file of readdirSync(new URL(`${lang}/`, journal)).filter((f) => f.endsWith(".md")))
      expected.push(`${lang}-${file.replace(/\.md$/, "")}.png`);
  assert.ok(expected.length >= 7, `entries were found (${expected.join(", ")})`);
  assert.deepEqual([...files].sort(), expected.sort(), "one share image per entry version, and no other");
  // Each entry page points at its own image, not at the default.
  for (const lang of ["en", "it"])
    for (const file of readdirSync(new URL(`${lang}/`, journal)).filter((f) => f.endsWith(".md"))) {
      const slug = file.replace(/\.md$/, "");
      const html = readFileSync(new URL(lang === "en" ? `${slug}.html` : `it/${slug}.html`, dist), "utf8");
      assert.match(
        html,
        new RegExp(`<meta property="og:image" content="https://philglov\\.es/_assets/share/${lang}-${slug}\\.png">`),
        `${lang}/${slug}: og:image`,
      );
    }
  assert.ok(files.includes("default.png"));
  for (const name of files) {
    const png = readFileSync(new URL(name, dir));
    assert.equal(png.toString("ascii", 1, 4), "PNG", name);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], name);
  }
  assert.equal(existsSync(new URL("share-manifest.json", dist)), false, "the manifest must not be served");
});

test(
  "dist/_headers: assets carry noai, noimageai (and noindex outside production); all carry tdm-reservation",
  { skip },
  () => {
    const headers = readFileSync(new URL("_headers", dist), "utf8");
    // Built for production when the "/*" rule has no noindex (SITE_ENV=production, only at launch).
    const production = !/^\/\*\n(?: {2}.*\n)*? {2}X-Robots-Tag: noindex\n/m.test(headers);
    assert.match(
      headers,
      production
        ? /\/_assets\/\*\n {2}X-Robots-Tag: noai, noimageai\n/
        : /\/_assets\/\*\n {2}! X-Robots-Tag\n {2}X-Robots-Tag: noindex, noai, noimageai\n/,
    );
    assert.match(headers, /tdm-reservation: 1/);
    assert.match(headers, /script-src 'self' 'sha256-/);
  },
);

// SO-10 (fixed in fix round 2): "1 file, ≤ 20 KB compressed" is a budget on the number of stylesheets too. The generated
// photo colours (src/styles/photo-colours.generated.css) used to come out as a second file; they are bundled now.
test("every public page links exactly one stylesheet, and the whole site has one", { skip }, () => {
  for (const file of htmlFiles()) {
    const links = [...readFileSync(file, "utf8").matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)];
    assert.equal(links.length, 1, `${file.pathname}: ${links.length} stylesheet links`);
  }
  const css = readdirSync(new URL("_assets/", dist)).filter((f) => f.endsWith(".css"));
  assert.equal(css.length, 1, `stylesheets in dist/_assets: ${css.join(", ")}`);
});
