# 0012 — Both languages written by hand; no translation tooling

Status: Accepted · 2026-11-11 · Owner decision · Supersedes [0011](0011-ci-translation.md) · Source: docs/guide.md
(brief rule 5; Decision guide #9; Lead prompt 5 and 12; Content & i18n prompt; "The originally written in label";
"Publishing from your phone")

**Decision.**

- No AI translation anywhere. There is no translation script, CI job, `pnpm translate` or `pnpm review` command, API,
  key, secret or dependency, and none may be added.
- The frontmatter has no `translation` field. A page is the original when `lang` equals `originalLang`, and the
  owner's own translation otherwise. The schema is `.strict()`, so a leftover `translation:` key fails the build.
- An entry may exist in one language only. It is still listed in the other language's journal index and topic pages,
  marked `IT only` (on English pages) or `solo EN` (on Italian pages), linking to the version that exists with the
  right `lang` attribute. It appears only in its own language's feed.
- `hreflang` pairs (en, it, x-default) are emitted only when both versions exist.
- The label under each entry's title follows the guide's table: "Written in English · Leggi in italiano →" for an
  original with a twin, "Originally written in Italian · Read the original →" for a translation, and "Written in
  English · Not yet available in Italian" for an original without a twin (and the Italian equivalents).
- Laptop: `pnpm new <slug> --lang it|en` creates a filled-in entry, or the other-language version of an existing one
  with `originalLang` taken from it (ticket C4). Phone: `/admin/write` with an existing slug in the other language
  creates that entry's other-language version, with the existing text shown for reference (ticket B8).
- Photo alt text and captions in the other language are written by hand too; an entry photo may carry alt text in one
  language until its entry is translated.

**Reason.** The owner wants every word on the site to be their own. It also removes an outside service, an API key, a
CI job that commits to pull requests, and the conflict between that commit and branch protection described in 0011.

**Rejected.** AI translation reviewed by the owner (0011, superseded). Showing nothing in the other language until an
entry is translated (readers of one language would never learn the entry exists).
