# 0033 - Sample content removed; the tests run on fixtures, the site gets a smoke test

Status: Accepted · 2026-11-18 · Owner request · Amends [0021](0021-publishing-goes-live.md) (what a publish waits
for) and [0022](0022-qa-matrix.md) (what the matrix runs on, the after-publish run, `E2E_SCOPE`)

**Context.** `src/content` held the build phase's sample and test content: the entries `lisbona` (both languages),
`one-roll`, `foto`, `we`, `provafoto` and the series `lisbon`, with their originals in R2. About 40 test files named
them, read `src/content` directly, or were built from it. So the owner could not delete a sample, or publish and later
remove a real entry, without breaking the tests. The deployed site showed the samples.

## Decisions

1. **`src/content` is the owner's only.** The samples are moved, unchanged, to `tests/fixtures/content/journal` and
   `tests/fixtures/content/photos/lisbon`, with a copy of the current pages in `tests/fixtures/content/pages` (so the
   owner can rewrite About, Now, Rights and Privacy without touching a test). The deployed site has no entry and no
   series until the owner writes one.
2. **One switch picks the content: `SITE_CONTENT`**, read in one place, `scripts/lib/content-root.ts`. Unset is the
   site (`src/content`, `src/.originals`); `fixtures` is the test site; `empty` is the site with no entry and no series
   (the fixture pages, `tests/fixtures/empty`). The content collections, the content, originals, photo-meta and
   photo-rights scripts and the stand-in clean-up take their folders from it. The originals are found through a Vite
   alias, `@originals`, because `import.meta.glob` takes literal patterns only; `src/lib/photo-meta.ts` keys them by the
   path after `.originals/`, so `Photo.astro` names no folder. The fixtures mirror `src`, so an entry's
   `../../../.originals/<key>` works in both trees unchanged.
3. **`pnpm build:fixtures [empty]`** (`scripts/build-fixtures.ts`) sets the switch and runs the same `pnpm build`.
   Nothing else sets it, so `pnpm build` and every deploy job build the owner's content. The fixture photos are drawn by
   `scripts/fixture-photos.ts` with sharp (already a dependency): for every key the fixture content names, a flat JPEG
   (a disc and a block on a background) at the size and dominant colour of the R2 original it replaces, which was
   itself a drawn placeholder. Same input, same bytes; git-ignored; no R2, no secret, so a fork's pull request runs the
   whole suite.
4. **Every suite runs on the fixtures.** Tests that read content read `tests/fixtures/content` (`tests/fixtures/content.ts`);
   the GitHub stand-ins (`tests/e2e/admin-worker.ts`, `vitest.config.ts`) answer `src/content/…` from the fixtures, so
   the phone-publishing tests see the same entries the build has. Playwright's global setup and the Vitest config
   refuse any other `dist/` with the command to run (`assertFixtureBuild`). The slugs are unchanged, so the tests, the
   Lighthouse URLs and the visual pages are unchanged; the visual baselines were regenerated because the photos are
   new pixels (0022's way: `--update-snapshots=all`, each page looked at, then an exact run).
5. **The owner's build gets a smoke test**, `tests/site/smoke.spec.ts` in `playwright.site.config.ts` (`pnpm test:site`,
   with `tests/unit/qa-images.test.ts`). It names no entry: it takes the pages from `dist/` and checks, for each, status,
   one h1, language, no console line or failed or third-party request, axe (WCAG 2.2 AA, AAA for text in `<main>`) in
   both themes at 1440 and 390 px; that every on-site link, image, stylesheet and script answers; that the sitemap is
   exactly the indexable pages and each answers; that both feeds are RSS and their items answer; that robots.txt,
   security.txt and tdmrep.json are served; and, while there is no entry or series, the empty states in both languages.
   The launch gate moves to the same config: it is about the owner's pages. Its "no noindex" test needs a production
   build and runs in `pnpm qa:production` only. `tests/e2e/qa/live.spec.ts` takes entries and photo pages from the
   deployed sitemap instead of naming samples.
6. **Empty states.** Home and Journal: "Nothing here yet." without the language-label legend or the "Full index" link
   (nothing to explain or index). Photos: "Nothing here yet." instead of "0 series". The existing string `noEntries`;
   no new string.
7. **CI: one job, one required check `Test`, two scopes, as before.** The content scope (an entry-only change, what the
   phone publishes) runs lint, fetches the originals, builds the site (content check, originals check, page check) and
   runs html-validate and `pnpm test:site`. None of the suites: an entry cannot change what they test. The full scope
   runs typecheck and the test build with every suite on it as before (unit, Worker, e2e and the QA matrix, Firefox and
   WebKit, Lighthouse, the production-mode SEO, rights and Lighthouse SEO), the empty site's build and smoke test, and
   then the site's build exactly as the content scope, the launch gate (informational) and the `dist` artifact last, so
   the deploys always get the owner's build. **"Full QA matrix after a publish" is removed**: it re-ran the suites,
   which an entry no longer changes; its job (every page of the real build checked) is the smoke test now, inside
   `Test`, before the merge instead of after it. `E2E_SCOPE` (the core suite for entry-only changes) is removed too.

## Cost

Full scope: two more builds than before (the empty site, a few seconds of Astro plus Chromium for one share image,
and the site's own, small while the owner's content is) and the smoke test (about 25 s for the empty site, a few
seconds per page more as it grows). The test build replaces the old build one for one. About 1 to 2 minutes on a
runtime of about 20. Content scope: lint, one build and the smoke test, shorter than before (the Chromium core suite is
gone) and no longer than the site's own pages make it.

## Rejected

- **Copying the fixtures over `src/content` for the test run.** One mistake on a laptop and the owner's content is
  overwritten or committed as samples.
- **A second Astro project for the tests.** Two configs to keep equal; the point is to test this one.
- **Committing the fixture photos.** Binary files to review and keep; drawing them takes about a second.
- **Keeping the samples on the site and only fencing the tests.** The deployed site must contain only what the owner
  writes.

## Left over, not deleted (for the owner)

The R2 originals of the samples (`photos/lisbon/*.jpg`, `foto/…`, `provafoto/…` in `philglov-originals-staging`), any
comments or drafts about them in the staging and preview D1 databases, and the old `publish/` branches on GitHub. The
pull request lists them; nothing reads them any more.
