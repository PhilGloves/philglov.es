# 0009 — Asset layout, routing and headers

Status: Accepted · 2026-11-11 · Source: Lead prompt 1; docs/guide.md, "Rules for the build"

**Decisions.**

- `build.format: "file"` + `trailingSlash: "never"` + Cloudflare `html_handling: "drop-trailing-slash"`: `/alps` is
  served from `alps.html`, and `/alps/` redirects to `/alps`.
- Every CSS, JS, font and image file is emitted under `/_assets/` (`build.assets`, and `public/_assets/` for
  hand-placed files). `run_worker_first` is `["/*", "!/_assets/*", …]` plus `!` patterns for robots.txt, sitemap.xml,
  the feeds, favicons and `/.well-known/*`. Any new non-HTML file at the root must be added to that list.
- No inline CSS: `inlineStylesheets: "never"`, Markdown syntax highlighting off, no `style` attributes, no
  `<ClientRouter />`, prefetch off, dev toolbar off.
- Security headers have one source, `worker/src/headers.ts`. The Worker applies it to page, API and admin responses;
  `scripts/postbuild.ts` writes the same headers into `dist/_headers` for the files Cloudflare serves without the Worker
  (`_headers` never applies to Worker responses). The CSP is a header, not Astro's `<meta>` CSP, because a meta tag
  cannot carry `frame-ancestors`. The frontend agent adds the theme-script hash (ticket F1).
- `not_found_handling: "404-page"` serves `dist/404.html`. `/api/*` and `/admin*` (any case) answer 404 until the
  backend builds them.

**Rejected.** `build.format: "directory"` (needs trailing slashes or redirects). Running the Worker on every request
(spends the free-tier request budget on images and fonts). Astro's built-in CSP (meta tag only).
