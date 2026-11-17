# 0031 — Photos at launch: one copy to production's bucket, then uploads only on production

Status: Accepted · 2026-11-17 · Fourth opinion (A-01, B-01), owner's preferred design · Amends
[0005](0005-r2-photo-originals.md), [0008](0008-environments.md) and [0019](0019-photo-pipeline.md)

**Context.** There are two originals buckets: `philglov-originals-staging`, which the staging and preview Workers
upload to, and `philglov-originals`, production's, created empty at launch. Every build reads one of them, chosen by the
repository variable `R2_ORIGINALS_BUCKET` with one read token: the Test job (whose build staging and preview deploy),
the QA run after a publish and the production deploy. `docs/setup.md` told the owner to point that variable at the new
empty bucket at launch. Then the first production build would not find a single photo uploaded before launch, and
after the switch a photo uploaded on staging would be missing from the bucket the builds read.

## Decisions

1. **Two buckets stay.** Staging and preview are bound to staging's bucket only and are never given production's: a
   test copy of the site must not be able to change or delete a photo the live site shows.
2. **One copy at launch, of what the content uses.** `scripts/copy-originals.ts` (logic in
   `scripts/lib/copy-originals.ts`) copies every original the entries and photo series on `main` use
   (`contentKeys`, the same list the build fetches) from staging's bucket to production's, under the same key, and
   checks each copy: the download against the original's size and MD5, the stored object against the download. It
   never writes over an object production has (same bytes: "already"; other bytes: "different", left as it is), so a
   second run copies nothing. It lists what the content uses but neither bucket has ("missing") and fails while
   anything is missing, different or failed. What staging holds besides (drafts' photos, test uploads) is listed and
   not copied.
3. **Least access, nothing in a file.** It runs once on the owner's laptop with two R2 tokens made for it and deleted
   after: Object Read only on staging's bucket, Object Read & Write on production's only. Their values come from the
   environment, set for one PowerShell window with `Read-Host`; the script never prints them and reads no file for
   them. The bucket names are fixed in the script, so the direction cannot be swapped.
4. **After launch, photos only on production.** The Worker stores an upload only when its var `PHOTO_UPLOADS` is
   `"on"`; otherwise `/admin/upload` answers 403 with "This copy of the site no longer stores photos. Since launch,
   entries with photos are written on philglov.es/admin/write." Production is always `"on"`; staging and preview are
   `"on"` until launch and are set `"off"`, together, in the launch pull request (`tests/unit/wrangler-config.test.ts`).
   This is the smallest change: one var and one check. Publish and drafts are unchanged; staging's Publish already
   refuses photos its own bucket does not hold, so an edit of an entry with post-launch photos must be made on
   production.
5. **The order** is `docs/setup.md` step 12b: finish the drafts with photos, stop uploads on staging and preview, copy,
   point `R2_ORIGINALS_BUCKET` and the read keys (Actions and Dependabot) at production's bucket, check, delete the
   tokens. Staging keeps working: it deploys what Test builds, which from then on has production's photos.
6. **`listKeys` stays** (fourth opinion B-01 found it unused): the copy uses it to list what it leaves in staging. The
   R2 helper (`scripts/lib/r2.ts`) also gained `headObject` and `putObject` over one signed `send`; the build itself
   still only reads.

## Rejected

- **One bucket for every environment:** staging and preview could replace or delete a live photo.
- **Each build reading its own environment's bucket:** staging deploys the Test job's build, so staging would need a
  build of its own; and after launch staging's bucket would lack every photo uploaded on production, so staging's build
  of `main` would fail.
- **Keeping the buckets in step (copying both ways, or after every upload):** more code, and a token that reaches both
  buckets for good.
- **`wrangler r2 object get/put` with the owner's wrangler login:** that login reaches the whole account and is kept in
  a file on the laptop; wrangler also has no command that lists a bucket.
- **Copying all of staging's bucket:** it would carry drafts' and test photos that no production page uses.
- **Blocking Publish on staging too, or hiding the photo field:** a new feature; the upload refusal is enough, and the
  build already stops on a photo the bucket does not hold.

## How it is tested

`tests/unit/copy-originals.test.ts` runs the copy against a local R2 stand-in (`tests/unit/r2-stand-in.ts`) that checks
every request's Signature V4 and payload hash and lets each token reach only its buckets, read or read and write: it
copies what the content uses with the same bytes and type and names what it leaves; the second run copies nothing; a
missing original is listed while the rest are copied; a different object in production is never written over; an
ETag that is not an MD5 is handled; a production token that cannot write fails with R2's answer and stores nothing; a
wrong secret is refused; the command will not start without its five variables. Each test failed before the copy
existed. `tests/worker/write.test.ts`: with `PHOTO_UPLOADS` off an upload is refused with the message and nothing is
stored (it failed before the check). `tests/unit/wrangler-config.test.ts`: production is `"on"`, staging and preview
are the same value.
