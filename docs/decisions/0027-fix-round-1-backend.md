# 0027 — Fix round 1 (backend): front matter kept exactly, a working resend, clean drafts, the reported address

Status: Accepted · 2026-11-16 · Owner request (fix round 1 of 3) · Amends 0017, 0018, 0021 and 0023

_Amended by [0030](0030-security-audit.md): the 404 report form takes only an address a report accepts (never `//host`), and the notification calls a missing address "a missing address" instead of quoting it._

**Context.** An independent second opinion on the QA branch (SO-01 to SO-10, outside the repository) and the QA bug
list (`docs/qa/bug-reports.md`) found six backend problems the owner put in this round: SO-01 (front matter rejected
by the content check or silently changed by `/admin/write`), SO-02 (with JavaScript on, a form refused for an expired
token can never be sent), SO-03 (after a saved draft is published, "Write another entry" brings back an old copy of
it), BUG-4 ("Save draft" needs the description), SO-09 (a report sent from a missing address says `/404`) and the
`/_assets/` responses on staging, which rule 15 wants noindex like every other one. Before merging, the owner added
TO-01 from a third review (Publish during an upload leaves the photo out) and a clean local lint. SO-04 to SO-08, SO-10 and BUG-1,
-2, -3, -5 to -8 are for rounds 2 and 3.

## Decisions

**1. Front matter (SO-01).** Two readers, one for each publishing path, and neither a new dependency (rule 10):

- _The laptop path_ (`scripts/lib/content-check.ts`, also `pnpm new` for the twin's `originalLang`) reads front matter
  with Astro's own parser, `parseFrontmatter` from `astro/markdown`: a public export of `astro`, already a runtime
  dependency, and the function the content collections call. So the check accepts exactly what the build accepts
  (inline comments as in the guide's own example, single and double quotes, quoted dates, folded values), and YAML the
  build would refuse is now a clear problem ("the front matter is not valid YAML") instead of a pass.
- _The phone editor_ (`worker/src/frontmatter.ts`, used by `worker/src/entry-file.ts`) does not parse YAML into an
  object and write it back, because that loses comments, quotes and layout. It keeps the file's lines and reads a
  strict subset: top-level `key: value` lines whose value is one plain, single-quoted or double-quoted scalar on that
  line, with an optional `# comment`; blank and comment lines; indented and `- ` lines, which belong to the key above
  (an old `tags:` list). It shows the title and the description only when it reads them exactly; otherwise (a folded or
  literal block, a value over two lines, a flow list, an anchor or tag, a plain value YAML would turn into a number, a
  date, true or null) the entry is **not opened**, with "…cannot be edited here: <reason>. Edit it on the laptop, so
  that nothing else in it changes." A publish aimed at such a file is refused the same way (422). A file whose lines it
  cannot follow at all (a repeated key, a quoted key, a quote or bracket left open, a directive) is refused whole, so a
  line inside a value is never mistaken for a key.
- _Saving an edit_ (`editedEntryMarkdown`) replaces the title or description line only when its value changed
  (compared after the form's own cleaning), keeping the line's trailing comment and line end, and writes the new value
  JSON-quoted, which YAML reads back exactly. A missing description is added as a new line before the closing fence.
  Every other front matter line stays byte for byte: date, `comments`, both languages, comments in the YAML, the old
  `tags:` line. The text is written in the file's own line ends, after the blank lines the file already had there. An
  edit that changes nothing gives back the same file.
- _Change to 0023:_ an old `tags:` line was dropped when an entry was edited on the phone; it is now kept, like every
  line the editor does not own. It is still ignored everywhere.

_Rejected:_ a YAML parser in the Worker. It would read more forms, but it cannot write a file back byte for byte, which
is what the phone must do, and refusing what the line reader cannot keep exactly is sound without it. The subset is
held to Astro's parser by `tests/unit/frontmatter.test.ts`: every value the editor reads is compared with what Astro
reads.

**2. Resend after an expired token (SO-02).** The background answer (`FormReply`, 0018) gains `k`, the token for the
next send, which `src/scripts/forms.ts` puts in the form. It is a fresh token when the one sent can never pass again
(older than 24 hours, forged or empty: the "expired" message), as the page of a plain post already has; otherwise it is
the token sent, unchanged, so a "too fast" token still passes as soon as it is three seconds old and a refused field
does not restart the three seconds. A fresh token is three seconds old only after three seconds, exactly as without
JavaScript. Public JavaScript is now **1,535 of 1,536 bytes**: the new line costs 18 bytes, paid by testing the action
with a regular expression and filling the alert's title with `append` (the same result on a new, empty element).

**3. Drafts on the phone (SO-03).** A first "Save draft" moves the text from the form's browser copy (the new-entry
form, `philglov-write:new`, or an edit of a published entry, `philglov-write:edit-<lang>-<slug>`) to the server draft,
which has its own copy. The redirect names the copy it came from (`&moved=…`, accepted only in those two forms), and
the draft page's script removes that copy once and drops the parameter from the address with `history.replaceState`,
so reloading that page later never removes a newer copy typed since. Publish still clears the draft's own copy
(`data-clear`). After Publish, "Write another entry" opens an empty form, and an edited entry reopens from its file.
_Rejected:_ clearing `new` on every Publish of a new entry (it would throw away a different entry still typed only in
the browser); comparing times (the phone's clock and the Worker's may differ).

**4. Save draft without the browser's checks (BUG-4).** "Save draft" has `formnovalidate`: a draft is what is not
finished, so a missing description or alt text does not stop it. The server never validated drafts. Publish keeps both
the browser's checks and the server's.

**5. Reports from a missing address (SO-09).** The Worker answers a missing address with the one built 404 page and
now writes the address the visitor asked for (its path, never the query) into that page's report form, at most 300
characters as a report accepts (longer ones keep `/404`). A refused report, shown again on that language's home as
before, keeps the address in its form, so the second try names it too. The thank-you is still on that language's home:
a missing address has no page to come back to.

**6. Staging assets are noindex (rule 15).** The `/_assets/*` rule of `dist/_headers` (`assetHeaderLines` in
`worker/src/headers.ts`) now says noindex itself outside production: it detaches the `/*` rule's `X-Robots-Tag`
(`! X-Robots-Tag`) and writes `noindex, noai, noimageai`. Cloudflare's asset server (the same code `wrangler dev` runs)
joins two matching rules, so these files were already served with `noindex, noai, noimageai`; the second opinion's own
header record shows it. The rule no longer depends on that joining or on the order of the rules. Production is
unchanged: `noai, noimageai`, no noindex.

**7. No photo dropped by an early Publish (TO-01, added from the third review).** With JavaScript on, a photo the
writer picked now has its row (name, progress, Remove) from the moment it is picked, not only once its upload starts.
While any photo is waiting, uploading or waiting to retry, Publish and Save draft are held: the form is not sent, and
an alert above the buttons says "Not yet: 1 photo is still uploading. Publish and Save draft work as soon as it has
finished, or remove it." The alert goes, and both buttons work again, when the last upload finishes or is removed
(Remove aborts the request or the pending retry). A photo that failed after five tries or was refused keeps its row and
its message, so it is never left out without a word. Without JavaScript there are no uploads, so nothing changes.
_Rejected:_ sending the form by itself once the uploads finish (the writer may have moved on, and a photo still needs
its alt text before Publish passes); disabling the buttons (a disabled button explains nothing and leaves the keyboard).

**8. Local lint.** `.claude/` (Claude Code's local settings and other sessions' worktrees, each a copy of the repo) is
in `.gitignore`, `.prettierignore` and the ESLint ignores, so `pnpm lint` is clean on a machine that has them.

## How it is tested

Each fix has tests that failed before it and pass after (checked by running them on the old code):
`tests/unit/frontmatter.test.ts` with the variants in `tests/worker/frontmatter-variants.ts` (content check, the line
reader against Astro's parser, edit round trips, LF and CRLF) and the same variants through open, edit and publish
against the GitHub stand-in in `tests/worker/write.test.ts`; the token answers in `tests/worker/forms.test.ts` and the
whole expired, refused, resend, sent cycle for both forms, JavaScript on and off, in `tests/e2e/qa/forms.spec.ts`; the
save draft, edit, publish, write another cycle (and the same for an edit) and BUG-4 in `tests/e2e/qa/phone.spec.ts`,
whose `test.fail()` marker is removed; TO-01 there too, with the upload request held as in the third review's probe
(Publish and Save draft held with the message, then the entry sent with its photo; or the photo removed and the entry
sent without it); the missing-address reports in `tests/worker/forms.test.ts`; the asset rule in
`tests/unit/headers.test.ts`, `tests/unit/build-output.test.ts` and `tests/e2e/qa/rights.spec.ts`.
