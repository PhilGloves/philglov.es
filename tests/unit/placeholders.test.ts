import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { FIELD_NAMES, fieldPages, findPlaceholders } from "../../scripts/lib/placeholders.ts";

// The launch gate's placeholder check (tests/e2e/qa/launch.spec.ts, decision 0022 "Round 4").

const pagesDir = new URL("../../src/content/pages/", import.meta.url);
const content = new URL("../../src/content/", import.meta.url);

test("field names count on the pages of src/content/pages and the home pages, and nowhere else", () => {
  assert.deepEqual(fieldPages(pagesDir), [
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
  // Every page of the collection is in it, so a new one is covered at once; no entry is.
  const files = fieldPages(pagesDir);
  for (const lang of ["en", "it"]) {
    for (const f of readdirSync(new URL(`pages/${lang}/`, content)).filter((x) => x.endsWith(".md")))
      assert.ok(files.includes(`${lang === "it" ? "it/" : ""}${f.replace(/\.md$/, ".html")}`), f);
    for (const f of readdirSync(new URL(`journal/${lang}/`, content)).filter((x) => x.endsWith(".md")))
      assert.ok(!files.includes(`${lang === "it" ? "it/" : ""}${f.replace(/\.md$/, ".html")}`), `${f} is an entry`);
  }
});

test("sample text is found on any page: entries, photo series, listings, alt text and titles", () => {
  const cases = [
    "<title>[Placeholder]</title>",
    "<h1>[Segnaposto]</h1>",
    "<p>[Placeholder: where I am, what I am making.]</p>",
    "<p>[Placeholder text in English. This entry exists in English only.]</p>",
    "<p>[Testo segnaposto in italiano: da sostituire con la voce vera.]</p>",
    '<img alt="[Placeholder alt text: a yellow tram climbing a steep street]">',
    '<img alt="[Testo alternativo segnaposto: un tram giallo che sale una strada ripida]">',
    '<a aria-label="[placeholder series]">[placeholder series]</a>',
    "<p>[serie segnaposto]</p>",
    '<meta name="description" content="[Segnaposto: due o tre frasi]">',
    "<p>[ PLACEHOLDER ]</p>",
    "<p>[Testo alternativo segnaposto: x]</p>",
  ];
  for (const c of cases) {
    assert.equal(findPlaceholders(c, { fields: false }).length, 1, c);
    assert.equal(findPlaceholders(c).length, 1, c);
  }
  assert.deepEqual(findPlaceholders("<p>[Placeholder] and [serie segnaposto], [Placeholder]</p>", { fields: false }), [
    "[Placeholder]",
    "[serie segnaposto]",
  ]);
});

test("field names are found with fields on, in either language and spacing, and ignored with fields off", () => {
  const cases = [
    "Last updated: [launch date]",
    "Ultimo aggiornamento: [data di lancio]",
    "Filippo Guanti, [city], Italy — [your contact email].",
    "Filippo Guanti, [città], Italia — [la tua email di contatto].",
    "<li>[contact email]</li><li>[city]</li>",
    "<p>Based in [City]. Writing</p>",
    "<p>Vivo a [CITTÀ]. Scrivo</p>",
    "[ La tua email di contatto ]",
  ];
  for (const c of cases) {
    assert.ok(findPlaceholders(c).length >= 1, c);
    assert.deepEqual(findPlaceholders(c, { fields: false }), [], c);
  }
  assert.deepEqual(findPlaceholders("<p>[city] and [launch date], [city]</p>"), ["[city]", "[launch date]"]);
  // A bracket split over two lines by the page's own wrapping is still the field name.
  assert.deepEqual(findPlaceholders("<p>[la tua\nemail di contatto]</p>"), ["[la tua\nemail di contatto]"]);
  // An owner's entry: a quoted field name and a [sic] pass.
  const entry = "<p>The sign said [city] in the old font, and the city centre [sic] was empty.</p>";
  assert.deepEqual(findPlaceholders(entry, { fields: false }), []);
});

test("brackets that are not placeholders are left alone", () => {
  const fine = [
    "<p>[photography] and [travel]</p>",
    "<p>The city centre [sic] was empty; see [1] and [city centre].</p>",
    '<a href="/x">[Pinzette]</a>',
    "<p>[photographs of the city]</p>",
    "<p>[città nuova] [placeholders are useful] [a placeholder]</p>",
    // Not sample text: the About portrait's label and the frame drawn where an original is missing (the portrait has its
    // own failing test).
    '<div aria-label="[Portrait of Filippo Guanti: placeholder until the photograph is added]">[ photo ]</div>',
    '<style>[data-theme="dark"] .a{}</style><script>var a=["city"]; document.querySelector("[data-theme-toggle]")</script>',
    '<script type="application/ld+json">{"alternateName":["Phil Guanti","philglov"],"x":["[Placeholder]","city"]}</script>',
    "<p>Type <code>[city]</code> or <pre>[Placeholder]</pre> in the template.</p>",
    "<p>an empty [] and a [ ] pair</p>",
  ];
  for (const f of fine) assert.deepEqual(findPlaceholders(f), [], f);
});

test("a page with every gap filled and no sample text passes", () => {
  const filled =
    '<title>About</title><meta name="description" content="Two sentences."><p>Filippo Guanti, Bologna, Italy — ' +
    '<a href="mailto:a@b.it">a@b.it</a>. Last updated: 1 December 2026.</p><p>Based in Bologna.</p>';
  assert.deepEqual(findPlaceholders(filled), []);
  assert.deepEqual(findPlaceholders(filled, { fields: false }), []);
});

test("the field names are lower case and trimmed, so the match ignores case and spacing", () => {
  for (const n of FIELD_NAMES) assert.equal(n, n.replace(/\s+/g, " ").trim().toLowerCase());
});

const dist = new URL("../../dist/", import.meta.url);
const built = existsSync(new URL("index.html", dist));
const skip = built ? false : "run `pnpm build` first";

function htmlFiles(dir: URL, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? e.name === "_assets"
        ? []
        : htmlFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)
      : e.name.endsWith(".html")
        ? [`${prefix}${e.name}`]
        : [],
  );
}

/** What a source file spells as sample text, the same sample forms as the check (read from the source, not the build). */
const SAMPLE_IN_SOURCE = /\[\s*(?:(?:testo(?:\s+alternativo)?|serie)\s+)?(?:placeholder|segnaposto)\b/i;

test("over the current build, every sample entry and sample photo series is flagged", { skip }, () => {
  const expected: string[] = [];
  for (const lang of ["en", "it"]) {
    const prefix = lang === "it" ? "it/" : "";
    for (const f of readdirSync(new URL(`journal/${lang}/`, content)).filter((x) => x.endsWith(".md")))
      if (SAMPLE_IN_SOURCE.test(readFileSync(new URL(`journal/${lang}/${f}`, content), "utf8")))
        expected.push(`${prefix}${f.replace(/\.md$/, ".html")}`);
  }
  for (const series of readdirSync(new URL("photos/", content), { withFileTypes: true }).filter((e) => e.isDirectory()))
    if (SAMPLE_IN_SOURCE.test(readFileSync(new URL(`photos/${series.name}/photos.json`, content), "utf8")))
      expected.push(`photos/${series.name}.html`, `it/photos/${series.name}.html`);
  const fields = new Set(fieldPages(pagesDir));
  const missed = expected.filter(
    (file) => findPlaceholders(readFileSync(new URL(file, dist), "utf8"), { fields: fields.has(file) }).length === 0,
  );
  assert.deepEqual(missed, []);
});

/**
 * The field names the pages, site.json and the home line carry today (decision 0022, "Round 4"). Over the build, a field
 * name outside this list on those pages fails the test: a new kind of gap needs a line here and a reason. A subset check,
 * so the test keeps passing as the owner fills them.
 */
const KNOWN_FIELDS = [
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

test("over the current build, only known field names are found, and only on the pages and home", { skip }, () => {
  const fields = new Set(fieldPages(pagesDir));
  const outside: string[] = [];
  for (const file of htmlFiles(dist)) {
    if (file === "styleguide.html") continue;
    const html = readFileSync(new URL(file, dist), "utf8");
    const sample = new Set(findPlaceholders(html, { fields: false }));
    for (const text of findPlaceholders(html, { fields: fields.has(file) })) {
      if (!sample.has(text) && !KNOWN_FIELDS.includes(text)) outside.push(`${file}: ${text}`);
    }
  }
  assert.deepEqual(outside, []);
});
