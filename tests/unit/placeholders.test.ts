import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { FIELD_NAMES, findPlaceholders } from "../../scripts/lib/placeholders.ts";

// The launch gate's placeholder check (tests/e2e/qa/launch.spec.ts, decision 0022 "Round 4").

/** The text the old pattern, /\[(placeholder|segnaposto)[^\]]*\]/i, already caught. */
const OLD = /\[(placeholder|segnaposto)[^\]]*\]/i;

/**
 * Italian placeholders with the word in the middle: the old pattern needed it first, so it also missed these (the
 * lisbona entry's body, the photo series' alt texts and name).
 */
const MIDDLE = /^\[(Testo\s+segnaposto\s+in\s+italiano|Testo\s+alternativo\s+segnaposto|serie\s+segnaposto)\b/;

/**
 * What the old pattern let through (the 2026-11-17 review of PR #35), as it stands in the built pages. A test over the
 * build below fails if the check flags anything outside this list and the old pattern's matches. The list may only
 * shrink as the owner fills the gaps, never grow without a decision.
 */
const NEWLY_CAUGHT = [
  // src/content/pages/en/privacy.md, it/privacy.md, en/rights.md, it/rights.md
  "[launch date]",
  "[city]",
  "[your contact email]",
  "[data di lancio]",
  "[città]",
  "[la tua email di contatto]",
  // src/data/site.json (About page): contactEmail and city
  "[contact email]",
  // src/i18n/{en,it}.json heroBased (the home page's "Based in …" line)
  "[City]",
  // src/views/PageView.astro: the portrait's label says "placeholder" mid-bracket
  "[Portrait of Filippo Guanti: placeholder until the photograph is added]",
  // src/components/Photo.astro: the frame drawn where an original is missing
  "[ photo ]",
];

test("every placeholder of the 2026-11-17 review is found, whichever language or spacing", () => {
  const cases = [
    "Last updated: [launch date]",
    "Ultimo aggiornamento: [data di lancio]",
    "Filippo Guanti, [city], Italy — [your contact email].",
    "Filippo Guanti, [città], Italia — [la tua email di contatto].",
    "<li>[contact email]</li><li>[city]</li>",
    "<p>Based in [City]. Writing</p>",
    "<p>Vivo a [CITTÀ]. Scrivo</p>",
    '<span aria-hidden="true">[ photo ]</span>',
    '<meta name="description" content="[Segnaposto: due o tre frasi]">',
    "<title>[Placeholder]</title>",
    'aria-label="[Testo alternativo segnaposto: un tram giallo]"',
    '<div aria-label="[Portrait of Filippo Guanti: placeholder until the photograph is added]">',
    "[ La tua email di contatto ]",
  ];
  for (const c of cases) assert.ok(findPlaceholders(c).length >= 1, c);
  assert.deepEqual(findPlaceholders("<p>[city] and [launch date], [city]</p>"), ["[city]", "[launch date]"]);
});

test("brackets that are not placeholders are left alone", () => {
  const fine = [
    "<p>[photography] and [travel]</p>",
    "<p>The city centre [sic] was empty; see [1] and [city centre].</p>",
    '<a href="/x">[Pinzette]</a>',
    "<p>[photographs of the city]</p>",
    "<p>cittàs [città nuova]</p>",
    '<style>[data-theme="dark"] .a{}</style><script>var a=["city"]; document.querySelector("[data-theme-toggle]")</script>',
    '<script type="application/ld+json">{"alternateName":["Phil Guanti","philglov"],"x":["placeholder","city"]}</script>',
    "<p>Type <code>[city]</code> or <pre>[your contact email]</pre> in the template.</p>",
    "<p>an empty [] and a [ ] pair</p>",
  ];
  for (const f of fine) assert.deepEqual(findPlaceholders(f), [], f);
});

test("the field names are lower case and trimmed, so the match ignores case and spacing", () => {
  for (const n of FIELD_NAMES) assert.equal(n, n.trim().toLowerCase());
});

const dist = new URL("../../dist/", import.meta.url);
const built = existsSync(new URL("index.html", dist));

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

test(
  "over the current build, the check flags the old pattern's matches, the review's list and the Italian mid-word ones, and nothing else",
  { skip: built ? false : "run `pnpm build` first" },
  () => {
    const outside: string[] = [];
    for (const file of htmlFiles(dist)) {
      if (file === "styleguide.html") continue;
      for (const text of findPlaceholders(readFileSync(new URL(file, dist), "utf8"))) {
        if (!OLD.test(text) && !MIDDLE.test(text) && !NEWLY_CAUGHT.includes(text)) outside.push(`${file}: ${text}`);
      }
    }
    // Subset, not equality: the list only shrinks as the owner fills the gaps, and this test must keep passing then.
    assert.deepEqual(outside, []);
  },
);
