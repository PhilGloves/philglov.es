# QA manual checklist

Tick each release (copy this file into the release notes and fill it in). The automated suites cannot do these.

Release: ______ Date: ______ Tester: ______ Build / commit: ______

## Publishing from a real phone, on a throttled connection

- [ ] Phone on mobile data or a throttled Wi-Fi (about 1.6 Mbit/s, 150 ms). Open `/admin/write` (Access login works).
- [ ] Write a short entry with a title and one photo (JPEG, straight from the camera roll). The upload shows
      progress; switch to airplane mode for ten seconds in the middle and back: it retries by itself.
- [ ] Lock the phone and come back after five minutes: the text is still there.
- [ ] Publish. The page says where the entry will be live. The pull request merges by itself and the entry is online in
      a few minutes, in both menus (journal index, feed).
- [ ] Open the entry on the phone: the photo has its alt text and no location data (download it: no GPS in its details).
- [ ] Edit the entry from the phone ("Edit a published entry"): one pull request, merged by itself.
- [ ] Once it is live, tap "Write the Italian version" on its row: the slug is fixed, the photo is there without an
      upload, its English alt text shows under the empty field. Switch to English and back: what you typed is still
      there. Publish: a second pull request, the Italian file only, merged by itself; the two versions link each other.
- [ ] Delete the test entry afterwards (laptop: remove the file in a pull request).

## Screen readers

For each: home page, one entry, the comment form (fill it, send an invalid one, send a valid one).

- [ ] VoiceOver, iOS Safari: skip link, headings, the language switch is announced with the language it leads to, the
      theme button says pressed or not, form errors are read out, the thank-you is read out.
- [ ] TalkBack, Android Chrome: the same.
- [ ] The decorative arrows are not read; the "Comments" link is read as a link with a name.

## An old phone

- [ ] A real old phone (three or more years of age) on a throttled connection: the home page is readable in under
      three seconds, scrolling is smooth, the photo grid does not jump.

## CSS off

- [ ] Read an entry with CSS disabled (Firefox: View → Page Style → No Style): the order is skip link, name, menu,
      entry, comments, form, footer; headings are in order; every photo has its alt text; the forms are usable.

## Things only a person notices

- [ ] The Italian version reads as written by a person, not translated; same for the English one.
- [ ] Photographs look right in the dark theme (owner decision P7 still open).
- [ ] The print preview of an entry looks like a page of a book.
