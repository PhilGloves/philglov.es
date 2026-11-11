# 0004 — No CAPTCHA: honeypot, signed timestamp, rate limit, link cap

Status: Accepted · 2026-11-11 · Source: docs/guide.md, Decision guide #4–6

**Decision.** Both forms (comment and error report) are plain HTML POSTs to the Worker. Spam is stopped by a hidden
honeypot field, an HMAC-signed timestamp the Worker writes into each form as it serves the page (rejected if under 3 s
or over 24 h old), a rate limit per salted IP hash (5 per 10 minutes), and at most 2 links per comment. Comments are
pre-moderated. Turnstile is kept only as an emergency switch.

**Reason.** Zero third-party scripts, and both forms work with JavaScript off. Fake CAPTCHAs are exactly the ClickFix
lure, so a site that never shows one teaches readers to distrust any that appears.

**Rejected.** reCAPTCHA and Turnstile (third-party script, tracking). Disqus and Giscus (external widget, accounts).
Webmentions only (too few readers can send them).
