# 0008 — Environments and their data

Status: Accepted · 2026-11-11 · Source: brief rule 15; Lead prompt 1, 5 and 11

| Env        | Worker           | Address                                           | D1               | R2 buckets                                           | Indexed |
| ---------- | ---------------- | ------------------------------------------------- | ---------------- | ---------------------------------------------------- | ------- |
| local      | philglov-local   | `wrangler dev` only, never deployed               | local simulation | local simulation                                     | no      |
| preview    | philglov-preview | `pr-<n>-philglov-preview.<subdomain>.workers.dev` | philglov-preview | the staging buckets                                  | no      |
| staging    | philglov-staging | `philglov-staging.<subdomain>.workers.dev`        | philglov-staging | philglov-originals-staging, philglov-backups-staging | no      |
| production | philglov         | `philglov.es` only, from launch                   | philglov         | philglov-originals, philglov-backups                 | yes     |

**Decisions.**

- The top-level wrangler config is local-only (`workers_dev: false`, no routes, name `philglov-local`), so a deploy
  without `--env` can never reach production or an unprotected address.
- Previews are a separate Worker with its own D1, so a pull request never touches staging or production comments. They
  share the staging R2 buckets: staging holds test data only, and a third pair of buckets would add setup with no
  safety gain. Staging and preview Workers sit wholly behind Cloudflare Access, preview URLs included.
- `SITE_ENV` (a wrangler var, and an environment variable at build time) decides indexing: only `production` drops
  `X-Robots-Tag: noindex`. Unset means "not production", so a stray build is never indexable.
- Canonical URLs, the sitemap and metadata always use `https://philglov.es` (`site` in `astro.config.ts`).
- Domain-only features (notification email, zone settings, Search Console) are built behind config switches and turned
  on at launch.
- Deploys are switched on by repository variables (`PREVIEW_DEPLOY`, `STAGING_DEPLOY`, and at launch
  `PRODUCTION_DEPLOY`), so CI stays green before the owner has created the Cloudflare resources.

**Rejected.** Workers preview URLs on the staging Worker (they share staging's bindings, so previews would write to the
staging database). One shared database for every non-production environment.
