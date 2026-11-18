# 0032 - Owner text changes: no job title, a new home title, no long dashes

Status: Accepted · 2026-11-18 · Owner decision · Amends [0025](0025-one-page-head.md) (`heroKick`, `jobTitle`) and the
guide's SEO checklist (`jobTitle`) and its published texts (the dash character only)

## Decisions

1. **No job title.** `jobTitle` is gone from `src/data/site.json` and from the Person JSON-LD on Home and About, in both
   languages, with nothing in its place. The guide's SEO checklist lists `jobTitle`; the owner's decision replaces that
   item. With no per-language field left, the Person data is the same in both languages, so `personJsonLd()` no longer
   takes a locale. `tests/unit/seo.test.ts` asserts there is no `jobTitle`.
2. **Home page title** (browser tab, search results): "Filippo Guanti - just me" in English, "Filippo Guanti - solo io"
   in Italian (`homeTitle`). The hidden part of the home heading (`heroKick`, the `.sr-only` span inside the `h1`) is
   "Filippo Guanti" in both languages.
3. **No long dashes anywhere on the site.** Every en dash and em dash in text a visitor or the owner can see is a plain
   hyphen: " - " between words, "300-400" in ranges. Only the character changed; nothing was reworded in either
   language. That covers the string files (which also feed the Worker's pages and emails), the pages in
   `src/content/pages`, components and the styleguide, feeds, robots.txt, share images, structured data, and the
   comments the build writes into its output. Arrows and "·" stay.
   - The texts the guide asks to publish unchanged (robots.txt, Rights, Privacy) differ from the guide by this
     character only. The robots.txt test compares with the guide's block with its dashes turned into hyphens.
   - `tests/unit/no-long-dashes.test.ts` reads every text file under `src`, `worker/src`, `scripts` and `public` and
     fails on either dash, as a character, an HTML entity or a JavaScript/CSS escape. Code comments are included so
     the rule needs no judgement about what reaches a page.
   - Not checked: the owner's own writing, that is journal entries (`src/content/journal`) and photo series
     (`src/content/photos`: captions and alt text), the docs, and the tests.
