/**
 * Unfilled placeholders: the bracketed gaps the owner still has to fill before launch (O1, TICKETS.md). The launch
 * gate (`tests/e2e/qa/launch.spec.ts`, `pnpm test:launch`) fails on every one it finds in a built page, naming the page
 * and the text. Decision 0022, "Round 4".
 *
 * Two kinds of bracket count, both read from the built HTML (visible text, `title`, `description`, `alt` and
 * `aria-label` alike), never from the sources, so what is checked is what a visitor gets:
 *
 * 1. A bracket that says it is a placeholder: the word `placeholder` or `segnaposto` anywhere inside it
 *    (`[Placeholder]`, `[Testo segnaposto in italiano: …]`, `[Portrait …: placeholder until …]`, `[serie segnaposto]`).
 * 2. A bracket that is only a field name, from the fixed list below (`[city]`, `[launch date]`, `[your contact email]`,
 *    `[la tua email di contatto]`, `[ photo ]` …). Whole bracket only, so `[city centre]` or `[photography]` are text.
 *
 * Markup that is not text is left out first: `<script>` and `<style>` (a CSS `[data-theme]` selector, the JSON-LD
 * arrays), `<code>` and `<pre>` (an entry may show a bracket on purpose). Markdown link text and footnotes are not
 * brackets in the built page at all. A new kind of placeholder goes into `FIELD_NAMES` (with a test), never into a
 * page. The owner never edits this file.
 */

/** Whole-bracket field names, lower case, both languages. Matching ignores case and the spaces around the text. */
export const FIELD_NAMES: readonly string[] = [
  // Privacy and rights pages, site.json, the home page's "Based in …" line.
  "city",
  "città",
  "launch date",
  "data di lancio",
  "contact email",
  "your contact email",
  "la tua email di contatto",
  // The frame the site draws where a photograph's original is missing (Photo.astro).
  "photo",
];

const SAYS_PLACEHOLDER = /\[[^\]]*\b(?:placeholder|segnaposto)\b[^\]]*\]/gi;
const BRACKET = /\[([^\]]*)\]/g;
const NOT_TEXT = /<(script|style|pre|code)\b[\s\S]*?<\/\1\s*>/gi;

/** The placeholders in one built page (or text file), as written, in order of appearance, each once. */
export function findPlaceholders(page: string): string[] {
  const text = page.replace(NOT_TEXT, " ");
  const found = new Set<string>();
  for (const m of text.matchAll(SAYS_PLACEHOLDER)) found.add(m[0]);
  for (const m of text.matchAll(BRACKET)) {
    if (FIELD_NAMES.includes((m[1] ?? "").replace(/\s+/g, " ").trim().toLowerCase())) found.add(m[0]);
  }
  return [...found].sort((a, b) => text.indexOf(a) - text.indexOf(b));
}
