# 0037 - In journal entries, one Enter is a new line

Status: Accepted · 2026-11-22 · Owner request · Amends [0016](0016-frontend-pages.md) (how an entry's Markdown is
rendered) and [0017](0017-backend-worker.md) (B8, `/admin/write`)

**Context.** The owner writes entries on the phone and presses Enter once to start a new line. Markdown joins two
lines with no empty line between them into one, so the published entry ran every line of a paragraph together. The
first real entry, `src/content/journal/en/1st.md`, has ten such line breaks in three paragraphs, and showed none.

## Decisions

1. **In journal entries only, a single line break is a line break on the page** (`<br>`); an empty line still starts a
   new paragraph. Both languages. The standalone pages (About, Now, Rights, Privacy) keep Markdown's ordinary rule:
   they are not written on the phone, and their lists are written with one item per line.
2. **A small plugin in the repository, no new package** (`src/lib/entry-line-breaks.ts`, an Astro integration in
   `astro.config.ts`). Astro 7 renders Markdown with Sätteri, its default processor, which takes mdast plugins in
   its options; the integration adds one in `astro:config:setup`. It runs only for files in the journal folder of the
   content the build reads (`scripts/lib/content-root.ts`), so the test build and the empty site behave as the site
   does. In each text node, a line end becomes a `break` node. That leaves alone, by construction:
   - code blocks, code spans, raw HTML, a photo's alt text and caption, and the front matter: none is a text node;
   - headings: the plugin skips text inside one, so a title written over two lines stays a title;
   - a line already forced with two trailing spaces or a backslash: Sätteri has made it a `break` already;
   - lists, quotations and footnotes keep their structure; a second line inside one of them is a line break too.
     Trailing spaces before a line end are dropped, as Markdown does.
3. **Feeds, descriptions, link previews and structured data are unchanged**: they are built from the front matter
   (`title`, `description`), never from the rendered text. A test reads the built feeds, the sitemap, the home and
   journal pages and every entry's `<head>` for a stray tag.
4. **The build stops if the Markdown processor is not Sätteri.** Setting `markdown.processor` to another one would
   skip the plugin and lose the owner's lines without a word; the integration throws instead and says why.
5. **The write page says so where the text is typed.** Two lines under the text box, always shown, read with the
   text box by a screen reader (`aria-describedby`): "Enter: new line. Empty line: new paragraph." and
   "Link: [words](https://address)". The cheat sheet starts with the same two lines (it said "Blank line: new
   paragraph" and gave the link as `[words](https://example.com)`). English only, as the rest of `/admin`.
6. **The owner's entries are never edited for this.** `1st.md` is the real case, checked on the site's own build.

## Tests

- `tests/unit/entry-line-breaks.test.ts` renders Markdown exactly as `astro build` does: the repository's
  `astro.config.ts`, its integrations' setup hooks, then the configured processor's renderer. Line breaks, empty
  lines, Windows line ends, forced breaks, italics and links over a line break, lists, quotations, headings,
  footnotes, code, tables, HTML, photos; the standalone pages untouched; another processor refused; no package added.
  On the test build: the fixture entry `one-roll` (a paragraph typed one Enter per line, added to it) is built with
  its lines, and nothing outside an entry's text gains a `<br>`.
- `tests/site/typed-lines.spec.ts`, in `pnpm test:site` on the owner's build (both CI scopes, so a phone publish waits
  for it): every paragraph of an entry that is certainly plain typed lines (`tests/site/typed-lines.ts` leaves out
  anything it cannot be sure of: lists, quotations, headings, code, HTML, links with addresses, footnotes) is one
  paragraph on the page with the same lines. It names no entry; today it checks `1st.md`. It failed on the build
  before this change with the three paragraphs of `/1st`.
- `tests/worker/write.test.ts` and `tests/e2e/admin-write.spec.ts`: the two lines under the text box, on every form
  of the write page, before the closed cheat sheet, one line each on a 390 px phone, in the text box's description;
  the cheat sheet matches.

## Budgets

No public JavaScript, CSS or font changes. An entry's HTML grows by four bytes per line break.

## Rejected

- **A Sätteri setting** (`features`): it has none for soft line breaks.
- **`@astrojs/markdown-remark` with `remark-breaks`**: two packages for a few lines, and a second Markdown pipeline
  to keep equal to the default one (the footnotes fix in `scripts/lib/footnotes.ts` is written for Sätteri's output).
- **Rewriting the built HTML** (as the footnotes fix does): a `\n` in HTML can be inside `<pre>`, an attribute or a
  comment; the syntax tree knows which line ends are text.
- **Converting the line ends when the phone publishes** (two trailing spaces in the file): it would change the
  owner's text, miss entries written on the laptop, and Prettier and editors strip trailing spaces.
- **For every Markdown page**: the standalone pages are not typed on the phone; nothing asked for it.
