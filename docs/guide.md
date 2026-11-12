# Personal Hub Website — Decision Guide & Agent Prompts

Build guide for philglov.es · exported 12 November 2026 (Crimson Pro, no AI translation)

## TL;DR

Build a fully static site with Astro, write every page as a Markdown file in a Git repo, and serve it from Cloudflare. One small server program (a Worker) plus a small SQLite database (D1) handles the comment form, the anonymous error form and a private page for publishing from your phone. Zero third-party scripts, no CMS, and no password anywhere: the private admin area opens only with a one-time code emailed to you.

- **Look:** the v3 prototype ("Index × v1"): a Swiss-style grid with section labels on the left, one typeface, Crimson Pro, with light titles and small tracked labels, and moss green as the one accent, on a near-white light theme and a #141513 dark theme.
- **Weight:** a text page under \~180 KB on first visit, about 1 KB of JavaScript (only the theme toggle), and everything still works with JavaScript off.
- **Languages:** English at `/`, Italian at `/it/`. Every page says which language you wrote it in and links to the other version once you've written it. You translate by hand; nothing is translated by AI.
- **Comments:** a Sivers-style form (name, email, comment) that posts to your own Worker. You approve each comment before it appears. No CAPTCHA, no Disqus, no external widget.
- **Safety:** a strict Content Security Policy that only allows your own files, passkeys on every account, and no plugins. This closes the door ClickFix attacks usually walk through.
- **Cost:** €0/month on Cloudflare's free tier for a personal site's traffic, plus the domain, and GitHub Pro only if you make the repository private.

## What to take from the three reference sites

Take Sivers' structure, Riccardo's editorial confidence, and Scrivi.la's calm; leave the clutter of all three.

| Site | Keep | Leave |
| --- | --- | --- |
| [sive.rs](https://sive.rs/) | Plain HTML that loads instantly. /about and /now as fixed anchors. Article lists that lead with the date. A 10-second "me" summary on the home page. Comments under each post, numbered, with his short replies inline ([example](https://sive.rs/fit)). A visible honesty note about how the content is made. | The home page is a wall of links; it has no visual hierarchy or imagery. |
| [riccardo.im](https://riccardo.im/) | Built with Hugo, so it is also a static site. Big editorial headlines, a strong wordmark, and only four nav items. | The vertical social bar, the auto-advancing carousel (users rarely see past slide one), and the support badge competing with the logo. |
| [scrivi.la](https://scrivi.la/) | Distraction-free, type-led, one column, a near-black #171717 theme colour. | Nothing to remove. Its calm carried into v3; its single calm serif led to Crimson Pro (scrivi.la's own font, Tiempos, is paid). |

The one idea to steal above all: Sivers' homepage answers "who is this?" in 10 seconds, then gets out of the way. Your v3 home page does the same: one statement, the latest entry, and one photograph.

## Decision guide

Every pick below favours fewer moving parts over features; each "why" names the trade-off you accept.

| # | Decision | Options considered | Pick | Why |
| --- | --- | --- | --- | --- |
| 1 | Site engine | Hand-written HTML · Eleventy · Hugo · Astro | **Astro (current stable release), static output** | Ships zero JavaScript by default, typed frontmatter (catches a missing `lang` field at build), built-in i18n routing and image optimisation. Since version 6 it has built-in Content Security Policy support; version 7 is current in November 2026, and nothing in this plan depends on the exact version. Its team joined Cloudflare in Jan 2026 and it stays MIT open source. *Paranoid alternative:* Hugo, a single binary with no npm packages at all, so the smallest supply chain. |
| 2 | Where content lives | Headless CMS · WordPress · Markdown in Git | **Markdown files in a private GitHub repo** | No CMS and no password to steal: the only private area is /admin, behind Cloudflare Access, and it can only moderate comments and open pull requests. Gizmodo's 2026 ClickFix incident came from one compromised account that could inject a script. Git also gives you full history of every page. |
| 3 | Hosting | Cloudflare Workers · Netlify · GitHub Pages · EU VPS (Hetzner + Caddy) | **Cloudflare Workers with Static Assets** | Cloudflare Pages is in maintenance mode; Workers is where new static sites go. Every page view passes through the Worker, which adds the form tokens and the comments, and the free tier covers 100,000 Worker requests a day; images, CSS and fonts are served directly and don't count. Past that limit pages return errors until the next day, so move to the paid Workers plan if you ever get close. D1 gives 5M row reads and 100K writes per day. *EU-only alternative:* a €4–5/month Hetzner VPS with Caddy, if you want everything run by an EU company. On Cloudflare, the database and photo storage are created in its EU jurisdiction. |
| 4 | Comments | Disqus · Giscus · Webmentions · own form | **Own HTML form → Worker → D1, pre-moderated** | Works with JavaScript off. No external script. You approve each comment from an admin page protected by Cloudflare Access (email one-time code, no password in your code). Approved comments are injected into the static page at the edge with HTMLRewriter, so they appear within a minute, without a rebuild. |
| 5 | Spam protection | reCAPTCHA · Cloudflare Turnstile · invisible checks | **Honeypot field + signed timestamp + rate limit + link cap** | Zero third-party scripts. And since fake CAPTCHAs are exactly the ClickFix lure, a site that never shows a CAPTCHA teaches readers to distrust any that appears. Keep Turnstile only as an emergency switch if spam explodes. |
| 6 | Footer error form | Mailto link · third-party form service · own endpoint | **Same Worker, `/api/report`** | Inside a `<details>` disclosure so it costs nothing until opened. Sends the page URL automatically; email optional. No IP stored, only a salted hash for rate limiting, deleted after 30 days. |
| 7 | Light/dark | CSS only · CSS + toggle | **CSS follows the system; a \~1 KB inline script adds the toggle and remembers the choice** | The script runs in `<head>` so there is no flash of the wrong theme. With JS off, the system setting still works. |
| 8 | Languages | Subdomains · `/en/` + `/it/` · English at root + `/it/` | **English at `/`, Italian at `/it/`** | Shortest URLs for the wider audience, clean `hreflang` pairs. Never auto-redirect by browser language: it traps people and confuses search engines. |
| 9 | Translation | Live translate widget · build-time AI · manual | **You translate by hand, when you choose to** | No AI and no outside service touches your words. An entry can stay in one language for as long as you like; the other language's index still lists it, marked as not translated. |
| 10 | Photos | Flickr/500px embeds · lightbox library · own pages | **Build-time AVIF/WebP/JPEG with `srcset`; each photo has its own page** | No lightbox JS; every photo gets a shareable URL with large image, caption, and camera data. GPS is stripped from files (privacy); originals stay in private storage, and published files carry your copyright and a no-AI-training mark. |
| 11 | Analytics | Google Analytics · Plausible · Cloudflare Web Analytics · none | **None on the page; use Cloudflare's server-side traffic stats** | No beacon script, no cookies, so no cookie banner. Even Cloudflare's own Web Analytics injects a script, so skip it. |
| 12 | Search | Algolia · Pagefind · none | **None at launch; add Pagefind later** | Pagefind builds a static index and loads its small script only on `/search`. |
| 13 | Feeds | None · RSS/Atom | **One feed per language** | Costs nothing, and readers who follow personal sites expect it. |

## Design system: what the research says, and what we do with it

People are astonished by a site that feels familiar to use but surprising to look at, so the layout stays conventional and the craft goes into type, photographs and small details.

### The research behind the choices

The studies below are well-established findings cited from memory; check the exact papers before quoting them publicly.

| Finding | Source | What we do |
| --- | --- | --- |
| Visitors judge a site's appeal in about 50 ms, and that judgement sticks. | Lindgaard et al., 2006 | The first viewport is your name, one statement about what you write, and the top of one photograph. Nothing else competes. |
| Sites with low visual complexity and a familiar (prototypical) layout are rated most beautiful. | Tuch et al., 2012 (Google) | Nav at top, labels left and content right, footer at bottom. No vertical social bar, no carousel. |
| People prefer designs that are "most advanced, yet acceptable": novel details on a typical frame. | Hekkert, Snelders & van Wieringen, 2003 (Loewy's MAYA principle) | Conventional structure; surprise comes from typographic scale, light serif titles, and photo art direction. |
| Things that are easy to perceive feel more beautiful and more true. | Reber, Schwarz & Winkielman, 2004 (processing fluency) | High contrast, generous spacing, one reading font, a 60–70 character line. |
| Good typography puts readers in a better mood and makes reading feel easier. | Larson & Picard, 2005 | A screen-designed serif at 18–20 px with 1.6 line height. |
| The fastest font differs from reader to reader. | Wallace et al., 2022 | Sizes in `rem` so browser font-size settings and zoom always work. |
| Dark text on a light background gives better legibility and proofreading. | Piepenbrock et al., 2013 | Light theme is the reading default; dark is offered, and suits the photo pages. |
| A single element that differs from the rest is noticed and remembered. | von Restorff isolation effect | One accent colour, moss green: the active nav item, links on hover, markers, buttons and the Now band. |
| People prefer gently curved objects to sharp ones. | Bar & Neta, 2006 | Pill-shaped buttons and 5 px corners on inputs; photos stay square-cornered. |
| Beautiful interfaces are perceived as easier to use. | Kurosu & Kashimura, 1995 | Polish the form fields and focus states as much as the hero. |
| Experiences are remembered by their peak and their end. | Kahneman's peak-end rule | Design the end of each post carefully: a short sign-off, the "Your thoughts?" form, then a calm footer. |

### Typography

Chosen in the v3 prototype ("Index × v1"), now set in one typeface, Crimson Pro, free under the SIL Open Font License and self-hosted as WOFF2:

- **Titles:** Crimson Pro Light (weight 300), only at 28 px and larger. The home statement, entry titles, the reply heading, and pull quotes in italic.
- **Text and interface:** Crimson Pro Regular (400), with 600 for emphasis and index numbers. Entry bodies, excerpts, the Now paragraph, the navbar, the journal table and the footer.
- **Small labels:** the same typeface, small and muted, with tabular figures; column headings are uppercase and tracked. Dates, IT→EN markers, camera data, captions, the domain under your name. Code samples use the reader's system monospace, which adds no download.
- Budget: 2 files (upright with weights 300–600, italic with weights 300–400), about 66 KB against an 80 KB cap, Latin subset (covers à è é ì ò ù), `font-display: swap`, only the upright file preloaded. Crimson Pro has no arrow glyphs, so interface arrows are one small inline SVG.
- Sizes: interface 19 px desktop / 18 px phone; reading text 22 px desktop / 20 px phone; latest-entry title 42 px; home statement and entry titles up to 64 px (40 px on phones); sections spaced about 72 px apart (56 px tablet, 44 px phone).

### Colour

Moss green is the single accent. Body text stays above 7:1 contrast, everything else above 4.5:1; QA verifies every pair.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | #FBFBF8 (near-white) | #141513 |
| `--text` | #141414 | #ECECE7 |
| `--muted` | #5B5B57 | #A3A49D |
| `--rule` | #E0DFD9 | #2D2F2A |
| `--accent` (moss) | #4A5D23 (about 7:1 on the background) | #A9BF78 |
| `--band` (Now section) | #4A5D23 with #F4F6EE text | #232C17 with #E6ECD6 text |

Why moss: green reads as calm and natural and suits outdoor photography, and it steps away from the cream-and-orange look that so many AI-made sites share now. It appears on the active nav item, links on hover, IT→EN markers, buttons, and once as a full-width band behind Now.

### Motion

- Cross-document View Transitions (pure CSS, `@view-transition { navigation: auto; }`): page changes fade and photos morph from grid to their own page where browsers support it. Zero JavaScript.
- 150–250 ms ease-out for hovers and focus. Nothing loops, nothing autoplays.
- Everything off under `prefers-reduced-motion: reduce`.

### Art direction per breakpoint

| Width | Layout | Navigation | Photos |
| --- | --- | --- | --- |
| 1440 | 12-column grid: section labels and entry details in the left 3 columns, content in the right 9; reading text capped at about 66 characters | One row: name with philglov.es beneath, then Journal · Photos · Now · About, then the language link and the Dark button at the far right | 3 columns, one image spanning 2 columns per row |
| 1024 | Labels move above their content; one content column | Name and controls on the first row, the four links on a second row | 3 columns, same rhythm |
| 768 | As 1024, with tighter spacing | Two rows, no hamburger | 3 columns; hero stays 21:9 |
| 390 | One column, 20 px side margins; the journal table becomes stacked rows | Two rows; the four links fit, so there is no menu button | 1 column, full-bleed; hero cropped to 4:5 via `<picture media>` |

The hero photograph gets a separate crop for each breakpoint (landscape on desktop, portrait on phone), not just a smaller copy.

## Security model and performance budget

The site is safe because almost nothing runs: static files, one small Worker (two form endpoints and a private admin area), and a browser policy that refuses any script you did not ship.

(Architecture diagram omitted in this export: visitors reach static files and one Worker on Cloudflare; the Worker uses the D1 database, R2 storage and the Access gate; the owner publishes through GitHub from laptop or phone.)

Only the Worker (highlighted) runs code. Everything a visitor reads is a pre-built file, and the site changes only when a pull request, from your laptop or your phone, passes the tests and you merge it.

### Why this blocks ClickFix-style attacks

ClickFix attacks inject a script into a legitimate site that shows a fake CAPTCHA and tells visitors to paste a command into their computer. The injection usually comes through a stolen account or a vulnerable CMS plugin, as in the [Gizmodo incident](https://hackmag.com/news/gizmodo-clickfix) and the [WordPress campaigns](https://vpncentral.com/?p=252115). Here there is no CMS and no plugin, and even if HTML were tampered with, the Content Security Policy would stop any script that is not yours.

### Rules for the build

- **Content Security Policy** (sent as a header by the Worker): `default-src 'self'; script-src 'self' 'sha256-<theme-script-hash>'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests`
- **Other headers:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation and payment, `Cross-Origin-Opener-Policy: same-origin`.
- **Zero third-party origins.** Fonts, images, CSS and JS all come from your domain. QA fails the build if any page requests another host. Inline style attributes are not used either: the policy blocks them, so per-photo placeholder colours go into the stylesheet. Cloudflare's own extras that add scripts or cookies stay off (Email Address Obfuscation, which is on by default, Bot Fight Mode, Web Analytics automatic setup, Speed Brain, Rocket Loader, Zaraz, Cloudflare Fonts).
- **Accounts:** passkeys or a hardware key on GitHub, Cloudflare and your domain registrar. Branch protection on `main`. These three accounts are now the real attack surface.
- **Dependencies:** fewer than 10 direct packages, a committed lockfile, pnpm with install scripts allowed only for named packages (e.g. `sharp`), and Dependabot alerts on.
- **Forms:** server-side validation, length caps (name 80, email 254, comment 5,000 characters), store plain text only and escape on output, max 2 links per comment, honeypot field, an HMAC-signed timestamp that the Worker writes into each form as it serves the page (reject submissions faster than 3 seconds or older than 24 hours), and a rate limit per hashed IP.
- **Admin:** `/admin` sits behind Cloudflare Access (email one-time code). The Worker also checks the Access JWT itself, so a misconfigured route cannot expose it.
- **Privacy:** a short `/privacy` page in both languages: its text is in the Rights, AI training and privacy section. No cookies, so no cookie banner. Add `/.well-known/security.txt`.

### Performance budget

QA treats every row as a failing test, not a goal.

| Metric | Budget |
| --- | --- |
| HTML per text page | ≤ 30 KB compressed |
| CSS, whole site | 1 file, ≤ 20 KB compressed |
| JavaScript | ≤ 1.5 KB (theme toggle only); 0 KB needed for any content or form |
| Fonts | ≤ 2 files, ≤ 80 KB (Crimson Pro upright 300–600 and italic 300–400; Latin subset; the italic is not preloaded) |
| Text page, first visit total | ≤ 180 KB |
| Photo page, first screen on a phone | ≤ 400 KB |
| Largest Contentful Paint | < 2.0 s on throttled "Slow 4G", mid-range Android profile |
| Cumulative Layout Shift | < 0.05 (every image has width and height) |
| Interaction to Next Paint | < 100 ms |
| Lighthouse (all four categories) | 100 target, 95 hard floor |

Old devices: content must be readable with CSS off and fully usable with JS off. Test at least on an old Safari (iOS 15) and an older Android Chrome.

## Accessibility requirements

Target WCAG 2.2 level AA everywhere, with AAA contrast for body text; each item below is a test QA must pass.

- [ ] Semantic HTML: one `<h1>` per page, headings in order, `<header>`, `<nav aria-label>`, `<main id="main">`, `<article>`, `<footer>`, real `<button>` and `<a>` elements only.
- [ ] Skip link as the first focusable element ("Skip to content" / "Vai al contenuto"), visible on focus.
- [ ] Visible focus on everything: 2 px outline in the accent colour with 2 px offset, via `:focus-visible`, never removed.
- [ ] Full keyboard use: Tab order follows reading order, the theme toggle, language switch, error-report disclosure and both forms work without a mouse.
- [ ] Descriptive alt text on every photo (what is in it and why it matters, written by you in both languages). Purely decorative images use `alt=""`.
- [ ] `lang="en"` or `lang="it"` on `<html>`; any phrase in the other language inside a page wrapped in `<span lang>` so screen readers switch pronunciation.
- [ ] Contrast checked in both themes, including placeholder text, focus rings and the accent on hover.
- [ ] Forms: every field has a visible `<label>`, errors are shown in text next to the field and announced (`aria-describedby`, `role="alert"` on the summary), success messages are announced.
- [ ] Theme toggle is a `<button aria-pressed>` with a text label, not an icon alone.
- [ ] Touch targets at least 24×24 px (44×44 for main nav on phones).
- [ ] Text resizes to 200% and the layout reflows at 320 px width with no horizontal scrolling.
- [ ] `prefers-reduced-motion` and `prefers-contrast` respected.
- [ ] Language switch links point to the matching page, not the homepage, and are labelled in the language they lead to ("Italiano", "English").

## SEO: ranking first for "Filippo Guanti"

The domain is **philglov.es** ("Phil Gloves", from *Filippo Guanti*). A name search is won by telling Google, clearly and in many places, that this site *is* Filippo Guanti, not by the domain's spelling.

### What the domain choice means

| Factor | Effect | What we do |
| --- | --- | --- |
| Name not in the domain | Google learns the site's owner from page titles, headings, structured data and links instead. A name with little competition, as yours appears to be, still ranks first. | Every signal below repeats "Filippo Guanti". |
| `.es` is Spain's country code | Google treats country-code domains as aimed at that country by default, and this can't be changed in Search Console. Little effect on searches for your exact name; a small handicap for topic searches from Italy or the US. | Accept it for the pun. Keep `hreflang` and `lang` correct so Italian and English pages are understood. |
| Heard aloud, people may type "philgloves.com" | Lost visitors. | Register `filippoguanti.com` (and `philgloves.com` if free) and 301-redirect them to philglov.es. |
| `.es` registration | Open to non-Spanish individuals with a passport or other foreign ID number. | Register under your own name, with auto-renew and registrar lock on. |

### On-site checklist

- [ ] Home `<title>`: "Filippo Guanti — photographs, software and a journal"; every other page: "\<Page title> · Filippo Guanti".
- [ ] Home `<h1>` (or the first heading) contains "Filippo Guanti"; the site name in the header reads "Filippo Guanti" with *philglov.es* as a secondary mark.
- [ ] About page titled "About Filippo Guanti" / "Chi è Filippo Guanti", with a real photo of you and a 2–3 sentence bio in the first paragraph.
- [ ] Schema.org JSON-LD on home and About: `Person` with `name`, `alternateName` ("Phil Guanti", "philglov"), `url`, `image`, `jobTitle`, `knowsLanguage` \[en, it\] and `sameAs` listing every profile you own. JSON-LD is data, not executable script, so the strict CSP stays as it is.
- [ ] Each journal entry: `BlogPosting` JSON-LD with `author` pointing to the same `Person`, `datePublished`, `inLanguage`, and a visible byline.
- [ ] Meta description per page, canonical URL, `hreflang` en / it / x-default, Open Graph and Twitter-card tags, a 1200×630 share image per entry (generated at build).
- [ ] `sitemap.xml` with both languages, `robots.txt` pointing to it, RSS feeds.
- [ ] Clean URLs (`/three-weeks-in-lisbon`), no query strings, a helpful 404.
- [ ] Speed and accessibility targets already in this doc also count as ranking signals.

### Off-site checklist (the part that decides name searches)

- [ ] Link every profile you own (Instagram, LinkedIn, GitHub, Flickr, Mastodon, etc.) back to philglov.es in its website field, and list them all in `sameAs` — the two-way match is what ties the site to your name.
- [ ] Show the same name, photo and one-line bio everywhere.
- [ ] Verify the site in Google Search Console and Bing Webmaster Tools via DNS TXT records (no script on the page), submit the sitemap, request indexing of home and About.
- [ ] Ask the few places that already mention you (school, clubs, exhibitions, clients) to link to philglov.es.
- [ ] Expect the site to show up for your name within days to a few weeks of indexing; first place is very likely given the low competition, but no one can guarantee it.

## Site map, URLs and the bilingual model

Short, flat URLs: an entry lives at `/<slug>`, and the Italian version adds `/it` in front of the same slug. The language switch only adds or removes `/it`, so it needs no JavaScript and no stored preference, and Google can index both languages.

| Page | English | Italian | Notes |
| --- | --- | --- | --- |
| Home | `/` | `/it` | Statement, latest entry, journal index, Now band, photos. |
| Entry | `/alps` | `/it/alps` | Same short slug in both languages, chosen once when you write. |
| Journal index | `/journal` | `/it/journal` | All entries by year; numbered like the home table. |
| Topic | `/journal/travel` | `/it/journal/travel` | One page per tag (`travel`, `photography`, `projects`, `thoughts`). |
| Photos | `/photos` | `/it/photos` | Series grid. |
| Series | `/photos/lisbon` | `/it/photos/lisbon` |  |
| Single photo | `/photos/lisbon/tram-28` | `/it/photos/lisbon/tram-28` | Large image, caption, camera data. |
| Now | `/now` | `/it/now` | Shows "Updated \<date>". |
| About | `/about` | `/it/about` | "About Filippo Guanti", photo, contact. |
| Rights | `/rights` | `/it/rights` | Licence, what may be reused, the AI-training refusal. |
| Privacy | `/privacy` | `/it/privacy` | The privacy notice. |
| Feeds | `/feed.xml` | `/it/feed.xml` |  |
| Admin | `/admin`, `/admin/write` | — | Behind Cloudflare Access; never linked. |

Rules: no trailing slashes (redirect `/alps/` to `/alps`); lowercase ASCII slugs with hyphens; the file name is the slug, so `it/lisbona.md` and `en/lisbona.md` are twins; reserved slugs (`it`, `journal`, `photos`, `now`, `about`, `rights`, `privacy`, `admin`, `api`, `_assets`, `feed.xml`, `styleguide`, `404`) fail the build if an entry uses them; a changed slug gets a 301 redirect from the old one.

Nav order: **Journal · Photos · Now · About**, then a link to the other language ("Italiano" or "English") and the Dark button. Four items, like riccardo.im, keeps the choice instant.

### Frontmatter every page carries

```yaml
title: "Tre settimane a Lisbona"
date: 2026-10-29
lang: it                 # language of THIS file
originalLang: it         # language you actually wrote it in
description: "Una frase per i risultati di ricerca e le anteprime dei link"
# no key needed: it/lisbona.md and en/lisbona.md are twins because they share a file name
# original or translation is worked out from lang and originalLang; there is no translation field
tags: [travel, photography]
comments: true
```

### The "originally written in" label

Shown under the title in small muted text on every entry:

| This page is… | English page shows | Italian page shows |
| --- | --- | --- |
| Your original, and you've written the other language too | Written in English · Leggi in italiano → | Scritto in italiano · Read in English → |
| Your own translation | Originally written in Italian · Read the original → | Scritto originariamente in inglese · Leggi l'originale → |
| Your original, not translated yet | Written in English · Not yet available in Italian | Scritto in italiano · Non ancora disponibile in inglese |

An entry that exists in one language only still appears in the other language's journal index, marked `IT only` or `solo EN`, and links to the version that exists. Search engines are told about the pair (`hreflang`) only when both versions exist.

A small marker before the label, `IT→EN` or `EN→IT`, lets you scan the journal list and see at a glance which "you" was writing. Avoid flags: they stand for countries, not languages.

### Footer copy (both languages)

> Spotted a typo, a wrong fact or anything else? Tell me with this anonymous form — add your email only if you'd like a reply. I'd be grateful.

> Hai notato un refuso, un'informazione sbagliata o altro? Segnalalo con questo modulo anonimo — lascia la tua email solo se vuoi una risposta. Te ne sarò grato.

Last line of the footer, linking to `/rights`: "© 2026 Filippo Guanti · All rights reserved · No AI training" / "© 2026 Filippo Guanti · Tutti i diritti riservati · No all'addestramento di IA".

### Comment form copy

- EN: **Your thoughts? Please leave a reply:** — Name · Email (never shown, only so I can reply) · Comment · \[Send\]
- IT: **Che ne pensi? Lascia una risposta:** — Nome · Email (non verrà mostrata, serve solo per risponderti) · Commento · \[Invia\]
- After sending: "Thanks! I read every comment before it appears here." / "Grazie! Leggo ogni commento prima che compaia qui."

Under the Send button, linking to `/privacy`: "By sending, you agree that your name and comment may be published here. Privacy notice." / "Inviando, accetti che il tuo nome e il commento vengano pubblicati qui. Informativa privacy."

## Agent prompts

Run eight agents in the order below, each starting from the shared brief; the QA agent has veto power and nothing ships until it reports zero failures.

1. **Lead** sets up the repo and breaks work into tickets.
2. **Design system** produces tokens, type, and the four art-directed layouts.
3. **Frontend** builds templates and pages on those tokens.
4. **Content & i18n** wires collections, the language label and the checks that keep the two languages in step. (Runs alongside 3.)
5. **Backend** builds the Worker, D1, forms, moderation, backups and the phone writing page. (Runs alongside 3.)
6. **Photo pipeline** handles image processing and photo pages.
7. **QA** tests everything; **Security audit** runs last. Failures go back to the owning agent, then QA re-runs in full.

The brief is pasted once, into the Lead session; the steps below explain why.

### Before you start

The agents run in Claude Code inside one GitHub repository, not in ordinary chats: they have to create files, run the site and run tests.

The owner keeps the full checklist separately. You build and test on a private staging address first; the domain comes last, so step 1 below needs only GitHub and Cloudflare for now.

1. Open accounts with passkeys: your own GitHub and a free Cloudflare account. The domain registrar and DNS wait until launch.
2. Create an empty GitHub repository and open it in Claude Code. Make it private on a paid GitHub Pro plan (recommended), or public on the free plan: branch protection, the rule that stops anything reaching the live site without passing the tests, isn't available for private repositories on GitHub Free.
3. Hand the Lead session three files to save in the repository: this guide exported as Markdown (`docs/guide.md`) and the two prototype files (`docs/design/Home.dc.html`, `docs/design/Article.dc.html`). The prompts point to these paths; without them the agents would guess.
4. Paste the shared brief and prompt 1 into the Lead session. It writes the brief into `CLAUDE.md`, which every later session reads by itself, so from agent 2 onward paste only that agent's prompt.
5. Run one session per agent, in order, and start a fresh session for each. Look at each preview link before merging.
6. When `docs/setup.md` asks, do the steps only you can do: create the EU database and storage buckets, the Access rule for `/admin`, email routing, the GitHub App and the secrets, and set the Cloudflare switches.

### Model and effort for each agent

Sonnet at medium effort does most of this work. Opus earns its higher cost only where a mistake is expensive: the architecture, the backend and the security audit. Fable is not needed anywhere.

| Agent | Model | Effort | Why |
| --- | --- | --- | --- |
| 1 Lead | `opusplan` (Opus plans, Sonnet builds) | high | Decisions made once that everything else depends on; the scaffolding itself is routine. Start in plan mode. |
| 2 Design system | Sonnet | high | The prototypes are the spec; the work is careful matching and contrast checking. |
| 3 Frontend | Sonnet | medium | Templating with a clear scope. |
| 4 Content & i18n | Sonnet | medium | Small, well-defined logic. |
| 5 Backend | Opus | high | Logins, uploads and the GitHub App: the one place where a subtle bug is a security hole. |
| 6 Photo pipeline | Sonnet | medium | Mostly configuration of existing tools. |
| 7 QA | Sonnet | high | Edge cases matter when writing tests; the tests then run in CI and cost no tokens. |
| 8 Security audit | Opus | xhigh | One short session with the highest stakes. `max` exists for this kind of hunt but tends to overthink; keep it for a second pass. |
| Later small fixes | Haiku or Sonnet | low | Typos, renames, dependency bumps. |

Habits that save the most tokens, from Claude's own guidance ([model configuration](https://code.claude.com/docs/en/model-config), [models and usage](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code)):

- A fresh session per agent, and `/clear` between unrelated tasks, so old context isn't re-read on every turn.
- `CLAUDE.md` kept under about 200 lines; agents open the section of `docs/guide.md` they need.
- Point agents at file paths; don't paste files or long logs into the chat.
- Ask for a plan before any change that touches several files.
- Let CI run the test matrix; the agent reads only the failures.
- Raise the effort only when an agent is stuck, not by default. Sonnet 5.5 and Opus 5.5 default to medium.

### 0. Shared brief (paste into the Lead session; it becomes CLAUDE.md)

```text
PROJECT: Personal website for Filippo Guanti at philglov.es — the hub of my life: photography portfolio, About, Now, and a journal (posts about projects, travels, experiences), in the spirit of sive.rs.

NON-NEGOTIABLES
1. Static first. Astro (current stable release) with static output. Content = Markdown files in /src/content. No CMS, no database for content.
2. Zero third-party requests. No CDNs, no Google Fonts, no analytics, no embeds, no CAPTCHA, no external widgets. Every byte comes from philglov.es.
3. JavaScript budget on public pages: ≤ 1.5 KB total, only for the light/dark toggle. Every public feature, including both forms, must work with JavaScript disabled. Only the private /admin pages may use more.
4. Strict CSP, sent as an HTTP header by the Worker (default-src 'self'; no 'unsafe-inline' for scripts or styles; hash the one inline theme script; no inline style attributes anywhere).
5. Bilingual: English at /<slug>, Italian at /it/<slug>, the SAME short slug in both languages and no section folders in entry URLs (philglov.es/alps, philglov.es/it/alps). No trailing slashes. Never redirect by browser language. Every page has lang and originalLang in frontmatter; twins are the files with the same name in the en and it folders, and a page is a translation when its lang differs from its originalLang. Both versions are written by hand: no AI translation, no translation script, API or key, anywhere. An entry may exist in one language only. Every page shows the "originally written in" label.
6. Accessibility: WCAG 2.2 AA, AAA body-text contrast, semantic HTML, skip link, visible focus, full keyboard use, descriptive alt text.
7. Responsive and art-directed separately at 1440, 1024, 768 and 390 px, and fluid in between down to 320 px.
8. Performance budget: text page ≤ 180 KB first visit; CSS ≤ 20 KB; fonts ≤ 2 files / 80 KB; LCP < 2 s on Slow 4G; CLS < 0.05.
9. Hosting: Cloudflare Workers with Static Assets; one Worker that runs first on every HTML request (it adds form tokens and comments) and serves /api/* and /admin; D1 for comments, reports and drafts; R2 for photo originals and backups; D1 and R2 created in the EU jurisdiction; Cloudflare Access protects /admin.
10. Fewer than 10 direct dependencies. Justify each new one in the PR description. pnpm, lockfile committed.
11. Zero console errors or warnings on any page, any theme, any language, any width.
12. Domain is philglov.es; the person is Filippo Guanti. SEO goal: rank first for "Filippo Guanti". Follow the SEO section of docs/guide.md: titles, Person and BlogPosting JSON-LD with sameAs, hreflang, canonical, sitemap, Open Graph.
13. Rights and privacy: everything is © Filippo Guanti, all rights reserved, with AI training and text-and-data mining expressly reserved (EU Directive 2019/790, art. 4(3)). Block AI-training crawlers; keep search engines and on-request AI assistants allowed. Form data stays in the EU jurisdiction. Follow the "Rights, AI training and privacy" section of docs/guide.md and publish its texts unchanged.
14. The full guide is docs/guide.md and the approved prototypes are in docs/design/. When a prompt says "the guide", read the named section there instead of guessing.
15. Two environments. Staging: a Cloudflare workers.dev address, the whole Worker behind Cloudflare Access and X-Robots-Tag: noindex on every response; all building and testing happens here until launch. Production: philglov.es, added only at launch. Canonical URLs, the sitemap and metadata always use https://philglov.es. Features that need the domain (notification email, Cloudflare zone settings, Search Console) are built and unit-tested now behind a config switch and turned on at launch.

DESIGN DIRECTION
Calm, type-led, artistic and professional, set in a single serif typeface with light titles. Familiar layout, surprising details (MAYA principle). The approved visual spec is the two v3 prototype files, Home.dc.html (home page) and Article.dc.html (journal entry with comments and reply form), saved in docs/design/: match their grid, navbar, footer, spacing and type. Near-white light theme (#FBFBF8), dark theme on #141513. One accent: moss green (#4A5D23 light / #A9BF78 dark), plus a full-width moss band behind Now. One typeface for everything: Crimson Pro (Light 300 for titles of 28 px and up, Regular 400 for text and interface, 600 for emphasis and index numbers); no separate monospace or sans-serif web font. The site name in the header is "Filippo Guanti" with "philglov.es" small beneath. No vertical social bar, no carousels, no autoplay.

WAY OF WORKING
- Small commits, each with a clear message. Do not mark a task done until its tests pass.
- If a requirement conflicts with another, stop and ask rather than guess.
- Never add a package, script or external URL to make a problem go away.
- The repo's CLAUDE.md holds this brief. Keep it current, and record every architectural decision in docs/decisions/ with its reason.
- Two ways to publish must always work: from a laptop (Markdown + git) and from a phone (philglov.es/admin/write). Both end in a pull request that must pass every test before it can merge.
```

### 1. Lead / architect

```text
ROLE: You are the technical lead. Set up the project so the other agents can work in parallel without conflicts.

DELIVER
1. Repo scaffold: Astro, current stable release (static output), TypeScript strict, pnpm, ESLint + Prettier, html-validate, a /worker folder for the Cloudflare Worker, wrangler config with static assets pointed at Astro's dist/. Emit every CSS, JS, font and image file under /_assets/ (Astro build.assets: "_assets"; fonts and other public files go in public/_assets/) and set run_worker_first to ["/*", "!/_assets/*"], adding ! patterns for the other non-HTML files (robots.txt, sitemap, feeds, favicon, /.well-known/*), so the Worker can add form tokens to every page and comments to entry pages; it passes everything else straight to env.ASSETS. Pages are served without trailing slashes or .html: Astro trailingSlash: "never" and build.format: "file", Cloudflare html_handling: "drop-trailing-slash". Set build.inlineStylesheets: "never" and turn Markdown syntax highlighting off (or make it class-based), because inline <style> blocks and Shiki's inline styles break the CSP. Do not use <ClientRouter />. Two wrangler environments: staging (a workers.dev address, its own D1 and R2, deployed from main until launch) and production (philglov.es only, no workers.dev route, switched on at launch).
2. Folder layout: src/content/{journal,pages}/{en,it}, src/content/photos/<series>/photos.json, src/components, src/layouts, src/styles/tokens.css, worker/src, tests/{e2e,unit}, docs/guide.md (the full guide) and docs/design/ (the two approved prototype files); the owner provides these three files at the start, so save them first.
3. Content collection schemas (zod) enforcing: title, date, lang, originalLang, tags, comments, description; twins are files with the same name in the en and it folders. Photo series use one photos.json per series (file, alt.en, alt.it, caption.en, caption.it, takenAt); camera, lens, focal length, aperture, shutter and ISO are read from the file at build, with optional overrides.
4. Astro i18n config: defaultLocale "en", locales ["en", "it"], routing.prefixDefaultLocale false, no automatic redirects.
5. CI (GitHub Actions): install → lint → typecheck → build → unit tests → Playwright e2e → Lighthouse CI → deploy to staging only on main and only if all pass; production deploys begin at launch. Preview deploys on pull requests, bound to a separate preview database and never to production data. There is no translation step: both language versions are written by hand. The build needs read access to the R2 originals: store those credentials as GitHub Actions secrets and as Dependabot secrets.
6. A README explaining: how to add a page, how to add its other-language version, how to moderate comments, how to deploy, how to roll back.
7. A TICKETS.md listing every task for the other agents with acceptance criteria copied from the shared brief.
8. CLAUDE.md at the repo root: the shared brief, the folder map, the commands, and the rule to update it whenever anything changes. Keep it under about 200 lines and point to docs/guide.md for detail.
9. docs/decisions/0001-*.md onward: one short record per decision in the guide (Astro, Cloudflare, URL scheme, no CAPTCHA, R2 for photos, phone publishing), with reason and rejected options.
10. Dependabot for npm and GitHub Actions (weekly), and branch protection on main requiring every CI check. Branch protection on a private repository needs a paid GitHub plan: ask the owner which applies. If the repo is private on GitHub Free during the build phase, continue, but list branch protection first among the launch blockers in docs/setup.md: production must not go live, and phone publishing must not be used for real, without it.
11. Two private R2 buckets in the EU jurisdiction: philglov-originals (photo originals) and philglov-backups (database exports). The owner creates every Cloudflare and GitHub resource; write the exact commands and dashboard steps in docs/setup.md, in two parts, "Now: staging, no domain needed" and "At launch: domain and production" (D1 with --jurisdiction=eu; R2 activated in the dashboard, then buckets created with --jurisdiction eu and bound with "jurisdiction": "eu"; Access on the whole staging Worker now (Workers & Pages → the Worker → Access → Protect this Worker behind Access → All traffic) and, at launch, an Access application for philglov.es/admin with a 7-day session; the send_email binding with a verified destination address; the GitHub App, its private key converted to PKCS#8; all secrets; under Security → Settings → Bot traffic, AI training crawlers disallowed and Bot Preference Sync on; Email Address Obfuscation, Bot Fight Mode, Web Analytics automatic setup, Speed Brain, Rocket Loader, Zaraz and Cloudflare Fonts off). The build reads originals from R2 and caches resized images in CI keyed by file hash.
12. No translation tooling: do not add a translation script, CI job, API key or dependency.

DONE WHEN: `pnpm build` produces a deployable dist/ with a placeholder home page in both languages, CI is green, and TICKETS.md, CLAUDE.md and docs/setup.md exist.
```

### 2. Design system & art direction

```text
ROLE: You are a senior UI/UX designer who also writes production CSS. Build the visual system everyone else uses.

FIRST: study docs/design/Home.dc.html and docs/design/Article.dc.html (the v3 home page and journal entry). They are plain HTML and CSS inside a design-tool wrapper; treat their markup, CSS values and breakpoints as the visual spec. Where this prompt and the prototypes differ, the prototypes win. Extend the same system to every other template (journal index, topic pages, photos, single photo, Now, About, rights, privacy, 404, admin).

DELIVER
1. src/styles/tokens.css: colour tokens for light and dark (bg, surface, text, muted, rule, accent, focus), applied via [data-theme] on <html> with prefers-color-scheme as the default. Verify every text/background pair with a contrast checker; body text ≥ 7:1, everything else ≥ 4.5:1. Record the measured ratios in a comment.
2. Typography: one family, Crimson Pro (SIL OFL), self-hosted as two WOFF2 files subset to Latin (English and Italian, including à è é ì ò ù, curly quotes, dashes, · and €): an upright variable file with weights 300–600 and an italic variable file with weights 300–400. Font budget 80 KB (the pair measures about 66 KB). No other web font: code uses the system monospace stack. Light 300 only at 28 px and larger (home statement, entry titles, reply heading, pull quotes in italic); Regular 400 for text and interface; 600 for emphasis, index numbers and buttons. Small labels are uppercase 600 with 0.1em tracking, because the font has no small caps; numbers in the index, dates and counts use tabular figures. Crimson Pro has no arrow glyphs: ship one inline SVG arrow for interface arrows (after links, and in the IT→EN marker). font-display: swap; preload only the upright file; fallback stack Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif with size-adjust to minimise layout shift. Sizes as in the prototypes: interface 19 px (18 px on phones), reading text 22 px (20 px on phones) at line-height 1.5, measure about 66 characters, titles up to 64 px (40 px on phones). If the files exceed the budget, narrow the weight ranges or use static instances, and report the real sizes before asking to raise it.
3. Spacing scale (4 px base), radius tokens as in the prototypes (pill buttons, 5 px inputs, 0 for photos), motion tokens (150 / 250 ms, ease-out) disabled under prefers-reduced-motion.
4. Layout primitives as in the prototypes: a 12-column grid with section labels and entry details in the left 3 columns and content in the right 9; below about 1040 px the labels move above their content; one column on phones.
5. Component specs + CSS: header/nav (one row on desktop; name and controls above the four links from tablet down; no menu button), theme toggle, language switch, language label (small, muted, with IT→EN marker), the numbered journal table with its stacked phone layout, the latest-entry feature, the Now band, article body styles (headings, quotes, code, figures, footnotes), photo grid (3 columns with one wide image per row; 1 column on phones), single-photo page, comment list (numbered like sive.rs, with author replies set off), comment form, footer with <details> error-report form, focus and error states for every control.
6. Cross-document view transitions in CSS only.
7. A /styleguide page (not in nav, noindex) showing every component in both themes.
8. CSS architecture: one file ordered with @layer reset, tokens, base, layout, components, utilities; every colour, size and space from tokens.css; components respond to their container (container queries); logical properties; no !important, no ID selectors. Document the rules at the top of the file.
9. Brand is deferred: the owner will choose an identity and favicon later. Ship a neutral placeholder favicon (a plain moss-green rounded square, no letters; SVG, 32 px PNG, 180 px apple-touch-icon) and a typographic 1200×630 share-image template the build fills per entry (title in Crimson Pro Light, "Filippo Guanti", a moss rule). Keep every brand file in src/assets/brand/ and reference it from one config, so a later identity means replacing files, not editing templates.
10. A print stylesheet: entries print in Crimson Pro without nav, forms or footer, with link URLs written after links.
11. The /admin pages (moderation and write-from-phone): same tokens, designed phone-first, large touch targets, readable in bright sunlight.
12. No inline style attributes (the CSP blocks them): per-photo placeholder colours and any other per-item values go through classes in the stylesheet.

CONSTRAINTS: one CSS file ≤ 20 KB compressed. No CSS framework. No icon font; inline SVG icons with aria-hidden and visible text labels.

DONE WHEN: /styleguide renders every component at 1440, 1024, 768 and 390 in both themes with no contrast failures, and the built home page and entry page match the two prototypes side by side.
```

### 3. Frontend

```text
ROLE: You are a senior frontend engineer obsessed with semantic HTML, accessibility and performance. Build every page using the design system's tokens and components — do not invent new styles.

BUILD
1. Base layout: <html lang>, meta (description, canonical, hreflang pairs for en/it/x-default only when the other-language version exists, Open Graph), skip link, header, main#main, footer. Inline the theme script in <head> (≤ 1 KB) so there is no theme flash; it reads localStorage in a try/catch and falls back to the system setting. No inline style attributes anywhere (the CSP blocks them). At build, write the SHA-256 of the inline theme script to a small file the Worker reads, so the Worker can put it in the CSP header; Astro's own CSP feature only emits a <meta> tag, which cannot carry frame-ancestors.
2. Pages in both languages: Home, Journal index (/journal) with one static page per topic (/journal/<tag>), Journal entry, Photos index, Photo series, Single photo, Now (shows "Updated <date>"), About, Rights, Privacy, 404 (bilingual, helpful links). Entry numbers (No. 042) come from publication order and reading time from word count, both computed at build.
3. Journal entry: title, date, language label, body, sign-off, approved comments placeholder <section id="comments" data-slug> (the Worker injects comments here), then the "Your thoughts? Please leave a reply:" form as a plain HTML POST to /api/comment with fields name, email, comment, a hidden honeypot field, an empty hidden token field that the Worker fills as it serves the page, and the slug/lang. Under the Send button, the consent line from the guide with a link to /privacy. Leave marked slots where the Worker writes its thank-you and error messages next to the form and its fields.
4. Footer on every page: the bilingual error-report text and a <details> disclosure containing a POST form to /api/report (message required, email optional, page URL hidden, honeypot, and the same empty token field).
5. Language switch links to the twin page (the same slug, with or without /it); if no twin exists, link to the other language's home and say so.
6. RSS/Atom feeds per language, sitemap.xml with hreflang, robots.txt as given in the guide. Paginate the journal index and topic pages at 50 entries (/journal/page/2). The footer ends with the rights line from the guide, linking to /rights, and a partita IVA only if the owner provides one.
6a. Rights and privacy pages: build /rights and /privacy and their /it twins from the texts in the guide's "Rights, AI training and privacy" section, unchanged except for the owner's placeholders.
6b. AI opt-out signals, all from one data file (src/data/ai-bots.json): robots.txt; /.well-known/tdmrep.json with a rule reserving "/"; <meta name="tdm-reservation" content="1"> on every page; a _headers file that adds tdm-reservation: 1 and X-Robots-Tag: noai, noimageai to the image files served directly from /_assets/ (_headers never applies to responses the Worker generates; the Worker adds tdm-reservation to the pages itself). Check each against its spec.
6c. Photo pages carry ImageObject JSON-LD with creator, creditText, copyrightNotice, license and acquireLicensePage pointing to /rights.
7. No client framework, no hydration directives. If you believe JS is needed for something, write it down and ask.

DONE WHEN: every page passes html-validate, keyboard-only walkthrough, works with JS disabled, and matches the design at all four widths.
```

### 4. Content & i18n

```text
ROLE: You own the content model, and the bilingual logic. Both language versions are written by hand; there is no machine translation.

BUILD
1. Helpers that, given any page, find its twin (the file with the same name in the other language folder) and return the correct label text from the table in the guide (original with a twin, translation, original without a twin × en / it), plus the marker (IT, EN, IT→EN, EN→IT, "IT only", "solo EN").
2. A build check that fails if: an entry uses a reserved slug or one already taken; a translation has no original twin; a translation's originalLang doesn't match its twin's lang; a page lacks alt text in its own language for any image.
3. Entries in one language only: list them in the other language's journal index and topic pages with the "IT only" or "solo EN" marker, linking to the version that exists with the right lang attribute. They get no hreflang pair and appear only in the feed of their own language. Alt text and captions in the other language are also written by hand; a photo may carry alt text in one language until its entry is translated.
4. `pnpm new <slug> --lang it|en`: creates a correctly filled Markdown file for a new entry; when the slug already exists in the other language, it creates that entry's other-language version with originalLang set from the existing file.
5. Seed content: one sample entry written in Italian with a hand-written English version, one entry that exists in English only, one Now page, one About page, so every template can be tested.
6. All interface strings (nav, buttons, form labels, errors, footer) in src/i18n/{en,it}.json; no hard-coded UI text in templates.

DONE WHEN: the sample entry shows the correct label on both language versions, the build check catches a deliberately broken twin, and the English-only entry is listed correctly in the Italian index.
```

### 5. Backend (Worker + D1)

```text
ROLE: You are a backend engineer with a security mindset. Build the only dynamic part of the site: two public forms, comment display, and a private admin area (moderation and writing from the phone). No framework; the only runtime dependency allowed is jose, for JWT work. Keep each module small enough to read in one sitting and within the free plan's 10 ms of CPU per request. Never log names, emails, comment text or IP addresses.

BUILD
1. D1 database created with --jurisdiction=eu (it cannot be changed later; the owner runs the command from docs/setup.md), schema with migrations:
   comments(id, slug, lang, name, email, body, status: pending|approved|rejected, created_at, ip_hash, reply_body nullable)
   reports(id, page_url, message, email nullable, created_at, ip_hash, status: open|done)
   rate_limits(key, window_start, count)
   drafts(id, slug, lang, title, body, tags, updated_at)
   One comment thread per slug, shown on both language versions of the entry; lang records which version it was written on.
2. POST /api/comment and POST /api/report accepting application/x-www-form-urlencoded (works without JS). Validate server-side: required fields, lengths (name 80, email 254 and valid format, comment 5,000, report 3,000), max 2 links, honeypot empty, HMAC-signed timestamp between 3 s and 24 h old. Store plain text only. Rate limit 5 submissions per 10 min per ip_hash (SHA-256 of IP + secret salt; never store raw IPs). On success redirect (303) back to the page with ?sent=comment#comments (or ?sent=report#report); when it serves that URL the Worker writes the thank-you message into the page. On a validation error, answer with the same page (status 422), the error shown in text next to the field, and everything the visitor typed preserved and escaped.
3. Comment display: for entry pages (the build writes /_assets/entries.json listing every entry path in both languages; the Worker checks it), fetch the static asset, then use HTMLRewriter to insert approved comments into <section id="comments">, numbered, with my replies set off. Insert text with html: false so everything is escaped. Cache the comments fragment per slug for 60 seconds, with no purge (a Cache API delete only clears one data centre); never cache a page that has a token in it. Fail open: if D1 or the rewriter throws, serve the static page untouched instead of an error, and drop the asset's ETag from rewritten responses.
3b. Form tokens: on every HTML response, use HTMLRewriter to write a fresh HMAC-signed timestamp into the empty token field of each form. Send HTML with Cache-Control: no-cache.
4. /admin (GET) and /admin/action (POST): verify the Cloudflare Access JWT (the Cf-Access-Jwt-Assertion header) on every request with jose: createRemoteJWKSet on https://<team>.cloudflareaccess.com/cdn-cgi/access/certs, then jwtVerify with issuer and audience (team domain and audience come from config, one pair per environment). List pending comments and open reports, with approve / reject / reply / mark-done buttons as plain forms with a CSRF token.
5. Notifications, behind a config switch that is off on staging because sending needs the domain (when off, log only "notification skipped"): on each new comment or report, send me an email through Cloudflare's send_email binding (destination_address set to my verified address, sender on philglov.es). The email contains only the page title and a link to /admin: no name, no email address, no comment text, and never one-click approve links.
6. Retention: a scheduled job deletes ip_hash values older than 30 days, rejected comments older than 30 days, and error reports 12 months after they are marked done. /admin has a Delete action that permanently removes a comment with its name and email, for deletion requests.
7. All responses carry the security headers from the spec, plus tdm-reservation: 1; the CSP header carries the theme-script hash the build wrote. The /admin pages get X-Robots-Tag: noindex and their own CSP, which also allows their one script. Secrets (HMAC key, salt, GitHub App private key) only in wrangler secrets.
8. Phone publishing at /admin/write, behind the same Access + JWT check: a phone-first form with title, slug (suggested from the title, editable, reserved slugs refused), language, topics, Markdown body with a short cheat sheet, and photos each with alt text and caption. Photos upload one at a time to R2 (philglov-originals/<slug>/) with progress and automatic retry; JPEG and PNG only (the file input's accept must be exactly image/jpeg,image/png, never image/*, so iPhones convert HEIC), checked by file signature, max 25 MB each, streamed to R2 without buffering; text can be published first and photos added later. Drafts autosave in the browser and, on Save draft, in D1. Publish writes the entry as a Markdown file (photos as Markdown images with their alt text and caption) on a new branch and opens a pull request through a GitHub App installed on this repo only (Contents and Pull requests: write; its private key converted to PKCS#8 so jose can sign with it); branch protection keeps it off main. When the slug already exists in the other language, treat the new text as that entry's other-language version: set originalLang from the existing file and show the existing text under the form for reference. The admin pages may load one small script of their own under their own CSP; public pages keep only the theme script.
9. Backups: a weekly cron exports comments and reports to philglov-backups as JSON and keeps 12 weeks.
10. Monitoring: Workers Logs on and an alert email when the error rate rises.

TESTS: unit tests for every validation rule and the rate limiter (Vitest + Miniflare/Workers test pool), plus an injection test: a comment containing <script>alert(1)</script> and an onerror attribute must render as visible text.

DONE WHEN: forms work with JS off, a spam-like submission is rejected with a clear message, an approved comment appears on the page within a minute, and /admin returns 403 without a valid Access token.
```

### 6. Photo pipeline

```text
ROLE: You are a frontend engineer and photographer. Make photos look stunning and load fast on bad connections.

BUILD
1. Originals live in the private R2 bucket philglov-originals; the repo keeps only a photos.json per series (file, alt.en, alt.it, caption.en, caption.it). A prebuild script downloads the originals not already in the CI cache into a git-ignored folder under src/ (Astro only optimises imported local files), and resized outputs are cached keyed by file hash, so build time grows with new photos, not with the whole archive. RAW files never leave the owner's drives. Photos uploaded from the phone writing page arrive in R2 the same way. Support both kinds of photo: portfolio series (photos.json) and photos inside journal entries (Markdown images with alt text, resolved from philglov-originals/<slug>/).
2. At build, Astro's <Picture>: AVIF + WebP + JPEG fallback, widths 480/800/1200/1600/2400, correct sizes attribute per layout, width/height always set, loading="lazy" except the first image on a page (eager + fetchpriority="high").
3. Astro's image service strips all metadata, GPS included. In a post-build step, write back only rights metadata into every output image with exiftool (installed in CI; it also handles AVIF, which sharp's withXmp does not): IPTC Creator (Filippo Guanti), Copyright Notice (© <year> Filippo Guanti. All rights reserved.), Credit Line, Web Statement of Rights (https://philglov.es/rights), and the IPTC/PLUS Data Mining field set to http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING (XMP property plus:DataMining). Read camera, lens, focal length, aperture, shutter, ISO at build time from the source and render them as text in the small muted metadata style.
4. Placeholder: compute each photo's dominant colour at build and apply it as the background of the image box through a build-generated class in the stylesheet, never an inline style attribute (the CSP blocks those). No blur JS.
5. Art direction: hero images support separate crops per breakpoint via <picture><source media>, defined in photos.json or the page's frontmatter (desktop, tablet, mobile focal points or separate files).
6. Single-photo page: largest sensible size, caption, alt text, metadata, previous/next links (also with keyboard shortcuts only if they need zero extra JS — otherwise skip them).
7. Dark backdrop option for photo pages even in light theme, if the designer approves.

DONE WHEN: a 20-photo series page stays under 400 KB for the first screen on a 390 px phone, every image has alt text in the page language, and no output file contains GPS data (verify with exiftool in a test).
```

### 7. QA & testing (veto power)

```text
ROLE: You are a meticulous QA engineer. Your job is to prove the site works in every single part. You do not fix product code; you write tests, run them, and file precise bug reports to the owning agent. Nothing deploys until you report zero failures.

TEST MATRIX: every page × {en, it} × {light, dark} × {1440, 1024, 768, 390, 320} × {JS on, JS off} in Chromium via Playwright; in Firefox and WebKit run a smoke subset (home, one entry, one photo page, both forms) at 1440 and 390. Tests run as scripts locally and in CI; read only the failures, never whole logs.

AUTOMATED SUITES (Playwright unless stated)
1. Console & network: on every page in the matrix, attach listeners for console (error AND warning), pageerror, requestfailed and response status ≥ 400. Any hit fails the test. Also fail if any request goes to a host other than the site's own.
2. Accessibility: axe-core on every page in both themes — zero violations allowed. Keyboard test: Tab through each page, assert the skip link comes first, focus is always visible (screenshot the focus ring), the theme toggle, language switch, error-report disclosure and both forms are operable.
3. Visual regression: full-page screenshots at the 4 design widths in both themes; review diffs before accepting baselines. Also assert no horizontal scroll at 320 px and at 200% zoom.
4. Theme: toggle persists across navigation and reload, no flash of the wrong theme (screenshot the first paint), system preference is respected when no choice was made.
5. i18n: every page has a twin or a graceful fallback; the language switch goes to the twin; lang attribute, hreflang tags and the "originally written in" label are correct for originals, translations and entries that exist in one language only.
6. Forms (against a local Worker with a test D1): valid comment → 303 + confirmation; empty name/comment, bad email, too long, 3 links, filled honeypot, submission under 3 s, replayed old token, 6th submission in 10 min → each rejected with the right visible message and the typed text preserved. Same for the report form. XSS payloads render as text after approval. /admin without Access → 403.
7. HTML validity: html-validate on all built pages. Broken links: crawl the built site (internal links, anchors, feeds, sitemap) — zero 404s.
8. Performance: Lighthouse CI on home, a journal entry, the photo grid and a single photo, mobile profile with Slow 4G throttling. Fail below 95 in any category, LCP ≥ 2 s, CLS ≥ 0.05, or any budget in the spec exceeded (check transfer sizes from the network log).
9. Security headers: assert CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP on HTML and API responses. Assert the only executable inline script matches the CSP hash (JSON-LD data blocks are allowed) and that no element carries an inline style attribute.
10. Images: no output image contains EXIF GPS; every <img> has width, height and non-empty alt (or alt="" with role justification).
11. SEO: every page has a unique <title> containing "Filippo Guanti", a meta description, a canonical, correct hreflang pairs, and Open Graph tags; JSON-LD validates (Person on home and About, BlogPosting on entries); sitemap.xml lists every page in both languages; no page is accidentally noindex.

12. Phone publishing (local Worker, test repo): /admin/write returns 403 without Access; at 390 px every control works by touch and keyboard; a draft survives a reload and a dropped connection; a non-image file renamed .jpg is refused; Publish opens a pull request and never touches main; writing the other-language version of an existing entry creates its twin with the right originalLang.
13. Print and cookies: an entry prints without nav, forms or footer; no page sets any cookie; favicon and share image exist for every entry.
14. Rights and privacy: the served robots.txt disallows every bot in ai-bots.json and still allows Googlebot and Bingbot; tdmrep.json is valid; tdm-reservation is present on a page and on an image, and X-Robots-Tag: noai, noimageai on images only; every output image carries the copyright and Data Mining metadata and no GPS; /rights and /privacy exist in both languages with no unfilled placeholder; notification emails contain no personal data; the retention job deletes what the privacy notice says it deletes.
15. Live-site check after every deploy: run the console, network, cookie and header tests against the deployed site as well (staging through an Access service token until launch, https://philglov.es after it), to catch anything Cloudflare adds on its side (injected scripts, cookies).

MANUAL CHECKS (write a checklist and tick it each release): publish a test entry from a real phone on a throttled connection; VoiceOver on iOS Safari and TalkBack on Android for home, an entry and the comment form; a real old phone on a throttled connection; reading an entry with CSS disabled.

REPORT FORMAT per bug: page URL, language, theme, width, browser, steps, expected, actual, screenshot, owning agent, severity.

DONE WHEN: the full matrix passes twice in a row with no flaky tests, and you have written a QA-REPORT.md summarising coverage.
```

### 8. Security audit (runs last)

```text
ROLE: You are an application security reviewer. Try to break the site before someone else does.

CHECK
1. Headers and CSP on every response type (HTML, API, 404, admin); try injecting an inline script and a third-party script into a built page and confirm the browser blocks both.
2. Forms: fuzz every field (Unicode tricks, very long input, HTML/JS/SVG payloads, header injection in email, SQL-like strings), test rate limiting, token replay and CSRF on /admin/action.
3. /admin: unreachable without a valid Access JWT, including via path tricks (/admin/, /ADMIN, /admin%2f, trailing dots).
4. Dependencies: pnpm audit, review every package's install scripts, confirm lockfile is committed and CI uses a frozen lockfile.
5. Secrets: none in the repo or its history; .env is git-ignored; wrangler secrets used for the HMAC key, the salt and the GitHub App key; R2 credentials only in GitHub secrets; no AI or translation API key exists anywhere.
6. Account checklist for the owner: passkeys/2FA on GitHub, Cloudflare, registrar; branch protection; DNSSEC on; security.txt present.
7. Privacy: confirm no raw IPs are stored, retention job works, privacy page matches reality.
8. Phone publishing: fuzz /admin/write and its upload endpoint like the public forms; confirm the GitHub App sees only this repo with only Contents and Pull requests permissions, and that branch protection stops it reaching main; confirm both R2 buckets are private and no original with GPS is ever served publicly.
9. Backups: restore last week's export into a test database and confirm the comments come back.
10. Data and rights: D1 and both R2 buckets are in the EU jurisdiction; Delete in /admin removes a comment with its name and email for good; logs hold no personal data; robots.txt, tdmrep.json and the headers refuse AI-training crawlers while Googlebot and Bingbot stay allowed.
11. Cloudflare dashboard: the extras that add scripts or cookies are off (Email Address Obfuscation, Bot Fight Mode, Web Analytics automatic setup, Speed Brain, Rocket Loader, Zaraz, Cloudflare Fonts) and the production Worker has no workers.dev route.

DELIVER: SECURITY-REPORT.md with findings ranked by severity, each with a reproduction and a fix, then re-test after fixes.
```

## Day to day: publishing a new page

You publish from the laptop or the phone; both paths end in the same pull request, tests and preview.

1. Write the entry in whichever language feels right. On the laptop, `pnpm new lisbona --lang it` creates `src/content/journal/it/lisbona.md` ready to fill in. On the phone, use the writing page described in the next section.
2. Send it. Push a branch from the laptop, or tap Publish on the phone. Either way a pull request opens.
3. CI builds the site and runs every test.
4. Open the preview link and read it.
5. Merge. The site updates in about two minutes; if any test fails, nothing changes on the live site.
6. Translate by hand whenever you want: write the other-language version the same way, with the same slug. Until then the entry appears in the other language's index marked "IT only" or "solo EN".
7. Comments and error reports arrive by email. Open `/admin` to approve, reject or reply; approved comments appear within a minute, no rebuild needed.

## Publishing from your phone

You publish from the phone through a private writing page on your own site, `philglov.es/admin/write`. It turns what you type and the photos you pick into a pull request on GitHub; the tests run by themselves, and you tap Merge when the preview looks right.

| Option | How it works | Verdict |
| --- | --- | --- |
| **Private writing page on your site** (`/admin/write`) | A plain form behind Cloudflare Access: title, language, topics, text, photos with alt text. The Worker stores photos in R2 and opens a pull request through a GitHub App that can only touch this one repository. | **Pick.** Works in any phone browser, no extra app, no third-party code, and even a stolen login can only open a pull request, never publish. |
| GitHub website or mobile app | Edit or add Markdown files on github.com. | Keep for quick typo fixes; awkward for long entries and photos. |
| A Git app on the phone (Working Copy on iOS, Obsidian with a Git plugin) | A full Git client in your pocket. | Fine if you enjoy it; extra app, extra setup, possible sync conflicts. |
| A Git-based CMS (Decap, Sveltia) | An editor web app that commits to GitHub. | Skip: it brings a large third-party script and its own login, the attack surface we chose to avoid. |

### The flow

1. Open `philglov.es/admin/write` and sign in with the code Cloudflare emails you. Set Access to keep you signed in for 7 days.
2. Write in Italian or English, pick topics. The page suggests a short slug from the title; you can change it. A small Markdown cheat sheet sits under the text box.
3. Add photos from the camera roll, each with alt text and a caption. The page accepts JPEG and PNG; iPhones normally convert their HEIC photos to JPEG when a page asks for those formats.
4. Drafts save as you type (on the phone) and when you tap Save draft (on the server). A dropped connection loses nothing; you can also write offline in Notes and paste later.
5. Tap Publish. The Worker uploads the photos to R2 and opens a pull request named after the entry.
6. GitHub Actions builds the site and runs every test.
7. GitHub notifies you with a preview link. Read the entry on the phone.
8. Tap Merge in the GitHub app. The entry is live in about two minutes. To write the other language later, use the same slug on the writing page under `/admin`.

**On bad connections:** photos upload one at a time with a progress bar and automatic retry, so one failure doesn't lose the rest. On very slow networks, publish the text first and add photos to the same entry later.

### Why it stays safe

- `/admin/write` sits behind Cloudflare Access, and the Worker checks the Access token on every request, as for moderation.
- The GitHub App is installed on this repository only, with write access to Contents and Pull requests. Branch protection means it can never push to `main`; only a merge after green tests publishes.
- Uploads: JPEG or PNG only, checked by the file's contents rather than its name, at most 25 MB each. Text is stored as Markdown and built like any other entry, so a broken entry fails the build instead of reaching the live site.
- The admin pages may load one small script of their own (autosave, slug suggestion, upload progress) under their own policy. Public pages keep only the tiny theme script.

## Keeping the site maintainable

Future agent sessions, and you in two years, must keep the same rules without anyone pasting this guide again.

- **CLAUDE.md** at the repository root holds the shared brief, the folder map and the commands. Claude Code reads it at the start of every session. Update it whenever a rule changes.
- **Decision log** in `docs/decisions/`: one short file per decision (Astro, Cloudflare, URL scheme, no CAPTCHA, R2 for photos, phone publishing), each with its reason and the options rejected.
- **CSS architecture:** one stylesheet ordered with `@layer reset, tokens, base, layout, components, utilities`. Every colour, size and space comes from `tokens.css`; components adapt to their container (container queries); no `!important`, no ID selectors, no CSS framework.
- **Components:** one Astro component per piece of interface, each shown on `/styleguide`. New pages reuse them rather than adding styles.
- **Dependencies:** Dependabot opens weekly updates; merge only when CI is green. Astro major upgrades get their own pull request and a full QA run.
- **Photo storage that scales:** originals live in a private R2 bucket; the repository holds only Markdown and a small `photos.json` per series (file, alt text and captions in both languages). The build downloads only new originals and caches resized images by file hash, so build time grows with new photos, not with the whole archive.
- **Long lists:** the journal index and topic pages split into pages of 50 entries (`/journal/page/2`).
- **The content schema is the contract:** an entry missing a required field fails the build, so a malformed phone entry never goes live.

## Operations: backups, monitoring, email

Each item is set up once at launch and then runs by itself.

| Item | Setup |
| --- | --- |
| Writing | Git history on GitHub keeps every version of every page. Clone it to your laptop now and then. |
| Photo originals | Private R2 bucket, plus your own copy on a drive or cloud storage. RAW files never go to the site. |
| Comments and reports | A weekly scheduled job exports the database to JSON in a private R2 backup bucket and keeps 12 weeks. The database itself only keeps a short restore window. |
| Domain | Auto-renew and registrar lock on. Renewal emails go to an address that is not on philglov.es, so they still arrive if the domain lapses. |
| Uptime | A free external checker (UptimeRobot or similar) loads the home page and one entry every 5 minutes and emails you if they fail. Nothing is added to the pages. |
| Errors | Workers Logs on, with an alert email when the Worker's error rate rises. Search Console emails you about crawl problems. |
| Email | Cloudflare Email Routing forwards `phil@philglov.es` to your Gmail for free. To send from that address, add an outgoing mail service in Gmail's "Send mail as", plus SPF, DKIM and DMARC records. |

## Rights, AI training and privacy

Everything on the site is yours with all rights reserved, AI training is refused in every form machines read, and the two forms keep as little personal data as possible, stored in the EU. This is general information, not legal advice.

### Licence: all rights reserved, AI training refused

| Question | Answer |
| --- | --- |
| Licence | **© Filippo Guanti. All rights reserved**, for photographs and text alike. |
| Why not Creative Commons | A CC licence lets anyone copy and repost your photos and can never be withdrawn. It also can't stop AI training: Creative Commons itself says its licences do not override copyright exceptions. |
| Why this fits the EU | EU law lets anyone mine public web content, AI training included, unless the owner expressly reserves that use in a machine-readable way (Directive 2019/790, art. 4(3); in Italy, arts. 70-quater and 70-septies of Law 633/1941). "All rights reserved" plus the signals below is that reservation. |
| What people may still do | Link to any page, and quote up to 150 words with your name and a link. For anything else they ask you. |

### Blocking AI training, layer by layer

No single signal is obeyed by every crawler, so the site sends all of them. Search engines stay allowed, and so do AI assistants that open one page to answer someone's question and link back, because that helps people find you.

| Layer | What it does | Set by |
| --- | --- | --- |
| `robots.txt` | Disallows AI-training crawlers by name and adds the line `Content-Signal: search=yes, ai-train=no`. | Frontend agent |
| Cloudflare's AI-crawler blocking | Refuses known AI-training crawlers at the network edge, including ones that ignore `robots.txt`. Free plan. | You, once, in the Cloudflare dashboard |
| TDM reservation (TDMRep) | `tdm-reservation: 1` as an HTTP header, a `<meta>` tag and `/.well-known/tdmrep.json`: the machine-readable reservation EU law asks for. | Frontend agent |
| `X-Robots-Tag: noai, noimageai` | A header on image files that image-dataset tools such as img2dataset obey by default. | Frontend agent |
| Photo metadata | Every published image carries your name, the copyright notice, a link to `/rights` and the IPTC "Data Mining" field set to prohibited except search-engine indexing. GPS stays stripped. | Photo agent |
| The `/rights` page | States the reservation in words, in both languages. | Frontend agent |

This is a refusal plus a filter, not a guarantee: a crawler that hides its identity can still copy a public page.

```text
# philglov.es — © Filippo Guanti. All rights reserved.
# Text and data mining, including AI training, is expressly reserved
# (Directive (EU) 2019/790, art. 4(3)). See https://philglov.es/rights

User-agent: *
Content-Signal: search=yes, ai-train=no
Allow: /
Disallow: /api/

# AI-training crawlers and training opt-out tokens
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: anthropic-ai
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: CloudVertexBot
User-agent: Applebot-Extended
User-agent: meta-externalagent
User-agent: Amazonbot
User-agent: Bytespider
User-agent: CCBot
User-agent: cohere-ai
User-agent: cohere-training-data-crawler
User-agent: Diffbot
User-agent: omgili
User-agent: omgilibot
User-agent: ImagesiftBot
User-agent: img2dataset
User-agent: AI2Bot
User-agent: KimiBot
User-agent: Timpibot
Disallow: /

Sitemap: https://philglov.es/sitemap.xml
```

This list is a starting point. The frontend agent keeps it in one data file, syncs it with Cloudflare's managed list, and you review it twice a year. Not blocked on purpose: Googlebot, Bingbot, Applebot, DuckDuckBot, and the assistants' search and on-request fetchers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot). To refuse those too, add them to the list.

### Text of the rights page

The frontend agent publishes these at `/rights` and `/it/rights`, unchanged apart from the contact address.

```markdown
# Rights and reuse

Everything on this site — photographs, text, design — is © Filippo Guanti. All rights reserved.

**You're welcome to**

- link to any page;
- quote up to 150 words, with my name and a link to the page.

**Please ask me first** ([your contact email]) if you'd like to

- publish, print or repost a photograph;
- translate or republish an entry;
- use anything commercially.

**Not permitted**

- using any content from this site to train or fine-tune AI models, or copying it into datasets for that purpose.

I expressly reserve all rights to text and data mining of this site's content, under Article 4(3) of Directive (EU) 2019/790 and Article 70-quater of Italian Law 633/1941. The same reservation is published in machine-readable form: robots.txt, the TDM Reservation Protocol and the metadata of each image. Search engines may index the site, and assistants may open a page to answer a question about it, with a link.
```

```markdown
# Diritti e riutilizzo

Tutto ciò che trovi su questo sito — fotografie, testi, design — è © Filippo Guanti. Tutti i diritti riservati.

**Puoi liberamente**

- linkare qualsiasi pagina;
- citare fino a 150 parole, indicando il mio nome e il link alla pagina.

**Chiedimi prima** ([la tua email di contatto]) se vuoi

- pubblicare, stampare o ripubblicare una fotografia;
- tradurre o ripubblicare un testo;
- fare un uso commerciale di qualsiasi contenuto.

**Non è consentito**

- usare i contenuti di questo sito per addestrare o perfezionare modelli di intelligenza artificiale, né copiarli in dataset a questo scopo.

Mi riservo espressamente ogni diritto di estrazione di testo e di dati (text and data mining) sui contenuti di questo sito, ai sensi dell'art. 4, par. 3, della Direttiva (UE) 2019/790 e dell'art. 70-quater della legge 633/1941. La stessa riserva è pubblicata in forma leggibile dalle macchine: robots.txt, TDM Reservation Protocol e metadati di ogni immagine. I motori di ricerca possono indicizzare il sito e gli assistenti possono aprire una pagina per rispondere a una domanda, citandola con un link.
```

### Text of the privacy notice

Published at `/privacy` and `/it/privacy`. Fill the three placeholders; everything else describes what the site is built to do.

```markdown
# Privacy

Last updated: [launch date]

**Who is responsible.** Filippo Guanti, [city], Italy — [your contact email]. This is a personal site with no ads, no analytics and no tracking.

**What this site does not do.** It sets no cookies, loads nothing from other companies and builds no profile of you. Your light or dark theme choice is saved only in your own browser.

**What I collect, and why**

- *When you leave a comment:* your name, email address and comment. I publish the name and the comment after reading them. The email is never shown; I use it only to reply to you. Legal basis: your consent, given by sending the form.
- *When you report an error:* your message, the address of the page and, only if you add it, your email. Legal basis: my legitimate interest in keeping the site correct.
- *To stop spam and abuse:* a salted hash of your IP address (not the address itself), kept for 30 days. Legal basis: my legitimate interest in keeping the forms usable.
- *To deliver the pages:* Cloudflare, which hosts the site, processes technical data such as your IP address to serve and protect it. I can see only traffic totals and technical error logs.

Sending a form is optional. Comments and reports are never sent to AI services.

**How long I keep it.** Published comments, with their email, stay until you ask me to remove them or I delete the entry. Rejected comments are deleted after 30 days, error reports within 12 months, and backups after 12 weeks.

**Who else handles it.** Cloudflare, Inc. hosts the site and stores this data for me in its European Union data region, under a data-processing agreement. Cloudflare is a US company; where data leaves the EU, it relies on the EU–US Data Privacy Framework and standard contractual clauses. If I reply to you by email, my email provider handles that message. I share your data with no one else.

**Your rights.** You can ask me to see, correct or delete your data, to limit or object to its use, or to receive a copy, and you can withdraw your consent at any time: write to [your contact email]. You can also complain to the Italian data protection authority, the Garante per la protezione dei dati personali (garanteprivacy.it).
```

```markdown
# Privacy

Ultimo aggiornamento: [data di lancio]

**Chi è il titolare.** Filippo Guanti, [città], Italia — [la tua email di contatto]. Questo è un sito personale senza pubblicità, senza statistiche e senza tracciamento.

**Cosa questo sito non fa.** Non usa cookie, non carica nulla da altre aziende e non crea alcun profilo su di te. La scelta del tema chiaro o scuro resta salvata solo nel tuo browser.

**Cosa raccolgo, e perché**

- *Quando lasci un commento:* nome, indirizzo email e commento. Pubblico il nome e il commento dopo averli letti. L'email non viene mai mostrata: la uso solo per risponderti. Base giuridica: il tuo consenso, espresso inviando il modulo.
- *Quando segnali un errore:* il messaggio, l'indirizzo della pagina e, solo se la aggiungi, la tua email. Base giuridica: il mio legittimo interesse a mantenere il sito corretto.
- *Per fermare spam e abusi:* un hash con salt del tuo indirizzo IP (non l'indirizzo stesso), conservato per 30 giorni. Base giuridica: il mio legittimo interesse a mantenere utilizzabili i moduli.
- *Per mostrarti le pagine:* Cloudflare, che ospita il sito, tratta dati tecnici come il tuo indirizzo IP per servirlo e proteggerlo. Io vedo solo i totali di traffico e i log tecnici degli errori.

Inviare un modulo è facoltativo. Commenti e segnalazioni non vengono mai inviati a servizi di intelligenza artificiale.

**Per quanto tempo li conservo.** I commenti pubblicati, con la relativa email, restano finché non mi chiedi di rimuoverli o finché non elimino la pagina. I commenti rifiutati vengono cancellati dopo 30 giorni, le segnalazioni entro 12 mesi e le copie di backup dopo 12 settimane.

**Chi altro li tratta.** Cloudflare, Inc. ospita il sito e conserva questi dati per mio conto nella sua regione dati dell'Unione Europea, in base a un accordo sul trattamento dei dati. Cloudflare è un'azienda statunitense; quando i dati escono dall'UE, si basa sul Data Privacy Framework UE–USA e sulle clausole contrattuali standard. Se ti rispondo via email, quel messaggio passa dal mio fornitore di posta. Non condivido i tuoi dati con nessun altro.

**I tuoi diritti.** Puoi chiedermi di vedere, correggere o cancellare i tuoi dati, di limitarne l'uso o di opporti, o di riceverne una copia, e puoi revocare il consenso in qualsiasi momento: scrivi a [la tua email di contatto]. Puoi anche presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).
```

### What the build must do so the notice stays true

- The database and both storage buckets are created in Cloudflare's EU jurisdiction. This can only be chosen at creation.
- Notification emails to you carry no personal data: only the page title and a link to `/admin`.
- Scheduled clean-up: IP hashes after 30 days, rejected comments after 30 days, resolved error reports after 12 months, backups after 12 weeks.
- `/admin` has a Delete action that removes a comment with its name and email for good.
- Logs never contain names, emails, comment text or IP addresses.
- QA checks the live site after every deploy for cookies and requests to other hosts, because Cloudflare's own optional features could add either.

## Before launch

These are the items no agent can decide for you; the legal ones are general information, not legal advice.

**Legal (Italy and EU)**

- [x] Privacy notice: written in both languages in the section above.
- [ ] Fill its three placeholders (city, contact email, launch date). If you want certainty, have a professional read it once.
- [x] No cookies are set, so no cookie banner. QA confirms this on the live site.
- [ ] If you have a partita IVA and the site relates to your work, show it in the footer: Italian law requires it on the website.
- [ ] One-line comment policy above the form (for example: "I remove spam and personal attacks").
- [ ] Recognisable people in photos: get consent, especially for minors; when unsure, don't publish.

**Photos**

- [x] Licence: all rights reserved, AI training refused (see the section above).
- [x] AI-training crawlers: blocked in `robots.txt`, headers and photo metadata by the agents.
- [ ] In the Cloudflare dashboard, under Security → Settings → Bot traffic, set AI training crawlers to disallowed and turn on Bot Preference Sync. Turn off Email Address Obfuscation (it is on by default and adds a script), and keep Bot Fight Mode, Web Analytics automatic setup, Speed Brain, Rocket Loader, Zaraz and Cloudflare Fonts off. Only you can do this; `docs/setup.md` will list the clicks.

**Brand (deferred: you'll choose it later)**

- [ ] Choose a brand identity and favicon when you're ready. Until then the site ships a plain moss-green square as favicon and a typographic share image (title in Crimson Pro Light, your name, a moss rule); swapping them later means replacing the files in `src/assets/brand/`, not editing templates.
- [x] Print stylesheet: assigned to the design agent.

**Content and checks**

- [ ] About and Now in both languages, 3–5 entries, 1–2 photo series with alt text in both languages.
- [ ] Your profiles linking to philglov.es (see the SEO section).
- [ ] Publish one test entry end to end from a real phone on a slow connection, then delete it.

## Decisions still yours to make

Nine choices only you can make; the recommended default is in brackets so the agents can start without waiting.

- [ ] Domain: philglov.es (decided). Also register filippoguanti.com as a 301 redirect.
- [ ] Fonts: Crimson Pro only, two files (decided 12 November 2026; replaces Archivo, Source Serif 4 and JetBrains Mono).
- [ ] Accent colour: moss green #4A5D23 / #A9BF78 (decided).
- [ ] Comment email: required like Sivers, or optional. \[required, never shown — it filters drive-by spam and lets you reply\]
- [ ] Pre-moderate every comment, or publish instantly and remove later. \[pre-moderate\]
- [ ] Hosting: Cloudflare, with the database and photo storage in its EU jurisdiction, or an EU-only VPS. \[Cloudflare\]
- [ ] Show camera data under photos. \[yes, in small muted text\]
- [ ] Translation: by hand, with no AI (decided). Like Sivers, you can say every word on the site is yours.
- [ ] Newsletter later (e.g. email on new posts). \[not at launch; RSS first\]

Decided since: all rights reserved with AI training refused; AI-training crawlers blocked; privacy notice written; data stored in Cloudflare's EU jurisdiction; brand identity and favicon chosen later, with a neutral placeholder until then. Still open: whether AI assistants may open a page to answer a question about you \[allowed\]; and whether the repository is private on a paid GitHub Pro plan \[recommended\] or public on the free plan.

## Sources

- [Derek Sivers — home](https://sive.rs/) and [a post with the comment form](https://sive.rs/fit)
- [Riccardo Palombo — riccardo.im](https://riccardo.im/) (built with Hugo 0.85)
- [Scrivi.la](https://scrivi.la/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [limits](https://developers.cloudflare.com/workers/platform/limits)
- [Cloudflare Pages vs Workers (Flavio Copes)](https://flaviocopes.com/cloudflare-pages-vs-workers.md) and [Pages maintenance mode](https://www.morphllm.com/comparisons/cloudflare-pages-vs-workers)
- [Cloudflare acquires Astro — press release](https://www.nasdaq.com/press-release/cloudflare-acquires-astro-accelerate-future-high-performance-web-development-2026-01) and [Astro 6 adds CSP support](https://itdaily.com/news/business/cloudflare-neemt-astro-over)
- [Gizmodo ClickFix incident](https://hackmag.com/news/gizmodo-clickfix) and [ClickFix via compromised WordPress sites](https://vpncentral.com/?p=252115)
- Psychology and typography studies in the design section are cited from memory (author, year); verify before quoting.

* URLs, domain and languages: [Google on multilingual sites](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites), [country-code domains and geotargeting](https://www.humanlevel.com/en/digital-marketing-dictionary/geotargeting-domain-search-engines), [.es registration requirements](https://www.namecheap.com/support/knowledgebase/article.aspx/9246/36/es-domain-registration-requirements/)
* AI training and rights: [Directive 2019/790, Article 4](https://www.ippt.eu/legal-texts/dsmc/article-4), [Italy's 2025 AI law and copyright](https://communia-association.org/2025/10/01/italy-updates-its-copyright-law-to-address-ai/), [Creative Commons on AI training](https://creativecommons.org/2021/03/04/should-cc-licensed-content-be-used-to-train-ai-it-depends/), [TDM Reservation Protocol](https://specification.website/spec/agent-readiness/tdmrep/), [IPTC Data Mining property](https://iptc.org/news/exclude-images-from-generative-ai-iptc-photo-metadata-standard-2023-1/)
* AI crawlers: [Cloudflare managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt), [Content Signals Policy](https://blog.cloudflare.com/content-signals-policy/?tab=suite), [AI crawler list, Q3 2026](https://technologychecker.io/blog/ai-crawler-list)
* Data location: [D1 jurisdictions](https://developers.cloudflare.com/d1/configuration/data-location/)
