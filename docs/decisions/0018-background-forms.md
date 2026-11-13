# 0018 — Forms sent in the background, instant jump without JavaScript

Status: Accepted · 2026-11-13 · Owner request · Amends [0016](0016-frontend-pages.md) (form contract) and
[0017](0017-backend-worker.md) (form answers)

**Context.** After sending a comment or a report, the page reloaded, showed its top, then glided down to the
message: a full navigation, then smooth scrolling (`scroll-behavior: smooth`) to `#comment-status`. Brief rule 3
allowed JavaScript on public pages "only for the light/dark toggle".

**Owner decision (2026-11-13).** With JavaScript on, both forms are sent in the background and the answer appears in
the existing status slots, with no reload and no scroll jump, and focus moves to the message so screen readers announce
it. With JavaScript off, today's behaviour stays, but the jump to the status slot is instant. Public JavaScript stays
within the 1.5 KB budget, same origin only, no inline handlers, text as text, the CSP unchanged.

**How.**

- `src/scripts/forms.ts`, loaded by `FormGuard.astro`: Astro bundles it once per page to `/_assets/*.js` as a module
  (`vite.build.assetsInlineLimit: 0`, or Astro would inline it and the CSP would need a second hash). It listens for
  `submit` on forms whose `action` is a relative `/api/` path, sends `fetch(…, { mode: "same-origin", Accept:
application/json })`, and places the answer with `textContent` only. On anything unexpected (network error, an answer
  that is not JSON, such as an expired Access session redirecting away) it falls back to `form.submit()`, the plain
  post.
- The Worker answers a request whose `Accept` has `application/json` with `FormReply` (`worker/src/page.ts`): the
  status slot id, the title, one ready-made line (thank-you, form-level message, or the field problems joined) and
  every field with its message ("" when valid). The script needs no strings and stays small. The answer is always
  **200** with `ok: false` for failures: a 4xx answer to `fetch` makes Chrome log "Failed to load resource" in the
  console (rule 11). Plain posts keep the brief's 303, 422 and 429.
- Budget, counted strictly as raw bytes per page: the inline theme script (855) plus the form script (670) = 1,525 of
  1,536 (646 bytes brotli). `tests/unit/build-output.test.ts` enforces it for every built page, together with
  same-origin `/_assets/` sources only, no inline event handlers, and that the form script is the only script file.
  There are 11 bytes left: any change to either script must stay inside them.
- Without JavaScript: the form actions carry the status fragment (`/api/comment#comment-status`,
  `/api/report#report-status`), so a 422 page also opens at the message instead of at the top (the 303 already ended in
  that fragment). `site.css` turns smooth scrolling off while a status slot is the target
  (`html:has([data-slot$="-status"]:target)`), so the jump is instant; everywhere else the smooth scroll stays. Both
  status slots have `tabindex="-1"`, so the script can focus them and a fragment jump moves focus there too.

**Tests.** `tests/e2e/forms.spec.ts` checks both paths in Chromium, with JavaScript on and off, with reduced motion off
and no console noise allowed. With JavaScript on: no navigation, the message in the slot, focus on it, the view does not
return to the top, field errors next to their fields with `aria-invalid`, the report form too, and the only POST going
to this origin's `/api/`. With JavaScript off: the URL ends at the slot, `scroll-behavior` is `auto` there and the view
does not move afterwards (verified to fail with the CSS rule removed), and a 422 opens at the alert.
`tests/worker/forms.test.ts` covers the JSON answers.

**Rejected.** Returning the page's HTML to the script and copying the slots over (HTML insertion, larger answer).
Building the error summary as a list of links in the script (over budget; the page still has the list without
JavaScript). A second inline script with its own hash (the build allows exactly one inline script). Turning smooth
scrolling off site-wide (it is the design's choice for in-page links).

**Open.** A plain post that fails gets the brief's 422 (or 429), and Chrome reports any 4xx page in the console, as it
does for the 404 page. TICKETS.md O4 asks the owner whether that counts against rule 11.
