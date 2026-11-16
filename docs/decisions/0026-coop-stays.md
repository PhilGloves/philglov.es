# 0026 — Keep Cross-Origin-Opener-Policy; an engine's isolation notice does not count under rule 11

Status: Accepted · 2026-11-16 · Owner decision (QA finding BUG-9) · Extends the O4 ruling on rule 11 (CLAUDE.md, TICKETS.md)

**Context.** The Worker and `dist/_headers` send `Cross-Origin-Opener-Policy: same-origin` on every response
(`worker/src/headers.ts`; the QA brief, suite 9, asserts it). Safari/WebKit then writes a console warning on every page:
"This document is not cross-origin isolated because the Cross-Origin-Embedder-Policy header is missing (it must be
'require-corp'). window.crossOriginIsolated is false and SharedArrayBuffer is unavailable." QA measured that any COOP
value triggers a WebKit notice (`same-origin`, `same-origin-allow-popups` and `unsafe-none` all do; no header, none),
while Chromium logs nothing. Rule 11 says zero console errors or warnings, so the two rules met.

**Decision.** The site keeps the header. A browser engine's own notice about cross-origin isolation does not count as a
console warning under rule 11, as the owner ruled for the engine's "Failed to load resource" line on a 4xx page (O4).
Rule 11 still means: no error or warning from the site's own code, and nothing else.

**How it is tested.** `tests/e2e/qa/cross-browser.spec.ts` allows exactly that one message, word for word, at level
`warning`, and nothing else: a rule-11 test over four pages fails on any other console error or warning in Firefox and
WebKit, and a second test proves that a different level, wording or message is still a problem. The WebKit smoke tests
leave out only that message (`ignoreConsole` in `qa/lib.ts`). The test that tracked BUG-9 is now an ordinary test.

**Rejected.** Dropping COOP (it protects the site's windows from cross-origin openers, and the brief asks for it).
Adding `Cross-Origin-Embedder-Policy: require-corp` to silence the notice (a new security header with its own effects,
not asked for, not tried).
