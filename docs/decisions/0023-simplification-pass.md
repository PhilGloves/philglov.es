# 0023 — Simplification pass: round header controls, entries that start with the text, no topics

Status: Accepted · 2026-11-15 · Owner decision · Header controls amended by [0024](0024-no-breadcrumbs-tighter-heads-ringless-controls.md) (no ring), Home by [0025](0025-one-page-head.md) (no role line) · Amends [0012](0012-hand-written-translations.md) (where the label
shows), [0014](0014-design-system.md) (header controls), [0016](0016-frontend-pages.md) (entry page, topic pages),
[0017](0017-backend-worker.md) and [0021](0021-publishing-goes-live.md) (`/admin/write` topics)

The owner replaced `docs/design/Home.dc.html` and `docs/design/Article.dc.html`; they are the spec for everything
below. Brief rule 5 (the label on every page) and the rest of the shared brief are changed only where stated.

## What changed

1. **Header controls.** Two matching round controls replace the word "Dark" and the word "Italiano".
   - Theme toggle: an icon button. A moon in light mode, a sun in dark mode. Both are inline SVG in the markup and the
     stylesheet shows one (`.theme-toggle .i-moon` / `.i-sun`, chosen by `data-theme` first and by
     `prefers-color-scheme` when the visitor has not chosen), so `src/scripts/theme.js` did not change and the public
     JavaScript is the same bytes (1,525 of 1,536). The accessible name is fixed ("Dark theme" / "Tema scuro") with
     `aria-pressed`, as before. Still hidden when scripting is off.
   - Language switch: "IT" on English pages, "EN" on Italian pages, the same round shape. `lang`, `hreflang` and the
     `href` are unchanged; the accessible name is the full language name ("Italiano" / "English", set with
     `aria-label`). On a page with no twin the name continues with the existing note that the link opens the other
     home page, so that note is still announced.
   - Size: 44 px on phones (container ≤ 40rem), 40 px from tablet up.
2. **Journal entries start with the text.** Under the title: no breadcrumb, no label line, no standfirst, no side
   column of details. The entry's `description` stays in the head (meta description, Open Graph, feed) and is no longer
   shown on the page. The details moved to a block at the end of the text, before previous/next and the comments:
   `No. 042`, the date in words (`21 October 2026` / `21 ottobre 2026`, UTC), the reading time (`8 min read` /
   `8 min di lettura`) and the "originally written in" label with its link to the other version. It is a `<footer
class="about">` of the entry with the accessible name "About this entry". The comments link in the old side column
   is gone (the section is right below).
3. **About and Now carry no label**, in both languages. Entries keep it, and so do the legal pages (Rights, Privacy),
   which the owner did not name: a legal text's original language matters. The marker column in the journal index stays.
   Rule 5 of the brief now reads "every entry and legal page shows the label".
4. **Topics are removed.**
   - Site: no topic column or filter in the journal index, no `/journal/<topic>` pages (they answer 404 and are not in
     the sitemap), no topic on the home page's latest entry, in the feeds (no `<category>`), the sitemap, the
     JSON-LD (there never was a keyword) or the share images. `src/lib/topics.ts`, the `topic_*`/`topics*`/`thTopic`
     strings and `journalPath`'s `tag` argument are gone. The journal index is by year only ("Full index, by year →").
   - Content: the schemas still accept a `tags:` line (as an optional list of strings) because existing files have
     one and `.strict()` would fail the build on them. Nothing reads it. New files do not get one (`pnpm new` writes
     none and has no `--tags`).
   - `/admin/write`: no Topics field, no topics in the browser autosave, no topic validation. The publisher writes no
     `tags:` line; editing a published entry therefore drops its old line, which is the only difference in that diff.
     `parseEntry` ignores `tags:` in both its forms. The D1 `drafts.tags` column stays (it has a default, so no
     migration is needed and none can fail a deploy); it is simply never written or read.
   - CI guard and content check: neither mentioned topics, so neither changed. The guard still allows only
     `src/content/journal/{en,it}/<slug>.md`.
5. **Replies in the comments** are signed "Phil" on English pages ("Phil replied") and "Filippo" on Italian pages
   ("Filippo ha risposto"). Only the string `w_replied` changed; the Worker already picks it by the page's language.
   The sign-off at the end of an entry ("— Filippo") is not a reply and did not change.

## Consequences

- `tests/e2e/header-entry.spec.ts` covers the controls (name, text, shape, size, icon in each theme and each way of
  choosing it) and the entry layout (nothing between the title and the text, the block in the right place, no
  description on the page). `i18n.spec.ts` covers the missing label, the missing topic pages and feeds;
  `tests/worker/comments.test.ts` the two signatures; `write.test.ts` and the e2e admin test the missing topics.
- `/styleguide` shows the new controls and the details block; its section list uses a new `.chips` class (it was
  `.tags`, the topic list's class).
- This record is numbered 0023 because 0022 (the QA matrix) is on its own branch.

## Not done

- `docs/guide.md` (the owner's, never edited) still describes topics and the old entry head; this record overrides it.
- No migration to drop `drafts.tags`.
- Old `tags:` lines in the existing content files are not removed; the owner can delete them whenever.
