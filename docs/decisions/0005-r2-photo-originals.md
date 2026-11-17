# 0005 — Photo originals in a private R2 bucket

Status: Accepted · 2026-11-11 · Source: docs/guide.md, Decision guide #10 and "Photo storage that scales"

_Amended by [0030](0030-security-audit.md): CI never caches the originals (a fork's pull request can read main's Actions caches); every trusted run downloads them from R2, and only the resized outputs are cached._

_Amended by [0031](0031-photos-at-launch.md): at launch the originals the content uses are copied once from the staging bucket to production's, the builds switch to production's bucket, and staging and preview stop taking uploads (`PHOTO_UPLOADS`)._

**Decision.** Originals live in the private EU bucket `philglov-originals` (staging and previews:
`philglov-originals-staging`). The repository holds only one `photos.json` per series (file, alt text and caption in
both languages, `takenAt`, optional EXIF overrides) and the Markdown that references entry photos. A prebuild script
downloads the originals not already in the CI cache into the git-ignored `src/.originals/`; resized outputs
(AVIF/WebP/JPEG) are cached keyed by file hash. GPS is stripped and rights metadata is written back. RAW files never
leave the owner's drives.

**Reason.** The repository stays small and fast to clone, build time grows only with new photos, and originals with
their full metadata are never public.

**Rejected.** Photos in Git or Git LFS (the repository grows forever; LFS bandwidth costs). Flickr or 500px embeds
(third-party requests). A lightbox library (JavaScript; each photo gets its own page instead).
