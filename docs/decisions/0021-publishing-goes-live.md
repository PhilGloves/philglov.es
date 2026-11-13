# 0021 — Publishing goes live by itself; editing from the phone; no view transitions

Status: Accepted · 2026-11-13 · Owner decisions · Amends [0017](0017-backend-worker.md) (B8, `/admin/write`),
[0020](0020-background-moderation.md) (O5) and [0014](0014-design-system.md) (view transitions)

## Owner decisions (2026-11-13)

1. **Publish goes live by itself.** Pressing Publish opens the pull request as before and turns on GitHub auto-merge, so
   it merges as soon as the required Test check passes, and the merge deploys. Only publisher pull requests that
   touch nothing but entry files may auto-merge, enforced by an inline step in the CI workflow (which the App cannot
   change) as part of the Test check. Every other pull request still waits for the owner. After Publish the page says
   the entry will be live in a few minutes, with the link; a publisher pull request still open after 15 minutes shows
   as "needs attention", with its link.
2. **Editing a published entry from the phone.** `/admin/write` lists the published entries, newest first, with a
   search by title. Tapping one loads its title, topics, text, photos, alt text and captions into the same form.
   Saving opens a pull request that changes only that entry's file and auto-merges under the same rule. The slug and
   the language cannot be changed while editing, so links never break. If the entry changed on GitHub since it was
   opened, the page says so instead of overwriting it.
3. **O5, expired Access login on `/admin`:** keep the admin CSP as it is. When a background request finds the login
   expired, the page reloads so Access can show its sign-in page.
4. **Q19:** do not investigate. Remove the page-to-page fade (the view-transition rule) from the stylesheet.

## How

**Auto-merge.** `openPullRequest` (`worker/src/github.ts`) now returns the pull request's number and GraphQL id, and
`enableAutoMerge` calls `enablePullRequestAutoMerge` with `mergeMethod: MERGE` (the repository's merge commits).
That needs "Allow auto-merge" on in the repository settings (turned on 2026-11-13, `docs/setup.md` step 10b) and **no
permission beyond the App's Contents and Pull requests: write**. GraphQL reports a refusal with status 200 and an
`errors` list; the Worker treats that as a failure. If auto-merge cannot be turned on, the pull request is still open
and the page says so, with the step and status, and asks for a manual merge. The ruleset "Protect main" is unchanged:
pull request required, `Test` required, 0 approvals, no bypass. Auto-merge only waits for what it already requires.

**The guard, in `.github/workflows/ci.yml`.** The first step of the Test job, written inline, runs only when the pull
request's author is `philglov-publisher[bot]` (the login GitHub gives the App; `PUBLISHER` in `github.ts`). On a pull
request the checkout is GitHub's merge commit, whose first parent is `main`, so `git diff --name-status --no-renames
HEAD^1 HEAD` is exactly what merging would change. Every line must be an addition or a modification of
`src/content/journal/{en,it}/<slug>.md` (the slug rule of the content schema). Anything else fails the step and so the
required check: another path, a deletion, a rename (seen as deletion plus addition), another folder, or no change at
all. The App cannot edit this file. Changing anything under `.github/workflows/` needs the Workflows permission, which
it does not have and must never get (`docs/setup.md` step 10). Other pull requests skip the step, and nothing turns on
auto-merge for them. `tests/unit/publisher-guard.test.ts` reads the step from `ci.yml` and runs it against real merge
commits in a throwaway repository: 2 cases that must pass and 11 that must fail.

**What's on its way.** `/admin/write` asks GitHub for the open pull requests on `main` (`openPublications`, Pull
requests read) and lists the publisher's ones. Those younger than 15 minutes (`ATTENTION_AFTER`) show as "going live";
older ones as "needs attention", with "open the pull request to see which check failed". Nothing is stored. If GitHub
cannot be asked, one quiet line says so and the form still works. Reading check results would need the Checks
permission, which the App does not have; the 15-minute rule needs none.

**Editing.** The build's `entries.json` now carries each entry's `date`. The list (`entriesFor`) sorts by date, newest
first, and the search matches the title ignoring case and accents. The list is a plain GET form, so it works without
JavaScript, and a title is not personal data. It shows the newest 30, and a search finds the rest. Each entry links
to `/admin/write?edit=1&slug=…&lang=…`. The slug must match the slug rule before any file is read. The form opens with
the file's blob sha in `base_sha`, the slug `readonly`, and the language shown as text with a hidden field.
`splitPhotos` takes back out the photo paragraphs after the last text that `entryMarkdown` wrote for this slug. They
reappear as photo items with alt text and caption, escapes undone. A photo in the middle of the text, or of another
slug, stays in the text, so saving changes nothing the form did not show. Saving rewrites the file with
`entryMarkdown`. The date, `originalLang` and `comments` come from the file. The schema is `.strict()` with exactly
those seven fields, so nothing else can be lost. `parseEntry` also reads a block-style topic list (`tags:` followed
by `- travel` lines). A file whose frontmatter it cannot read is not opened for editing.

**Not overwriting.** An edit is refused (409) unless the file on `main` still has the sha it was opened with. The
page says the entry changed on GitHub since it was opened, keeps the text, and links to the current version. The
same check makes the fixed slug and language binding: another slug or language points at another file (or none),
which cannot have that sha. The write itself sends the sha too, so GitHub refuses the write (409) if the file changes
between the check and the write, and the page shows the same message. A new entry on a slug that already exists in
that language is still refused, now with a link to edit it. A draft saved while editing keeps its `base_sha`
(migration `0002_draft_base_sha.sql`) and reopens in edit mode. The autosave in the browser uses its own key per
entry being edited.

**O5.** `/admin/moderation.js` treats an `opaqueredirect` answer as the expired login (the Worker never redirects a
JSON request) and calls `location.reload()`. That is a plain GET, so Access's redirect to its sign-in page is allowed.
Without JavaScript, the post is still blocked by `form-action 'self'` (the CSP stays as it is), and a reload signs in.
`/admin/write` is a plain post, so an expired login blocks Publish the same way. The text is kept in the browser's
autosave, and a reload brings it back after signing in.

**Q19.** `@view-transition`, the `::view-transition-*` rules and the `view-transition-name`s are gone from
`site.css`, so the page fade and the grid-to-photo morph are gone too. Page changes are plain navigations.
`tests/unit/css.test.ts` keeps them out, and `tests/e2e/navigation.spec.ts` clicks through the site with motion allowed
and expects an empty console. With the old rule back, that test fails with Chromium's "Transition was aborted" errors.
This goes against the guide's design section, which asked for transitions; the owner's decision wins, and the guide
is not edited.

## Tests

- `tests/worker/write.test.ts`: auto-merge requested with the pull request's id, and refused; the list of open pull
  requests and the 15-minute rule; the list and search of published entries; opening an entry (fields, photos, fixed
  slug and language); saving (one file, the sha it was opened with, frontmatter kept, auto-merge); the conflict
  before and during the write; a slug or language change refused; drafts of edits; a slug that is not a slug; a file
  that cannot be read; reading photos back. The GitHub stand-in in `vitest.config.ts` is shared by all test files, so
  every test that uses it lives in this one file.
- `tests/unit/publisher-guard.test.ts`: the CI step itself.
- `tests/e2e/admin-write.spec.ts` (JavaScript on and off) and `tests/e2e/navigation.spec.ts`; `tests/e2e/admin.spec.ts`
  now runs with motion allowed, and its expired-login test expects the reload to Access's sign-in page.

## Not verified

- A real auto-merge on GitHub: it needs a real publish from staging (the owner's Access login) and the ruleset's
  `require_extra_approval_for_unattributed_changes` setting, which is on and not documented. With 0 required approvals
  it should have no effect, but if a publisher pull request waits for a review, that setting is the first suspect.
- The guard on a real GitHub runner (the unit test runs the same script locally).
- Access's actual answer to a `fetch` after the session expires (the e2e test imitates the redirect).

## Rejected

- Checking the paths in the Worker only: the Worker is what the guard protects against, so the check must be where
  the App cannot reach.
- Branch-name or label rules for auto-merge: the App can set both.
- Storing publications in D1 to track them: GitHub already knows which pull requests are open.
- Letting the phone change the slug or language with a redirect left behind: the owner wants links never to break, and
  the site has no redirects.
