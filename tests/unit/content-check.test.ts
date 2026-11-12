import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContent, imagesWithoutAlt, type ContentFile } from "../../scripts/lib/content-check.ts";
import { newEntry } from "../../scripts/lib/new-entry.ts";
import { labelText } from "../../src/lib/language-label.ts";

const file = (path: string, lang: string, originalLang: string, body = "Text."): ContentFile => ({
  path,
  text: `---\ntitle: "T"\nlang: ${lang}\noriginalLang: ${originalLang}\n---\n${body}\n`,
});

const good = [
  file("journal/it/lisbona.md", "it", "it"),
  file("journal/en/lisbona.md", "en", "it"),
  file("journal/en/one-roll.md", "en", "en"),
  file("pages/en/about.md", "en", "en"),
];

test("the seed-shaped content passes", () => assert.deepEqual(checkContent(good), []));

test("a translation without its original is caught", () => {
  const out = checkContent([file("journal/en/lonely.md", "en", "it")]).join("\n");
  assert.match(out, /is a translation .* it\/lonely\.md does not exist/);
});

test("a translation whose originalLang disagrees with its twin's lang is caught", () => {
  const out = checkContent([file("journal/it/x.md", "it", "en"), file("journal/en/x.md", "en", "it")]).join("\n");
  assert.match(out, /does not match its twin's lang|differs from its twin's originalLang/);
});

test("two originals for one slug are caught", () => {
  const out = checkContent([file("journal/it/x.md", "it", "it"), file("journal/en/x.md", "en", "en")]);
  assert.ok(out.some((p) => /both versions claim to be the original/.test(p)));
});

test("lang must match the folder", () => {
  assert.match(checkContent([file("journal/it/x.md", "en", "en")]).join(), /does not match its folder/);
});

test("reserved and taken slugs fail", () => {
  assert.match(checkContent([file("journal/en/journal.md", "en", "en")]).join(), /reserved slug/);
  assert.match(checkContent([file("journal/en/about.md", "en", "en")]).join(), /reserved slug/);
  const taken = [file("journal/en/colophon.md", "en", "en"), file("pages/en/colophon.md", "en", "en")];
  assert.match(checkContent(taken).join(), /already taken/);
  assert.match(checkContent([file("journal/en/Bad_Slug.md", "en", "en")]).join(), /lowercase ASCII/);
});

test("images need alt text", () => {
  assert.deepEqual(imagesWithoutAlt("![A quay at dusk](a.jpg) ![](b.jpg) ![ ](c.jpg)"), ["b.jpg", "c.jpg"]);
  assert.deepEqual(imagesWithoutAlt('<img src="d.jpg"> <img src="e.jpg" alt="ok">'), ["d.jpg"]);
  assert.match(checkContent([file("journal/it/x.md", "it", "it", "![](a.jpg)")]).join(), /no alt text .* Italian/);
});

test("the label has the right text in both languages for the three states", () => {
  const a = labelText("en", "en", true, "/alps");
  assert.deepEqual([a.text, a.action, a.href], ["Written in English", "Leggi in italiano →", "/it/alps"]);
  const b = labelText("it", "it", true, "/alps");
  assert.deepEqual([b.text, b.action, b.href], ["Scritto in italiano", "Read in English →", "/alps"]);
  const c = labelText("en", "it", true, "/lisbona");
  assert.deepEqual(
    [c.marker, c.text, c.action, c.href],
    ["IT→EN", "Originally written in Italian", "Read the original →", "/it/lisbona"],
  );
  const d = labelText("it", "en", true, "/x");
  assert.deepEqual(
    [d.marker, d.text, d.action],
    ["EN→IT", "Scritto originariamente in inglese", "Leggi l’originale →"],
  );
  const e = labelText("it", "it", false, "/alps");
  assert.deepEqual([e.text, e.action, e.href], ["Scritto in italiano", "Non ancora disponibile in inglese", undefined]);
  assert.equal(labelText("en", "en", false, "/x").action, "Not yet available in Italian");
});

test("pnpm new: fresh entry is its own original; the other language copies originalLang and tags", () => {
  const fresh = newEntry({ slug: "alps", lang: "it", today: "2026-11-12" });
  assert.match(fresh, /lang: it\noriginalLang: it/);
  const twinText = "originalLang: it\ntags: [travel, photography]\n";
  const twin = newEntry({ slug: "lisbona", lang: "en", today: "2026-11-12", twinText });
  assert.match(twin, /lang: en\noriginalLang: it/);
  assert.match(twin, /tags: \[travel, photography\]/);
  assert.throws(() => newEntry({ slug: "journal", lang: "en", today: "2026-11-12" }), /reserved/);
  assert.throws(() => newEntry({ slug: "colophon", lang: "en", today: "x", pageSlugs: ["colophon"] }), /taken/);
});

test("a created pair passes the check", () => {
  const it = newEntry({ slug: "alps", lang: "it", today: "2026-11-12" });
  const en = newEntry({ slug: "alps", lang: "en", today: "2026-11-12", twinText: it });
  const files = [
    { path: "journal/it/alps.md", text: it },
    { path: "journal/en/alps.md", text: en },
  ];
  assert.deepEqual(checkContent(files), []);
});
