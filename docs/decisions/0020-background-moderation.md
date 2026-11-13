# 0020 — Moderation in the background on /admin

Status: Accepted · 2026-11-13 · Owner request · Amends [0017](0017-backend-worker.md) (B4, `/admin/action`)

**Context.** On `/admin`, each moderation action was a plain form post: the Worker made the change and answered 303
back to `/admin?done=…`, so the page reloaded and jumped to the top after every approve, reject, reply, mark done or
delete.

**Owner decision (2026-11-13).** With JavaScript on, every moderation action is sent in the background and only the
affected row updates in place (status, buttons, counts); several items can be handled in a row with no reload and no
scroll. Delete keeps its confirmation. With JavaScript off, everything stays as it was. Same protections (Access and
CSRF on every request, same origin only, no inline handlers, text as text, CSP unchanged); when a background request
fails or the login has expired, the form is posted the normal way. Admin pages are not under the public 1.5 KB budget,
but the script stays small and apart from the public pages.

**How.**

- `/admin/moderation.js` (`MODERATION_SCRIPT` in `worker/src/admin/client.ts`, 2.7 KB raw): served by the Worker behind
  Access under the admin CSP, like `/admin/write.js`; each admin page loads only its own script
  (`adminPage({ script })`). One `submit` listener on the document takes the forms inside a card (`[data-row]`) whose
  action is `/admin/action`; the search by email stays a plain post. It sends the form's fields plus the button pressed
  with `fetch("/admin/action", { mode: "same-origin", redirect: "manual", Accept: application/json })`, so the browser
  adds the Access cookie and the `Origin`, the Worker checks the Access JWT, the origin and the CSRF token exactly as for
  a plain post, and a redirect (Access sending an expired login to its sign-in page) is never followed.
- The Worker answers a JSON request with a `RowReply` (`worker/src/admin/moderation.ts`): the row id
  (`comment-12`, `report-3`), the new state (`approved`, `rejected`, `done`, `deleted`), the notice line, the saved
  reply text after a reply, and the new counts. No HTML. Like the public forms (0018) it is always **200**, with
  `{ ok: false }` for a refused action (no confirmation, bad id, unknown action), so `fetch` never puts a 4xx line in the
  console. An item that no longer exists (deleted in another tab) comes back as `deleted`, "Already deleted."
- The page carries what the script needs, rendered by the Worker: `data-row` on each card, both Approve and Reject
  buttons with `hidden` on the one that does not apply (so without JavaScript the page looks as before), the reply block
  always present (`hidden` when empty), the counts in `<span data-count>` (admin bar and headings), and one empty status
  line per card (`.row-status`, `role="status"`, `tabindex="-1"`, hidden by `:empty`).
- The script changes only the cards of that item (an item can appear twice, e.g. in a search result and in the
  queue): badge text and class, which buttons show, the reply (text nodes and `<br>`, never markup), and the status
  line, which then takes focus so screen readers announce it; focusing an element already on screen does not scroll.
  A deleted item's card is emptied down to its status line, so its name, email and text leave the page.
- Fallback: on a network error, a non-200 answer, an answer that is not JSON (an opaque redirect, the 403 for an
  expired CSRF token) or `ok: false`, the form is marked `data-plain` and sent again with `requestSubmit(button)`, the
  normal post. Every action is idempotent, so a request that did reach the Worker is safe to repeat.
- Delete keeps its confirmation: the `required` box is checked by the browser before `submit` fires, with or without
  JavaScript.

**Expired Access login (open, O5).** Access answers an expired session with a redirect to its sign-in page on
`<team>.cloudflareaccess.com`. The admin CSP has `form-action 'self'`, and Chrome applies it to the redirect of a form
post, so the plain post is blocked (a console line, nothing happens on screen). That is already the behaviour without
JavaScript; the script's fallback reproduces it exactly, as asked, and a reload opens the sign-in page. Changing it
means changing the CSP (adding the team domain to `form-action`) or a different fallback for this one case (reload
instead of post): the owner's call, recorded in TICKETS.md.

**Tests.** `tests/worker/admin.test.ts`: the markup hooks, the JSON answer of every action, the confirmation, gone
items, refusals, and the same 403s for no or forged Access token, no or bad CSRF token, and another origin.
`tests/unit/admin-client.test.ts`: both admin scripts parse, use no `innerHTML`/`eval`, stay small, and
`moderation.js` fetches only `/admin/action`, same origin, without following redirects. `tests/e2e/admin.spec.ts`, in
Chromium with JavaScript on and off: approve, reject, mark done and reply in a row with no navigation and the view
staying put; counts; focus; reply markup shown as text; delete only when ticked; an item shown twice; and the three
fallbacks (network error, expired login, invalid CSRF token).

/admin cannot be opened through `pnpm preview` (no Access there, and no bypass), so `tests/e2e/admin-worker.ts` runs
the real Worker in the Playwright process behind a small HTTP server on 127.0.0.1 that acts as Access: it adds a JWT
signed with a key made for the run and answers the Worker's JWKS fetch, the same approach as `vitest.config.ts`. The
database is the real migration on Node's built-in `node:sqlite`. No new dependency.

**Rejected.** Returning each card's HTML and swapping it in (HTML insertion). Following redirects in `fetch` (an expired
login would land on a cross-origin page). Removing the row from the list after an action (the owner asked for the row
to update; a reload sorts the lists again). Answering 4xx to the background requests (console line, rule 11).
