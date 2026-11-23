# 0038 - The English sign-off reads "- Phil"

Status: Accepted · 2026-11-22 · Owner request · Amends [0023](0023-simplification-pass.md) (item 5: the sign-off "did
not change")

**Context.** Replies to comments are already signed "Phil" on English pages and "Filippo" on Italian ones (0023,
`w_replied`). The sign-off at the end of an entry (`signOff`) still read "- Filippo" in both languages.

## Decisions

1. `src/i18n/en.json` `signOff` is "- Phil". `src/i18n/it.json` stays "- Filippo". Nothing else changed in the
   template: `EntryView.astro` still prints `t(locale, "signOff")`.
2. The full name "Filippo Guanti" stays everywhere it appears (titles, header, footer, About, Rights, Privacy, the
   Person and BlogPosting data, feeds, photo rights). Only the first name alone, in English, is a choice of voice.
3. Other English text that names the owner by first name alone is not changed by this decision; it is listed in the
   pull request for the owner to rule on.

## Consequences

- `tests/e2e/header-entry.spec.ts` pins both sign-offs. The `entry` visual baselines (win32, 8 images) were
  regenerated, since the English sign-off is drawn on that page.
