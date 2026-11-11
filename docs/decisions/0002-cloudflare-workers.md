# 0002 — Cloudflare Workers with Static Assets, data in the EU jurisdiction

Status: Accepted · 2026-11-11 · Source: docs/guide.md, Decision guide #3–4 and #11

**Decision.** One Worker with Static Assets serves the site. It runs first on pages (form tokens, comments, headers)
and serves `/api/*` and `/admin`. D1 holds comments, reports and drafts; R2 holds photo originals and backups. Every D1
database and R2 bucket is created in the EU jurisdiction (this cannot be changed later). `/admin` is behind Cloudflare
Access, and the Worker verifies the Access JWT itself. No analytics on the page.

**Reason.** Cloudflare Pages is in maintenance mode; Workers is where static sites go now. The free tier covers a
personal site (100,000 Worker requests a day; static files don't count). D1 and R2 keep form data in the EU.

**Rejected.** Netlify and GitHub Pages (no edge code for forms without a third party). An EU VPS with Caddy (all-EU
company, but a server to patch; kept as the alternative). Cloudflare Web Analytics (injects a script).
