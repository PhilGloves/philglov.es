# Final review before launch

An independent review of philglov.es for its owner, done on 2026-11-21 on the latest `main` (`b385e0d`, after pull
request #40). Everything was run on a laptop: the real site and the test site built, the Worker run locally, every
test suite, and screenshots looked at one by one. Nothing was deployed, no Cloudflare or GitHub setting was touched,
nothing was merged. A finding counts only once a second reviewer, who had not seen it, reproduced it.

The fixes are in one pull request: [pull request #41](https://github.com/PhilGloves/philglov.es/pull/41) (branch `review/final-review`), merged on 2026-11-21. T2-03 (finding 9) was fixed afterwards, on your choice, in its own pull request (branch `fix/t2-03-one-publish`).

## 1. Verdict

1. **Publish entry number 1 from the phone? Not on today's `main`; yes once the fix pull request is merged.** Today
   an entry with straight quotes, a list under a sentence, `*italics*` or a space at a line end fails the Lint check,
   and an entry with a photo fails the site check about half the time. Either way it never goes live by itself.
2. **Buy the domain? Yes, now**, at a registrar that sells `.es` (Cloudflare does not). Allow up to 24 hours for the
   nameservers before the launch steps that need the domain.
3. **What blocks the first entry:** merging the fix pull request. Nothing else.
4. **What blocks launch:** the launch date on both privacy pages (you write the Italian one) and making the launch
   gate blocking (`LAUNCH-RUNBOOK.md` step 18), then the runbook in order, and the open owner items: the security
   checklist (O6), passkeys, and the two Part 1 settings.
5. **Read next:** `LAUNCH-RUNBOOK.md`, one numbered list from the days before to the day after, checked against the
   code. Where it and `docs/setup.md` differ, the runbook is right.

## 2. Findings, most serious first

Each says what is wrong, how it was reproduced, whether it is fixed, and what you must do. "Fixed" means a commit in
the fix pull request with a test that failed before the fix.

### Fixed in the pull request

1. **Blocker: a phone entry fails the Lint check, so it never goes live** (T2-01). Every pull request runs Prettier
   over the journal. The phone writes your text as you typed it; Prettier refused straight double quotes in a title,
   description or caption, a list or quotation right under a sentence, `*italics*`, a space at the end of a line
   (phone keyboards add one), a tab, a table. The rehearsal's own first entry failed this way. Reproduced by a
   second reviewer with the Worker's own file writer. **Fix:** Prettier leaves journal entries alone; they are your
   text, never reworded. **You:** nothing.
2. **High: the site check fails at random on an entry with a photo** (T2-02). The smoke test of the real site
   changed the window width and left the page while the photo for the new width was still loading, then counted the
   cut-off download as an error. 3 of 5 runs failed in the rehearsal, 7 of 15 for the second reviewer, 2 of 4 on the
   test site for a third. **Fix:** the test waits after each width change. 29 of 29 runs green after it. **You:**
   nothing.
3. **High: `docs/setup.md` step 14 (notification emails) could never pass the tests** (T4-01). The step asks for
   `"NOTIFY": "on"` and the email binding in production; the config test demanded `"off"` everywhere. Confirmed by a
   second reviewer. **Fix:** the test accepts it in production only, and only with the binding. **You:** do step 14
   after launch (`LAUNCH-RUNBOOK.md` step 24).
4. **High: a missing portrait or series photo never stopped a build** (T1B-01, T4-04). The build drew a grey frame
   reading `[ photo ]` on About and the search data lost your picture, with every check green, on GitHub and in the
   production deploy. Likely on launch day if a bucket name or key is wrong. Reproduced by three reviewers.
   **Fix:** with R2 keys, a photo the build cannot fetch stops it, naming the photo and the bucket; the playbook
   says what to do. Without keys (a fork, a laptop) nothing changes. **You:** nothing.
5. **High, hidden until someone edits the theme script: staging could ship a theme script its own security policy
   blocks** (T1-01). The tests compare the pages with a fingerprint file the build has just rewritten; the staging and
   preview deploys use the committed one. A stale one breaks the theme button and logs an error on every page while
   everything is green. Reproduced by two reviewers. **Fix:** Test fails when the build changes the committed
   fingerprint. Production builds its own and was never affected. **You:** nothing.
6. **Medium: every photo was also published at its full original size** (T3-01). The plain image inside each picture
   pointed at a file as large as the original: your portrait at 3024 x 4032 (1.8 MB). Visitors' browsers never
   load it, but anyone reading the page source could download a print-quality copy. Decision 0019 stops at 2400 px.
   Reproduced on both builds by a second reviewer. **Fix:** that file now stops at 2400 px. **You:** nothing.
7. **Low: `pnpm build` left a tracked file changed and turned `pnpm lint` red** (T1B-08). Following README's laptop
   routine twice in a row failed the second time. Reproduced by a second reviewer. **Fixed** (part of 5).
8. **Low: test holes closed.** The icon test let `onload ="…"` (a space before `=`), an outside DTD and a disguised
   `url(` through (T1B-04; nothing ran, since the icon is loaded as an image). The no-long-dash test missed five
   spellings (T1B-05). The site check did not notice a missing share image (T1-02). The photo copy's errors did not
   say which bucket refused, so on launch day you could not tell which token was wrong (T1B-07). All reproduced,
   all **fixed**.
9. **Medium: one entry could open two pull requests** (T2-03). A double tap on Publish, or reloading the
   "Published" page and confirming the browser's question, published again; nothing checked for an open pull request
   of the same entry and the button never showed it was busy. The second one had nothing left to change once the
   first merged and turned red ("needs attention"). Reproduced by a second reviewer. **Fixed after the review**, as
   you chose (options a and b, decision 0036): the Worker answers a second Publish of an entry already on its way
   with "Already on its way" and the link to its pull request, and keeps a different text in the form until the
   first is live; two taps that arrive together are taken one after the other. With JavaScript on, Publish and Save
   draft grey out and say "Sending…" from the first tap. A later edit, once the first pull request is merged or
   closed, publishes as before. **You:** nothing.

### Not fixed: your decision or a larger change

10. **High: the launch gate never blocks, and `[launch date]` is still on both privacy pages** (T1B-03, T4-03). The
    gate runs with `continue-on-error`, the production deploy does not wait for it, and no numbered step in
    `docs/setup.md` says to type the date (it is listed under "Launch blockers" only). Confirmed by a second
    reviewer. Not fixed: it needs your words, in both languages. **You:** runbook step 18: replace the placeholder on
    both pages, and in the same pull request delete `continue-on-error: true` from the "Launch gate" step.
11. **High for your calendar: the domain step has no registrar and no waiting time** (T4-02). Cloudflare's list of
    registrable endings does not show `.es`; the nameserver switch can take 24 hours, and Email Routing, Access and
    the custom domain need it done. **You:** buy `philglov.es` now elsewhere (runbook steps 2 and 3).
12. **Medium: after "changed on GitHub meanwhile", the way out is to retype** (T2-04). Saving an edit of an entry that
    changed on the laptop is refused, as it should be. The message says to save a draft and "open the current
    version", but that opens the same draft with the old version, which is refused again; only deleting the draft and
    typing the change again works. The second reviewer also read in the code, without trying it in a browser, that
    following the link without saving a draft can bring back the browser's copy and overwrite the laptop change.
    Options: open the draft on the current published version, with that version shown next to it; or say plainly
    to delete the draft. **Until then: edit an entry in one place at a time.**
13. **Medium: `www.philglov.es` does not exist** (T4-05). The Worker answers the bare domain only. Your choice: a
    redirect (runbook step 6) or none.
14. **Medium: two typed hyphens become a dash, and straight quotes curly ones, in Markdown** (T1B-02, T2-06). Today
    no page has one. Your entries are exempt from the no-long-dash rule, so this is only a surprise. Options: (a)
    leave it; (b) switch the conversion off, which also loses curly quotes and the ellipsis; (c) keep quotes but not
    dashes, which needs a new dependency (`@astrojs/markdown-satteri`), to be justified under the dependency cap.
    The second reviewer found that the obvious setting `smartypants: { dashes: false }` is accepted and ignored.
15. **Low: launch day gaps in `docs/setup.md`** (T4-06 to T4-15), all confirmed and all handled in the runbook:
    production's six secrets, wrangler's "add it on your behalf?" question (answer n: yes writes the database in the
    wrong place, without the EU setting), rolling back a first deploy or taking the site offline, the Access
    session (7 days in setup.md, 24 hours in `SECURITY-REPORT.md`: your call, O6), stale lines in `docs/handover.md`
    and `SECURITY-REPORT.md`. `docs/setup.md` Part 2 now points to the runbook; its own text is unchanged.
16. **Low: smaller rough edges.** A failed publish leaves an empty branch on GitHub (T2-05). With JavaScript off,
    an expired login loses what you typed (T2-07); with it on, everything comes back. The "Markdown cheat sheet"
    toggle is 30 px tall on a phone. The site check still does not notice an emptied portrait alt text or an emptied
    About text (T1-02). The live check tests "no noindex" on the home page only in production mode (T4-10). The
    photo copy says "1 originals" and lists a copied photo with `<` or `>` in its name as "not copied" (T1B-06).
    The playbook does not mention the build's schema error (`data does not match collection schema`) (T6-01).
    After `pnpm build:fixtures`, a local `pnpm lint` flags `tests/fixtures/.originals/meta.json` (seen once, not
    reproduced, not fixed; GitHub lints before building, so it is never red there).
17. **Notes, your call.** Lighthouse never measures your real pages: it fails on this Windows laptop (the known Q17)
    and on GitHub it measures the test site; the real pages share its templates and were measured by hand (T3-02).
    About's first visit on a phone is 218 KB: above the 180 KB for a text page, below the 400 KB for a page with a
    photo (T3-03). `/styleguide` is published, noindex and outside the sitemap, with sample text (T3-04).
18. **Your texts, not changed (report only).** Italian portrait alt ends with ` :(`; "italian", "germans" (About),
    "maltese", "relaxing infuse" (Now); the Italian About's last sentence has no full stop; the Italian home
    description is the older text; Home's intro says "start with the latest entry below" while there is none yet;
    About's description is 27 characters, short for search results. The privacy page names published and rejected
    comments, but a comment never moderated stays, with its email, until you moderate it (T5-02).

## 3. Checked and found fine

- **Suites on the fix branch:** lint and typecheck clean; unit tests 207 of 207; Worker tests 241 of 241; the full
  browser suite 770 passed (JavaScript on and off; 96 skipped by the suites themselves); html-validate on the test site and the real site; the real site’s smoke test 21 of 21 and its photo check 4 of 4.
- **The phone path, rehearsed** with the real Worker code behind a test sign-in, a GitHub stand-in starting from
  your empty journal, and a phone screen: sign-in refusals, the empty `/admin/write`, slugs (reserved ones refused
  clearly), a photo upload holding Publish, drafts on the server and on a second device, six GitHub failures with
  nothing lost, the file it writes, the publisher guard and the fast check scope on it, the built entry, edit,
  conflict detection, the Italian version and a second entry: numbers, hreflang, labels, feeds, sitemap.
- **The real site, looked at:** every page in both languages, light and dark, at 320 to 1440 px. No accessibility
  violation; AAA contrast in the text; focus, skip link, tab order, the theme button's name; deliberate empty
  states; the portrait uncropped with alt text in both languages; the 404 in both languages; print; icons at every
  size; titles, descriptions, canonical, hreflang, Open Graph, Person data; budgets (HTML 6 to 10 KB, one stylesheet
  of 7.4 KB compressed, 2 font files of 64 KiB, public JavaScript 1,410 of 1,536 bytes); no request to another site;
  no console error; no layout shift.
- **What ships:** no GPS or camera data in any image, rights fields on every photo; no fixture text, stand-in, local
  address or source map; the only unfilled brackets are the launch date; robots.txt, security.txt, feeds, sitemap.
- **The fixtures split:** the deployed pages are always the site's own build (run last, or built by the production
  job itself); a second build leaves nothing of the first; one entry in either language, both, a series of one or
  two photos: all correct. The Now fix is pinned by a test.
- **Security:** headers on 104 requests of every kind in staging and production mode: the exact security policy
  with the right fingerprint, noindex on everything in staging and only on `/admin` in production, no cookie, no
  cross-site access, redirects stay on the site. Forms refuse cross-site posts, forged or too-fast tokens and
  off-site report addresses, and escape what is typed. `/admin` stays closed in every misconfiguration tried. The
  upload lock closes on anything but exactly `"on"`; the photo copy never overwrites, deletes or prints a secret.
  `pnpm audit`: no known vulnerability. The public history holds no portrait image, key or private address.
- **Privacy:** every period on the privacy page matches the code (IP hashes 30 days, rejected comments 30 days,
  reports 12 months, 12 weekly backups), the same in English and Italian.
- **Launch configuration:** the production environment in `wrangler.jsonc` and the production deploy job exist and
  are right: custom domain, no workers.dev, EU database and buckets, invocation logs off, its own build and token.
- **Documents:** 781 of 806 names resolve (the rest are historical), no dead link, CLAUDE.md's folder map and its
  numbers are right, and the content check's messages name the file and the problem.

## 4. Could not check, and why

- **Anything on Cloudflare or GitHub:** the dashboard, Access, the real GitHub App, auto-merge, the real CI run, the
  buckets, Workers Logs, Email Routing. Outside this review's rules. Pull requests #34 to #40 were read from the git
  history. Dashboard labels in the runbook are marked where unverified.
- **Lighthouse on the real pages:** it stops with `NO_NAVSTART` on this laptop (Q17). Sizes were measured instead.
- **Firefox and WebKit:** they do not start on this laptop. They run on GitHub.
- **A real phone and Safari on iOS, real Slow 4G:** only emulated.
- **Whether Email Routing alone lets the Worker send the notification:** Cloudflare's documents disagree; the runbook
  says how to test it once after launch.
- **Whether `.es` can be registered for you:** the name's availability and the registry's identity rules were not
  queried.

Evidence (logs, screenshots, probe scripts) is on this laptop, outside the repository, in `review-shots/` and in
`.claude/worktrees/agent-*/review-shots/`.
