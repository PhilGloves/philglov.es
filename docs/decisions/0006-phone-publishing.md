# 0006 — Publishing from the phone through /admin/write

Status: Accepted · 2026-11-11 · Source: docs/guide.md, "Publishing from your phone"

**Decision.** A phone-first form at `/admin/write`, behind Cloudflare Access and a JWT check in the Worker, turns text
and photos into a pull request through a GitHub App installed on this repository only (Contents and Pull requests:
write). Photos upload to R2 one at a time with retry. The same CI then translates, builds and tests; only a merge after
green checks publishes. The admin pages may load one small script of their own under their own CSP.

**Reason.** Works in any phone browser, needs no extra app and no third-party code; even a stolen login can only open a
pull request, never publish.

**Rejected.** Editing on the GitHub website or app (kept for typo fixes; awkward for long entries and photos). A Git app
on the phone (extra app, sync conflicts). A Git-based CMS such as Decap or Sveltia (large third-party script and its
own login).

**Note.** The repository is public. Branch protection on `main` is what keeps the App off `main`, so it is the first
launch blocker in `docs/setup.md`, and phone publishing must not be used for real before it is on.
