import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { FIELD_NAMES, findPlaceholders, gapPages } from "../../scripts/lib/placeholders.ts";

// The launch gate's check for the site's own gaps (tests/e2e/qa/launch.spec.ts, decision 0022 "Round 4").

const pagesDir = new URL("../../src/content/pages/", import.meta.url);
const journalDir = new URL("../../src/content/journal/", import.meta.url);

test("the gate reads the pages of src/content/pages and the home pages, and nothing else", () => {
  const files = gapPages(pagesDir).map((p) => p.file);
  assert.deepEqual(files, [
    "about.html",
    "now.html",
    "privacy.html",
    "rights.html",
    "it/about.html",
    "it/now.html",
    "it/privacy.html",
    "it/rights.html",
    "index.html",
    "it.html",
  ]);
  // Every page of the collection is in it (a new one is covered at once); the home pages take the field names only.
  for (const lang of ["en", "it"])
    for (const f of readdirSync(new URL(`${lang}/`, pagesDir)).filter((x) => x.endsWith(".md")))
      assert.ok(files.includes(`${lang === "it" ? "it/" : ""}${f.replace(/\.md$/, ".html")}`), f);
  assert.deepEqual(
    gapPages(pagesDir)
      .filter((p) => !p.markers)
      .map((p) => p.file),
    ["index.html", "it.html"],
  );
});

test("no journal entry is among the pages the gate reads, in either language", () => {
  const files = new Set(gapPages(pagesDir).map((p) => p.file));
  for (const lang of ["en", "it"])
    for (const f of readdirSync(new URL(`${lang}/`, journalDir)).filter((x) => x.endsWith(".md"))) {
      const built = `${lang === "it" ? "it/" : ""}${f.replace(/\.md$/, ".html")}`;
      assert.ok(!files.has(built), `${built} is an entry`);
    }
  for (const listing of ["journal.html", "it/journal.html", "photos.html", "it/photos.html", "feed.xml", "404.html"])
    assert.ok(!files.has(listing), listing);
});

test("every gap the pages and site.json carry is found, in either language and spacing", () => {
  const cases = [
    "Last updated: [launch date]",
    "Ultimo aggiornamento: [data di lancio]",
    "Filippo Guanti, [city], Italy - [your contact email].",
    "Filippo Guanti, [città], Italia - [la tua email di contatto].",
    "<li>[contact email]</li><li>[city]</li>",
    "<p>Based in [City]. Writing</p>",
    "<p>Vivo a [CITTÀ]. Scrivo</p>",
    "[ La tua email di contatto ]",
    '<meta name="description" content="[Segnaposto: due o tre frasi]">',
    "<title>[Placeholder]</title>",
    "<p>[Placeholder: where I am, what I am making.]</p>",
  ];
  for (const c of cases) assert.ok(findPlaceholders(c).length >= 1, c);
  assert.deepEqual(findPlaceholders("<p>[city] and [launch date], [city]</p>"), ["[city]", "[launch date]"]);
  // A bracket split over two lines by the page's own wrapping is still the field name.
  assert.deepEqual(findPlaceholders("<p>[la tua\nemail di contatto]</p>"), ["[la tua\nemail di contatto]"]);
});

test("the home pages take the field names only: an entry's title or a photo's alt text there is not a gap", () => {
  const home = "<p>Based in [City].</p><a>[Placeholder]</a><img alt='[Placeholder alt text: a tram]'>[ photo ]";
  assert.deepEqual(findPlaceholders(home, { markers: false }), ["[City]"]);
  assert.deepEqual(findPlaceholders("<a>[Segnaposto]</a> [serie segnaposto]", { markers: false }), []);
});

test("brackets that are not gaps are left alone", () => {
  const fine = [
    "<p>[photography] and [travel]</p>",
    "<p>The city centre [sic] was empty; see [1] and [city centre].</p>",
    '<a href="/x">[Pinzette]</a>',
    "<p>[photographs of the city]</p>",
    "<p>[città nuova] [placeholders are useful]</p>",
    // What the owner writes in an entry or states in the portrait's label is not a sample-text marker.
    "<p>Tests use [Testo segnaposto in italiano] and [a placeholder] sometimes.</p>",
    '<div aria-label="[Portrait of Filippo Guanti: placeholder until the photograph is added]">[ photo ]</div>',
    '<style>[data-theme="dark"] .a{}</style><script>var a=["city"]; document.querySelector("[data-theme-toggle]")</script>',
    '<script type="application/ld+json">{"alternateName":["Phil Guanti","philglov"],"x":["placeholder","city"]}</script>',
    "<p>Type <code>[city]</code> or <pre>[your contact email]</pre> in the template.</p>",
    "<p>an empty [] and a [ ] pair</p>",
  ];
  for (const f of fine) assert.deepEqual(findPlaceholders(f), [], f);
});

test("a page with every gap filled passes", () => {
  const filled =
    '<title>About</title><meta name="description" content="Two sentences."><p>Filippo Guanti, Bologna, Italy - ' +
    '<a href="mailto:a@b.it">a@b.it</a>. Last updated: 1 December 2026.</p><p>Based in Bologna.</p>';
  assert.deepEqual(findPlaceholders(filled), []);
  assert.deepEqual(findPlaceholders(filled, { markers: false }), []);
});

test("the field names are lower case and trimmed, so the match ignores case and spacing", () => {
  for (const n of FIELD_NAMES) assert.equal(n, n.replace(/\s+/g, " ").trim().toLowerCase());
});

const dist = new URL("../../dist/", import.meta.url);
const built = existsSync(new URL("index.html", dist));

/**
 * The gaps the pages, site.json and the home line carry today (decision 0022, "Round 4"). Over the build, a gap outside
 * this list fails the test: a new kind of gap needs a line here and a reason. A subset check, so the test keeps passing
 * as the owner fills them.
 */
const KNOWN = [
  // pages/{en,it}/privacy.md, rights.md
  "[launch date]",
  "[city]",
  "[your contact email]",
  "[data di lancio]",
  "[città]",
  "[la tua email di contatto]",
  // site.json contactEmail and city, shown on About
  "[contact email]",
  // i18n heroBased on the home pages
  "[City]",
];
const KNOWN_MARKER = /^\[(Placeholder|Segnaposto)(:[^\]]*)?\]$/;

test(
  "over the current build, only the known gaps are found, none of them in an entry",
  { skip: built ? false : "run `pnpm build` first" },
  () => {
    const outside: string[] = [];
    for (const p of gapPages(pagesDir)) {
      for (const text of findPlaceholders(readFileSync(new URL(p.file, dist), "utf8"), { markers: p.markers })) {
        if (!KNOWN.includes(text) && !KNOWN_MARKER.test(text)) outside.push(`${p.file}: ${text}`);
      }
    }
    assert.deepEqual(outside, []);
  },
);
