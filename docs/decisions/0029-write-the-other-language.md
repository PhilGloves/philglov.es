# 0029 — Writing an entry's other language on the phone: from the entry, with its slug and photos

Status: Accepted · 2026-11-16 · Owner request · Amends [0012](0012-hand-written-translations.md) (the phone path),
[0017](0017-backend-worker.md) (B8, `/admin/write`) and [0021](0021-publishing-goes-live.md) (the list of published
entries, the edit form's language)

**Context.** On `/admin/write`, an entry's other-language version used to be made by starting a new entry and
typing the same slug again, then uploading every photo a second time. The owner asked for the other language to be
written from the entry itself. The form still saves one language at a time. Both versions are still written by hand:
0012 stands, and nothing here translates or suggests text.

## Decisions (owner request)

1. **One row per entry.** The list of published entries has one row per slug, with the date of the original, the
   slug, and one line per language, English first. A version that exists links to its edit form as before, with its
   title as the link and the language before it ("English: …"). A version that does not exist yet is the link
   "Write the English version" / "Write the Italian version". The search matches the title in either language
   (`entryRows`, which replaces `entriesFor`).
2. **One address per version.** `/admin/write?edit=1&slug=…&lang=…` is the entry in that language: its edit form when
   the file exists on `main`; when it does not and the other language does, the form that writes it. The links in
   the list, the language choice and the confirmation all lead there.
3. **The form for a version not written yet** opens with:
   - the slug fixed (`readonly`), with the hint "The same as the English version's, so the two are paired.";
   - title, description and text empty, and the existing version under the form for reference, as before;
   - the same photographs, by the same stored keys in `philglov-originals/<slug>/`: nothing is uploaded or stored
     again (the keys are per slug, and the slug is the same). Each photo's alt text and caption are empty. The
     existing version's alt text and caption are shown under the fields as a hint, in its own `lang` and linked
     with `aria-describedby`; an empty one says "The English version has no caption." A photo can be removed and
     others uploaded. Alt text stays required for every photo before Publish: the browser's `required`, and the
     server's check as for any entry.
   - The heading is "Write the Italian version" (or English). A hidden `twin=1` keeps this form's mode through a
     refused Publish and in a saved draft (migration `0003_draft_twin.sql`, column `twin`).
4. **The language choice.** On an entry's form (an edit, or a version not written yet) the language is a dropdown
   labelled "Language" with both versions, each with its state: "published", "on its way" (a publisher pull request
   is open for it, not merged), "draft saved" (a server draft exists for it) or "not written yet". For example
   "Italiano · published" and "English · not written yet". The language names are their own ("English",
   "Italiano"), as in the new-entry form's choice. Choosing the other version opens the same entry in that language:
   - with JavaScript, on change. The script writes the typed text to the browser copy at once instead of 400 ms
     later. The browser copy of an entry's form has one key per version (`edit-<lang>-<slug>`), so the text is there
     again on switching back, restored like any browser copy. The choice is not a field and is never autosaved. A
     photo still uploading holds the switch as it holds Publish (TO-01, 0027), because leaving the page would lose it.
   - without JavaScript, with the "Switch" button next to the dropdown (hidden by the script). It posts the form as
     `intent=switch`. If anything was typed, the Worker keeps it as a server draft of that version and says so on the
     next page: "What you typed in Italian is kept as a draft, and is there again when you switch back." Then it
     redirects to the other version. "Anything typed" is decided by a hash of what the form held when it opened
     (hidden `opened`): a form that was only looked at leaves no draft behind. A form that is already a draft is
     always saved.
   - Either way, the version's address opens **the newest server draft of that version** when one exists, saying
     "Opened your draft of this version, saved … UTC. To start again from the published text (an empty form), delete
     the draft under Drafts." An edit's draft must have a `base_sha`, and a version's must have `twin = 1`, so a
     new-entry draft that happens to use the slug is never taken for one. This also applies to the links in the list,
     which used to open the file even when a draft of that edit existed. Opening the draft is what the browser copy
     already did with JavaScript on.
   - The blank form for a brand-new entry keeps its plain choice of English or Italiano. Typing a slug that exists in
     the other language works as before (the hint, the reference text, `originalLang` from the existing file).
5. **Publish is unchanged:** one file, its own pull request, auto-merge (0021), `originalLang` from the existing
   version. The confirmation now also links to the other language: "Edit the English version" when it exists on
   `main`, "Write the Italian version" when it does not.

## Decided here (not in the request)

- **A version written from one still on its way.** Right after a brand-new entry is published, its file is only on
  the publisher branch, so "Write the Italian version" would find nothing on `main`. The form therefore also reads
  the existing version from the newest open publisher pull request for it (`publish/<lang>-<slug>-<stamp>`, from the
  list of open pull requests, which now carries each one's branch). The text, the reference and the photos can be
  written and saved as a draft at once. **Publish waits:** a translation whose original is not on `main` fails the
  content check ("is a translation … but … does not exist"), so the page refuses it: "Not published yet. The English
  version is not on the site yet: its pull request may still be on its way. Save a draft, and publish this once it
  is live." In the language choice that version is "on its way" and cannot be chosen (`disabled`), because it cannot
  be edited before it is on `main`.
- **"draft saved"** as a fourth state, so the choice does not say "not written yet" about a version with a draft.
- **The reference `<pre>` wraps** (`.admin pre`): its long lines (photo paths) made the page 527 px wide at 390.
  That was already true for the old path; the new form shows the reference every time.
- **The held-upload message** names the switch on an entry's form: "Publish, Save draft and the language switch work
  as soon as it has finished, or remove it."
- The drafts list marks a version's draft "other-language version".

## How it is tested

Each test failed before the change.

- `tests/worker/write.test.ts`, "writing the other-language version of a published entry":
  - the list has one row per slug and the missing language's link;
  - the version form: slug, empty fields, reference, the same keys, empty alt text and captions with their hints,
    the choice's labels and Switch;
  - Publish: one new file with the same photo keys and `originalLang`, nothing stored twice in R2, and the
    confirmation's link;
  - Publish refused while a carried-over photo has no alt text;
  - a photo removed and another added;
  - the no-JavaScript switch from a version and from an edit: no draft when nothing was typed; a draft, the notice
    and the same text on switching back when something was;
  - the confirmation after a new entry;
  - the version still on its way;
  - the one-row grouping and the search in both titles (`entryRows`).
- `tests/e2e/admin-write.spec.ts`, with JavaScript on and off:
  - the missing language's link opens the form as in decision 3. No request goes to `/admin/upload`. Publish is
    stopped by the empty alt text, then writes `it/foto.md` with the English photo's key and `originalLang: en`.
  - switching language and back keeps the title, the text and a photo's alt text, with the hint still attached.
    With JavaScript the browser copy does it; without it, a server draft does.
- `tests/e2e/qa/phone.spec.ts`: the other-language test now starts from the entry's row, at 390 px, and checks the
  page stays 390 px wide. Typing the slug into a new entry keeps its own test.
