# 0001 — Astro, static output

Status: Accepted · 2026-11-11 · Source: docs/guide.md, Decision guide #1–2

**Decision.** The site is built with Astro (7.x, the current stable release) with `output: "static"`. Content is
Markdown in `src/content`, validated by zod schemas in `src/content.config.ts`. No CMS, no content database.

**Reason.** Astro ships zero JavaScript by default, has typed frontmatter (a missing `lang` fails the build), built-in
i18n routing and image optimisation, and is MIT-licensed. Markdown in Git gives full history and no password to steal.

**Rejected.** Hand-written HTML (no schema checks, no image pipeline). Eleventy (no typed content). Hugo (smallest
supply chain as a single binary — the paranoid alternative — but weaker typed content and image pipeline). Headless CMS
or WordPress (login and plugin attack surface, the ClickFix vector).
