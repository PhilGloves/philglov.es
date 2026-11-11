# 0007 — How the dependency cap is counted

Status: Accepted · 2026-11-11 · Owner ruling in the Lead session

**Context.** Brief rule 10 says "fewer than 10 direct dependencies", but the Lead prompt and the later agents require
about 17 packages of build and test tooling (Astro, TypeScript, ESLint, Prettier, html-validate, wrangler, Playwright,
Lighthouse CI, axe, jose …). Counting everything would mean dropping mandated tools.

**Decision.** The cap of fewer than 10 applies to `dependencies` in `package.json`: what the build and the Worker run.
Development tooling goes in `devDependencies`, each one justified below and in the pull request that adds it, and kept
as small as possible. RSS feeds and the sitemap are hand-written endpoints, not plugins.

| Package                                        | Kind    | Why                                                                                          |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| astro                                          | runtime | The site engine (0001). Brings sharp as its optional image service.                          |
| @astrojs/check                                 | dev     | Type-checks `.astro` files (`astro check`).                                                  |
| typescript                                     | dev     | TypeScript strict. 6.0.x, because @astrojs/check and typescript-eslint do not yet support 7. |
| @types/node                                    | dev     | Types for `scripts/` and unit tests, which run on plain Node.                                |
| eslint, typescript-eslint, eslint-plugin-astro | dev     | Lint TypeScript and Astro files (Lead prompt 1).                                             |
| prettier, prettier-plugin-astro                | dev     | Formatting, including `.astro` files.                                                        |
| html-validate                                  | dev     | Validates every built page and forbids inline `style` attributes.                            |
| wrangler                                       | dev     | Local Worker runtime, `wrangler types`, deploys.                                             |
| @playwright/test                               | dev     | End-to-end tests across widths, themes and JS on/off (QA).                                   |
| @lhci/cli                                      | dev     | Lighthouse CI budgets (Lead prompt 5).                                                       |

Runtime count today: 1 (astro). Expected later: jose (Worker JWTs, backend agent).

**Rejected.** Counting dev tooling too (would drop required checks). Raising the cap for everything (no real safety gain
over justifying each tool).
