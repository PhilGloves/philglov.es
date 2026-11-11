# 0003 — Flat bilingual URL scheme

Status: Accepted · 2026-11-11 · Source: docs/guide.md, "Site map, URLs and the bilingual model"

**Decision.** English at `/`, Italian under `/it`. Entries live at `/<slug>` and `/it/<slug>` with the same slug and no
section folder. No trailing slashes (`/alps/` redirects to `/alps`). Lowercase ASCII slugs with hyphens. Twins are the
files with the same name in the `en/` and `it/` folders. Reserved slugs (`it`, `journal`, `photos`, `now`, `about`,
`rights`, `privacy`, `admin`, `api`, `_assets`, `feed.xml`, `styleguide`, `404`) fail the build. A changed slug gets a
301 from the old one. Never redirect by browser language; the language switch only adds or removes `/it`.

The "originally written in" label is shown on every page (brief rule 5). Where a page has no twin, the label still
names the language it was written in, and the language switch links to the other language's home and says so
(Frontend prompt 5). This reconciles the brief with the guide's wording "on every page that has a twin".

**Reason.** Shortest URLs for the wider audience, clean `hreflang` pairs, and a switch that needs no JavaScript and no
stored preference.

**Rejected.** Subdomains (two sites to search engines). `/en/` + `/it/` (longer URLs for most readers). Section folders
in entry URLs such as `/journal/alps` (longer, and they break when an entry changes section). Redirecting by
`Accept-Language` (traps people, confuses crawlers).
