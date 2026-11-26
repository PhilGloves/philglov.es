# 0046 - An unlisted page at /cv offers the CV as a PDF from R2

Owner request, 2026-11-26. Builds on [0005](0005-r2-photo-originals.md) and [0019](0019-photo-pipeline.md).
The number 0045 was held by an open pull request when this was written.

**Decision.**

- **The file.** Never in the repository. It is the object `cv/filippo-guanti-cv.pdf` in the originals bucket the builds
  read; `src/data/site.json` `cv.file` names it. `scripts/fetch-originals.ts` downloads it with the photo originals
  (it is in `contentKeys`), so a build with R2 credentials that cannot fetch it fails. It keeps R2's Last-Modified as
  the file's date. Without the file (no `cv` named, a fork, a laptop without keys, the empty test site) there is no
  `/cv` and the build passes.
- **Published** unchanged at `/cv/filippo-guanti-cv.pdf` (`scripts/postbuild.ts`), served by Cloudflare without the
  Worker (`run_worker_first`), because `_headers` never applies to the Worker's own responses. `dist/_headers` makes it
  a download named `Filippo-Guanti-CV.pdf`.
- **The page** `/cv`, English only: no `/it/cv`, no hreflang, the language switch opens the Italian home page. Its
  words are in `src/lib/cv.ts`, not `src/i18n`, where every key needs an Italian twin. It shows the file's size and the
  date it was uploaded.
- **Unlisted.** No link anywhere; not in the sitemap, feeds, share images, `robots.txt` or `/_assets/entries.json`;
  `noindex` in the page and in `X-Robots-Tag` for `/cv` and `/cv/*`, production included. `cv` is a reserved slug; the
  public manifest leaves it out of `taken` and the Worker adds it back (`worker/src/manifest.ts`).
- **CI.** The repository is public, and anyone signed in to GitHub can download its workflow artifacts. The `dist`
  artifact therefore leaves `dist/cv/` out, and the staging and preview deploys fetch the PDF from R2 again
  (`scripts/publish-cv.ts`) with the R2 read keys the Test job already uses. The production deploy builds for itself.

**What "unlisted" does not mean.** There is no login: anyone with the address can download the file, the address is
short enough to guess, and this public repository names it. The CV should hold nothing a stranger may not read.

**Rejected.** The PDF in git (public, and for ever in the history). A random address (the owner asked for `/cv`). A
login (the owner asked for none). A `Disallow` in `robots.txt` (it would advertise the address). Serving the PDF
through the Worker with an R2 binding (the production bucket would need a read path from the public Worker).

Tests: `tests/e2e/cv.spec.ts`, `tests/unit/cv.test.ts`, `headers`, `content-check`, `wrangler-config` and
`ci-workflow` unit tests, `tests/worker/write.test.ts`, the production check in `tests/e2e/qa/seo.spec.ts`, and
`tests/site/smoke.spec.ts` on the owner's build. The accessibility and matrix suites take `/cv` from `dist/`.
