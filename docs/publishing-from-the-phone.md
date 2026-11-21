# Publishing from the phone

How to write, edit and publish an entry from `/admin/write`. The rules behind it are in decisions
[0017](decisions/0017-backend-worker.md), [0021](decisions/0021-publishing-goes-live.md),
[0027](decisions/0027-fix-round-1-backend.md) and [0029](decisions/0029-write-the-other-language.md).

Until launch this is staging's `/admin/write`. From launch, write and edit entries with photos on
`philglov.es/admin/write` only: staging and preview then stop storing photos and say so (decision
[0031](decisions/0031-photos-at-launch.md)).

## A new entry

1. Open `/admin/write` and sign in with the one-time code (Cloudflare Access).
2. Write the title. The slug is suggested from it; change it if you like (it is the address: `/slug`, `/it/slug`).
3. Pick the language you are writing in, then the description (one sentence) and the text, in Markdown. The cheat
   sheet under the text box lists what you can use. Plain HTML for text (`<abbr>`, `<kbd>`, `<details>`, a table)
   is fine; anything that could redirect, embed, collect or run something (a `<meta>`, `<iframe>`, `<form>`,
   `<script>`, `<style>`, a `javascript:` link) fails the checks, and the pull request says which (decision 0030).
4. Photos (JavaScript needed): pick them, and they upload one at a time, retrying by themselves. Write each one's alt
   text (what is in it and why it matters) and, if you like, a caption. While a photo is still uploading, Publish and
   Save draft wait for it and say so.
5. Tap **Publish**. The entry goes live by itself in a few minutes, once the checks pass. If it is still waiting after
   15 minutes, the page lists it under "On their way" as needing attention, with its pull request. Publish and Save
   draft grey out and say "Sending…" until the answer arrives. A second tap, or reloading the "Published" page, opens
   nothing new: the page says "Already on its way" and links to the same pull request. A different text for the same
   entry waits until the first is live (decision 0036).

What you type is kept in the browser as you go. **Save draft** keeps it on the server too, so you can finish on
another day or another device. Drafts are listed at the bottom of the page.

## The other language

Every word is written by you; nothing is translated. Each entry has one row in "Edit a published entry", with both
languages:

- a language that exists shows its title: tap it to edit that version;
- a language not written yet says **Write the English version** (or **Write the Italian version**): tap it.

That form already has:

- the same slug, fixed, so the two versions are paired;
- the same photos, with nothing to upload again. Their alt text and caption are empty, and the other version's are
  shown under each field as a hint. Write them in this language. You can remove a photo or add others;
- the other version's text under the form, for reference.

Write the title, description and text, then **Publish**. It opens its own pull request for this one file, and the
new version is marked as your translation of the original.

On an entry's form the **Language** choice shows both versions and what they are: "published", "not written yet",
"draft saved", or "on its way" (published a moment ago, not merged yet). Choose the other one to go to it. Without
JavaScript, tap **Switch** next to it. What you typed is kept either way, and it is there again when you come back.

Straight after publishing an entry, the confirmation offers **Write the Italian version** (or **Edit the …
version**). If you write it before the first version is live, you can save it as a draft. Publish waits until the
first version is on the site, usually a few minutes.

Typing an existing slug into a new entry in the other language still works too.

## Editing

Tap an entry's title in the list. The slug and the language stay as they are, so links never break. **Save changes**
replaces only that file. If the entry was changed on the laptop since you opened it, nothing is overwritten and the
page says so. If you have a draft of that version, the form opens your draft and says when you saved it; delete the
draft under Drafts to start again from the published text.

A file the page cannot keep exactly (a title over several lines, for example) is not opened here: edit it on the
laptop.
