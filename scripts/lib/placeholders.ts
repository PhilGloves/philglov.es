/**
 * The site's own unfilled gaps: the bracketed text the owner still has to replace before launch (O1, TICKETS.md). The
 * launch gate (`tests/e2e/qa/launch.spec.ts`, `pnpm test:launch`) fails on every one it finds, naming the page and the
 * text. Decision 0022, "Round 4".
 *
 * **Scope.** Only what the site itself leaves open: the pages in `src/content/pages` (About, Now, Privacy, Rights, both
 * languages), what `src/data/site.json` puts on them (`contactEmail`, `city`), and the home page's "Based in …" line,
 * which carries the same city. Never a journal entry, a photo series or any listing of them: what the owner writes
 * there is text, and a bracket in it (`[sic]`, a quoted `[city]`) is never a gap.
 *
 * Two kinds of bracket count, read from the built HTML (visible text, `title`, `description`, `alt` and `aria-label`):
 *
 * 1. A sample-text marker: a bracket that starts with the word `placeholder` or `segnaposto` (`[Placeholder]`,
 *    `[Segnaposto: due o tre frasi …]`). Pages only.
 * 2. A field name: a bracket whose whole text is one of `FIELD_NAMES` (`[city]`, `[launch date]`, `[your contact
 *    email]`, `[la tua email di contatto]` …). Pages and the home page.
 *
 * `<script>`, `<style>`, `<code>` and `<pre>` are left out first (CSS selectors, JSON-LD arrays, a bracket shown on
 * purpose). A new kind of gap goes into this file with a test, never into a looser pattern. The owner never edits it.
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

const MARKER = /\[\s*(?:placeholder|segnaposto)\b[^\]]*\]/gi;
const BRACKET = /\[([^\]]*)\]/g;
const NOT_TEXT = /<(script|style|pre|code)\b[\s\S]*?<\/\1\s*>/gi;

/** The gaps in one built page, as written, in order of appearance, each once. `markers: false` looks for field names only. */
export function findPlaceholders(page: string, { markers = true }: { markers?: boolean } = {}): string[] {
  const text = page.replace(NOT_TEXT, " ");
  const found = new Set<string>();
  if (markers) for (const m of text.matchAll(MARKER)) found.add(m[0]);
  for (const m of text.matchAll(BRACKET)) {
    if (FIELD_NAMES.includes((m[1] ?? "").replace(/\s+/g, " ").trim().toLowerCase())) found.add(m[0]);
  }
  return [...found].sort((a, b) => text.indexOf(a) - text.indexOf(b));
}

export interface GapPage {
  /** Built file under dist/: "privacy.html", "it/about.html", "index.html". */
  file: string;
  /** Pages from `src/content/pages` also get the sample-text markers; the home page only the field names. */
  markers: boolean;
}

/**
 * The built pages the gate reads: one per file in `src/content/pages/<lang>` (a page added there is covered at once), and
 * the two home pages. Entries, the journal, photos, the 404 page and the styleguide are not in it.
 */
export function gapPages(pagesDir: URL): GapPage[] {
  const out: GapPage[] = [];
  for (const lang of ["en", "it"]) {
    const dir = new URL(`${lang}/`, pagesDir);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith(".md")) out.push({ file: `${lang === "it" ? "it/" : ""}${f.slice(0, -3)}.html`, markers: true });
    }
  }
  out.push({ file: "index.html", markers: false }, { file: "it.html", markers: false });
  return out;
}
