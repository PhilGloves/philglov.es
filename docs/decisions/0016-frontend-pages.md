# 0016 — Frontend: pages, Worker form contract, share images, footnotes

Status: Accepted · 2026-11-12 · Frontend agent · Source: docs/guide.md (prompt 3, "Rights, AI training and privacy"),
TICKETS.md F1–F7 and the two tickets the Design agent left open

**Pages.** Routes are four dynamic files per language (`[slug]`, `journal/[...rest]`, `photos/[...rest]`, plus the
home), each a thin wrapper around a view in `src/views/`. `[slug]` serves journal entries _and_ standalone pages
(about, now, rights, privacy); a slug used by both is not caught today, the Content agent's check (C2) must catch it.
Logic lives in pure, tested `src/lib/entries.ts`: twins share a slug; the entry number is the rank of the original's
date; reading time is words / 200; markers `IT`, `EN`, `IT→EN`, `EN→IT`, `IT only`, `solo EN`; 50 per page at
`/journal/page/2` and `/journal/<topic>/page/2`. The journal index lists entries that exist in the other language only,
linked with the right `lang`.

**Theme script and CSP.** One inline script in `<head>` (`src/scripts/theme.js`, 0.8 KB): reads `localStorage` in
try/catch, otherwise CSS follows the system setting, so there is no flash. `scripts/postbuild.ts` finds the inline
script in the _built_ HTML (all pages must carry the same one), hashes it and writes `worker/src/script-hashes.json`,
which the Worker feeds to `contentSecurityPolicy()`; `dist/_headers` gets the same hash. The file is committed because
typecheck needs it; a unit test fails if it is stale.

**Form contract for the Worker (B2, B3, B3b).** Plain HTML POSTs.

- Comment form: `POST /api/comment`, fields `name`, `email`, `comment`, `slug`, `lang`, honeypot `website`, empty
  hidden `token`. Report form (footer, in `<details data-slot="report-details">`): `POST /api/report`, fields `message`,
  `email` (optional), `url` (page path), `lang`, `website`, `token`.
- Slots the Worker fills (all empty in the static HTML): `[data-slot="comments"]` (an `<ol class="clist">`),
  `[data-slot="comment-count"]`, `#comment-status`, `#report-status`, `[data-slot="error-name|email|comment"]` (one per
  comment field) and `[data-slot="report-error-message|email"]`. Success redirects should end in `#comment-status` /
  `#report-status`; on 422 the Worker also adds `open` to the report `<details>`. Empty `.field-error` is hidden by CSS.
- `section#comments` carries `data-slug` and `data-lang`.

**Share images (ticket D9).** `scripts/share-images.ts` runs in `pnpm build`: an Astro endpoint writes
`dist/share-manifest.json`, the script fills the template (`fillShareTemplate`), draws each with headless Chromium
(Playwright, already a dev dependency, so no new package) using the site's own Crimson Pro embedded from the woff2, and
writes `dist/_assets/share/<lang>-<slug>.png` (1200×630, plus `default.png`), then deletes the manifest. Results are cached
in `node_modules/.cache/share-images/`. Rejected: resvg (new native dependency, variable-font weights unreliable) and
committing PNGs. CI installs Chromium before the build.

**Footnote back-link arrow (Design ticket).** Astro 7 renders Markdown with Sätteri, whose footnotes write "↩" and
English labels; `remarkRehype.footnoteBackContent` no longer applies, and configuring Sätteri would need another package
and one language for all entries. `scripts/lib/footnotes.ts` fixes the built HTML in `postbuild`: the glyph becomes the
site's SVG arrow and the hidden title and `aria-label`s follow the page's `lang`. The build fails if any "↩" survives.

**AI opt-out.** `src/data/ai-bots.json` feeds `robots.txt` (a unit test compares it with the guide's text byte for
byte) and `/.well-known/tdmrep.json` (`[{"location":"/","tdm-reservation":1}]`, checked against the TDMRep spec: array,
`/` covers the site). `_headers` cannot match by extension and is capped at 100 rules, so `/_assets/*` carries
`X-Robots-Tag: noai, noimageai` for every file there (harmless on CSS and fonts); pages get `tdm-reservation` from the
Worker and the meta tag.

**Home italic.** The home statement uses `<em>` (prototype), so the italic file is fetched on the home page; it is still
not preloaded. `typography.spec.ts` now asserts that.

**Placeholders.** Seed entries, Now, About and the photo series are marked placeholders (O1, C5); the Italian UI strings
added here are drafts for the owner to review. `site.json` holds contact email, city, `sameAs` (omitted while empty) and
`partitaIva` (shown only when set). Photos draw the tone placeholder until P2.
