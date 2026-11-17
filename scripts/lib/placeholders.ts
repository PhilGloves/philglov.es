/**
 * Unfilled placeholders: the bracketed text the owner still has to replace or delete before launch (O1, TICKETS.md).
 * The launch gate (`tests/e2e/qa/launch.spec.ts`, `pnpm test:launch`) fails on every one it finds, naming the page and
 * the text. Decision 0022, "Round 4".
 *
 * Two kinds of bracket count, read from the built HTML (visible text, `title`, `description`, `alt` and `aria-label`):
 *
 * 1. **Sample text** (the owner's ruling: it must fail until it is replaced or deleted): a bracket that starts with
 *    `placeholder` or `segnaposto`, or with one of the sample forms `testo segnaposto`, `testo alternativo segnaposto`,
 *    `serie segnaposto` (`[Placeholder]`, `[Placeholder alt text: …]`, `[placeholder series]`, `[Testo alternativo
 *    segnaposto: …]`, `[serie segnaposto]`). On **every** built page: the sample entries, the sample photo series and
 *    their listings included.
 * 2. **A field name**: a bracket whose whole text is one of `FIELD_NAMES` (`[city]`, `[launch date]`, `[your contact
 *    email]`, `[la tua email di contatto]` …). Only on the pages of `src/content/pages` (About, Now, Privacy, Rights,
 *    both languages; what `src/data/site.json` puts on About is on them) and the home pages, whose "Based in …" line
 *    carries the same city. Never in an entry, a photo series or a listing: a `[sic]` or a quoted `[city]` there is
 *    text.
 *
 * `<script>`, `<style>`, `<code>` and `<pre>` are left out first (CSS selectors, JSON-LD arrays, a bracket shown on
 * purpose). The About portrait's label (`[Portrait … placeholder until …]`) and the `[ photo ]` frame are not counted:
 * the portrait has its own failing test (TO-03). A new kind of gap goes into this file with a test, never into a looser
 * pattern. The owner never edits it.
 */
import { existsSync, readdirSync } from "node:fs";

/** Whole-bracket field names, lower case, both languages. Matching ignores case, spacing and line breaks. */
export const FIELD_NAMES: readonly string[] = [
  "city",
  "città",
  "launch date",
  "data di lancio",
  "contact email",
  "your contact email",
  "la tua email di contatto",
];

const SAMPLE = /\[\s*(?:(?:testo(?:\s+alternativo)?|serie)\s+)?(?:placeholder|segnaposto)\b[^\]]*\]/gi;
const BRACKET = /\[([^\]]*)\]/g;
const NOT_TEXT = /<(script|style|pre|code)\b[\s\S]*?<\/\1\s*>/gi;

/**
 * The placeholders in one built page, as written, in order of appearance, each once. Sample text always counts;
 * `fields: false` leaves the field names out (entries, photo series, listings).
 */
export function findPlaceholders(page: string, { fields = true }: { fields?: boolean } = {}): string[] {
  const text = page.replace(NOT_TEXT, " ");
  const found = new Set<string>();
  for (const m of text.matchAll(SAMPLE)) found.add(m[0]);
  if (fields)
    for (const m of text.matchAll(BRACKET)) {
      if (FIELD_NAMES.includes((m[1] ?? "").replace(/\s+/g, " ").trim().toLowerCase())) found.add(m[0]);
    }
  return [...found].sort((a, b) => text.indexOf(a) - text.indexOf(b));
}

/**
 * The built files where field names count: one per file in `src/content/pages/<lang>` (a page added there is covered at
 * once) and the two home pages. Every other page is read for sample text only.
 */
export function fieldPages(pagesDir: URL): string[] {
  const out: string[] = [];
  for (const lang of ["en", "it"]) {
    const dir = new URL(`${lang}/`, pagesDir);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith(".md")) out.push(`${lang === "it" ? "it/" : ""}${f.slice(0, -3)}.html`);
    }
  }
  return [...out, "index.html", "it.html"];
}
