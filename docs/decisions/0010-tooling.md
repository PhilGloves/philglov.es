# 0010 — Tooling and supply chain

Status: Accepted · 2026-11-11

**Decisions.**

- Node 26 (LTS since October 2026), pinned in `.node-version`. Scripts and unit tests are plain TypeScript run by
  Node's built-in type stripping, so there is no `tsx` or `ts-node`.
- Unit tests use the built-in `node:test` runner for now, with no extra package. The backend agent may add Vitest with
  the Workers test pool for tests that need D1 or R2 bindings; record it here when that happens.
- Worker types come from `wrangler types` (generated and git-ignored), not `@cloudflare/workers-types`.
- pnpm 12, lockfile committed, `--frozen-lockfile` in CI. `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` (a release
  must be a day old before it can be installed), with no exclusions. Install scripts are allowed only for `esbuild` and
  `workerd` (`allowBuilds`); add `sharp` there if the photo pipeline needs it.
- GitHub Actions are pinned to full commit SHAs with the tag in a comment; Dependabot updates them weekly with a 3-day
  cooldown. pnpm is installed with `npm install -g`, avoiding a third-party setup action.
- Astro and wrangler telemetry are disabled in CI.
- Lighthouse CI writes its reports to the local filesystem, never to Google's temporary public storage. The SEO
  category is reported but not asserted on non-production builds, which are deliberately `noindex`; the QA agent adds an
  SEO check against a `SITE_ENV=production` build.

**Rejected.** Vitest from day one (not needed until Worker tests exist). `pnpm/action-setup` (one more third party with
access to the runner). Floating action tags such as `@v7`.
