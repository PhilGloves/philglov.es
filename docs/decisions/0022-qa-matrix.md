# 0022 — How the QA matrix is built and run

Status: Accepted · 2026-11-13 · QA agent

**Context.** The QA brief asks for every page × language × theme × five widths × JavaScript on/off, a smoke subset in
Firefox and WebKit, fifteen suites, a live-site check, and a run that passes repeatedly without flaky tests.

**Decision.**

- The suites live in `tests/e2e/qa/`, one file per brief suite (`matrix`, `a11y`, `theme`, `i18n`, `seo`, `links`,
  `security`, `forms`, `print-cookies`, `rights`, `budgets`, `phone`, `cross-browser`, `launch`, `live`) plus
  `tests/unit/qa-images.test.ts` (GPS and rights metadata read with exiftool, independent of the code that wrote it).
- The page list is the build itself (`dist/*.html`), not the sitemap, so a page the sitemap forgot is still tested.
- One test per page, so a failure names the page. `settle()` in `qa/lib.ts` is the fix for Q18 and Q20: every wait
  uses the requests the test has seen in flight, never `requestAnimationFrame` or a timer inside the page (neither
  runs with JavaScript off), and no test is retried.
- Projects: `chromium` and `chromium-no-js` are `pnpm test:e2e` (what CI runs); `firefox` and `webkit` are
  `pnpm test:cross`; `visual` (baselines per operating system), `launch` (the gate that fails until O1 is answered)
  and the live check (`playwright.live.config.ts`) are run by hand or after a deploy.
- `QA_PROD=1` serves the Worker with `SITE_ENV=production`; `pnpm qa:production` builds that way, runs the SEO,
  rights and launch suites and rebuilds the normal build.
- Known product bugs are kept as `test.fail()` tests named `BUG-n` so CI stays green while the bug is open and turns
  red ("unexpectedly passed") the moment it is fixed, which is the cue to delete the marker.
- `pnpm qa` refuses to start if something already answers on port 8787: Playwright would reuse a stale server.
- Dependency: `axe-core` (dev), see 0007. Not `@axe-core/playwright`: the rules are injected over the DevTools
  protocol, which the site's CSP does not govern, so the wrapper adds nothing.

**Rejected.** Retries (they hide the flakiness the brief forbids). Visual baselines in CI (fonts render differently per
operating system, so baselines are made and checked on the same one). Reading the CSP-blocked request as a failure
(Chromium reports `csp` and nothing leaves the machine; the test asserts exactly that).

## CI: one required check, two scopes

The ruleset "Protect main" requires one status check, `Test` (checked with the GitHub API, 2026-11-15; "strict" is
off). Publishing from the phone waits for it, so it must stay fast, and the QA matrix is about 20 minutes. Splitting into two jobs would mean changing the ruleset to require the second one as well, which is the owner's switch, so the split is **inside** `Test`, in a step that reads the diff:

- **Fast scope:** the change touches only `src/content/journal/{en,it}/<slug>.md` (what the publisher writes; the same
  pattern as the publisher guard). Runs: lint, the build with its content check, html-validate, and the Chromium core
  suite (`E2E_SCOPE=core`: everything in `tests/e2e` except `tests/e2e/qa`, JavaScript on and off). Measured: the core
  suite is 66 s on this laptop.
- **Full scope:** any other change, and any trigger that is not a pull request or a push. Everything in the fast scope
  plus typecheck, unit, Worker tests, the QA matrix, Firefox and WebKit, Lighthouse, and the checks on a
  `SITE_ENV=production` build (SEO, rights; the launch gate informs without blocking until owner question O1 is
  answered). The production build runs after the `dist` artifact is saved, so no deploy ever gets it.
- **After a publish:** the push to `main` of an entry-only merge takes the fast scope too, so the entry goes live
  without waiting; the job `full-qa-after-publish` then runs the full matrix on `main` in parallel. It gates nothing
  and is not a required check; a red cross on `main` is its signal.

## The stand-ins: no test can open a real pull request

Every test that publishes talks to a GitHub stand-in: `tests/e2e/admin-worker.ts` (browser tests: `admin-write`,
`qa/phone`, `qa/phone-throttled`) and `outboundService` in `vitest.config.ts` (Worker tests). Both answer
`api.github.com` themselves and refuse every other host (the browser tests' server records the refusal and its
`close()` fails the test that caused it; `qa/phone.spec.ts` proves it). The App credentials in a test are a key pair
made for that run. CI's `Test` job has no GitHub App secret, and the local `.dev.vars` has empty GitHub values, so
`pnpm preview` answers "Publishing is not set up".
