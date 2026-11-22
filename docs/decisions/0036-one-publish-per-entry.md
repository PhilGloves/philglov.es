# 0036 - One Publish per entry: no second pull request while one is open

Status: Accepted · 2026-11-21 · Owner request (final review T2-03, options a and b) · Amends
[0017](0017-backend-worker.md) (B8, `/admin/write`) and [0021](0021-publishing-goes-live.md) (Publish goes live)

**Context.** The final review (FINAL-REVIEW.md, T2-03) found that one entry could open two publisher pull requests:
a double tap on Publish, or reloading the "Published" page and confirming the browser's resend question, sent the
form again, and nothing checked for an open pull request of the same file. The second one had nothing left to change
once the first merged, and turned red ("needs attention"). The owner chose option (a), the Worker refuses, and (b),
the buttons show they are busy.

## Decisions

1. **Before it opens a pull request, Publish lists the publisher's open ones** (`openPublications`) and keeps those
   whose branch is this file's (`publish/<lang>-<slug>-<stamp>`). If there is one:
   - **the same text again is a resend** (the file on that branch is exactly what this Publish would write): the
     answer is "Already on its way", with the address where it will be live and the open pull request's link. It
     removes the browser copy (`data-clear`) and the server draft, as "Published" does, because the browser may show
     this answer instead of the first one.
   - **another text is refused** (409) with the link to the open pull request; the text stays in the form, and the
     message says to save a draft and make the change once the first is live, or, if the first needs attention (a failed check: it will never go live), to close it on GitHub and publish again.
     A pull request that is merged or closed is not open, so the next Publish of that file works as before.
2. **One Publish of a file at a time.** Two taps arrive together, and each would find no pull request open yet. A
   Publish takes a row in the D1 table `publishing` (migration 0004: the file path and a time, nothing personal) and
   removes it when it has answered. A second Publish of the same file waits for it, up to 20 seconds, then finds the
   first one's pull request as in 1. A row older than two minutes, left by a request that died, is taken over.
   After 20 seconds of waiting the second is refused with a message and keeps the text.
3. **With JavaScript on, Publish and Save draft are greyed out from the first tap**, the button pressed reads
   "Sending…", and another tap or Enter sends nothing until the answer arrives (`/admin/write.js`). The buttons are
   disabled just after the submit event, never during it, so the button pressed is still sent with the form; coming
   back to the page from the browser's history makes them work again. Without JavaScript, 1 and 2 are the protection.
4. The new text on the write page is English only, like the rest of `/admin`. No visitor sees it.

## Consequences

- If GitHub cannot list the open pull requests, Publish answers "Could not open the pull request (GitHub: list
  pull requests, …)" and opens nothing, rather than risking a second one. Save draft is unaffected.
- `write.js` is 12.5 KB; the unit test's cap for the admin scripts is 13,000 bytes. The public JavaScript budget
  (1,536 bytes) does not include them and is unchanged.
- An edit refused because the first is still open meets T2-04 (FINAL-REVIEW.md): a draft keeps the version it was
  opened from, so once the first has merged, its Publish is refused as "changed on GitHub". Until T2-04 is settled,
  make the second change after the first is live, from the entry's edit form.
- Both GitHub stand-ins (`vitest.config.ts`, `tests/e2e/admin-worker.ts`) keep what the Worker writes on a branch and
  list the pull requests it opened as open, as GitHub does.
