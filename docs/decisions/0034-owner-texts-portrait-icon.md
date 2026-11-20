# 0034 — The owner's texts, the portrait and the icon

Status: Accepted · 2026-11-20 · Owner request · Answers O1 (all but the launch date) and TO-03; amends
[0016](0016-frontend-pages.md) (the footer's rights line) and [0019](0019-photo-pipeline.md) (the portrait is an original)

## Decisions

1. **The owner's texts, exactly as written** (no rewording, no correction, no translation): Home's introduction and
   search sentence, About and Now in both languages with their search sentences, the city, the contact address and the
   profiles in `site.json`. The Italian search sentence of Home was not given, so it stays as it was until the owner
   writes it. Markdown renders straight apostrophes as typographic ones, as on every page of the site. About and Now
   carry the date of the change (2026-11-20; Now shows it as "Updated").
2. **City.** `site.json` `city` is "Msida, Malta": About's contact list and the home line, which now takes it as
   `{city}` ("Based in {city}. …" / "Vivo a {city}. …"), so the city is written once. The Privacy page names Torino
   (the controller's address), written in its text. The launch date stays a gap until launch.
3. **Footer.** The rights line ends at "All rights reserved" / "Tutti i diritti riservati": the owner removed "No AI
   training". Nothing else changes about AI: robots.txt, the TDM headers, `tdmrep.json`, the photo metadata and the
   Rights text keep the reservation.
4. **The portrait is an original like the others.** `site.json` `portrait` is `{ file, alt: { en, it } }`: `file` is its
   key in the photo bucket (`portrait/finisterre.jpg`), never a file in git. `contentKeys` includes it, so the build
   fetches it and the launch copy (0031) moves it to production. About draws it with `<Photo>` (`SIZES.portrait`,
   `priority`: it is the page's first image); the Person data on Home and About names a 1200 px JPEG made from it
   (`portraitImage()`, `src/lib/portrait.ts`), so `personJsonLd(image)` takes the image path instead of reading `site.json`. Until the original has been fetched, About keeps the placeholder frame (with the real alt text) and
   the Person data has no image, which the launch gate reports. The phone photo carried an exact GPS position: the
   copy uploaded to the bucket has its GPS and XMP blocks removed with exiftool (image data unchanged), and the build's
   outputs carry no metadata but the rights fields, which `scripts/photo-rights.ts` checks. `/imgs/` (the owner's
   folder with the original) is git-ignored.
5. **The icon is the owner's.** `favicon.svg` is the owner's SVG, checked to contain only drawing elements (svg,
   title, rect, path); `tests/unit/brand.test.ts` now refuses any SVG icon with a script, event handler, link, style,
   `url()` or embedded image. `site-icon.png` (512 px) is committed as the source; `scripts/make-brand-icons.ts` draws
   `favicon-32.png` and `apple-touch-icon.png` from it with sharp; `/favicon.ico` is still built from `favicon-32.png`
   by `postbuild`. The owner's three-size `favicon.ico` is not used: the one built from the PNG follows any later change
   of the icon by itself.
