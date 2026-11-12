import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSlots,
  fmt,
  journalPath,
  labelState,
  markerFor,
  paginate,
  pathFor,
  readingMinutes,
  rowsFor,
  type EntryLike,
  type Locale,
} from "../../src/lib/entries.ts";

const entry = (
  id: string,
  date: string,
  originalLang: Locale,
  extra: Partial<EntryLike["data"]> = {},
  body = "word ",
): EntryLike => ({
  id,
  body: body.repeat(1),
  data: {
    title: id,
    description: "d",
    date: new Date(date),
    lang: id.startsWith("it/") ? "it" : "en",
    originalLang,
    tags: ["travel"],
    comments: true,
    ...extra,
  },
});

// lisbona: Italian original (21 Oct) with a hand-written English twin dated later;
// roll: English only (9 Oct); alps: Italian only (1 Nov).
const entries = [
  entry("it/lisbona", "2026-10-21", "it"),
  entry("en/lisbona", "2026-10-25", "it"),
  entry("en/roll", "2026-10-09", "en"),
  entry("it/alps", "2026-11-01", "it"),
];

test("twins share a slug and a number; the number follows the original's publication date", () => {
  const slots = buildSlots(entries);
  assert.deepEqual(
    slots.map((s) => [s.slug, s.number]),
    [
      ["roll", 1],
      ["lisbona", 2],
      ["alps", 3],
    ],
  );
  const lisbona = slots[1];
  assert.equal(lisbona?.date.toISOString().slice(0, 10), "2026-10-21");
  assert.equal(lisbona?.versions.en?.isOriginal, false);
  assert.equal(lisbona?.versions.it?.isOriginal, true);
});

test("reading time comes from the word count, never below one minute", () => {
  assert.equal(readingMinutes(undefined), 1);
  assert.equal(readingMinutes("one two three"), 1);
  assert.equal(readingMinutes("word ".repeat(200)), 1);
  assert.equal(readingMinutes("word ".repeat(201)), 2);
  assert.equal(readingMinutes("word ".repeat(1000)), 5);
});

test("the journal lists entries that exist in the other language only, marked IT only / solo EN", () => {
  const slots = buildSlots(entries);
  const en = rowsFor(slots, "en");
  assert.deepEqual(
    en.map((r) => [r.number, r.slot.slug, r.only, r.marker, r.href]),
    [
      ["003", "alps", true, "IT only", "/it/alps"],
      ["002", "lisbona", false, "IT→EN", "/lisbona"],
      ["001", "roll", false, "EN", "/roll"],
    ],
  );
  const it = rowsFor(slots, "it");
  assert.deepEqual(
    it.map((r) => [r.number, r.slot.slug, r.only, r.marker, r.href]),
    [
      ["003", "alps", false, "IT", "/it/alps"],
      ["002", "lisbona", false, "IT", "/it/lisbona"],
      ["001", "roll", true, "solo EN", "/roll"],
    ],
  );
});

test("markers: an own translation shows the direction, an original shows its language", () => {
  assert.equal(markerFor({ lang: "en", originalLang: "it" }, "en"), "IT→EN");
  assert.equal(markerFor({ lang: "it", originalLang: "en" }, "it"), "EN→IT");
  assert.equal(markerFor({ lang: "en", originalLang: "en" }, "en"), "EN");
  assert.equal(markerFor({ lang: "it", originalLang: "it" }, "it"), "IT");
  assert.equal(markerFor({ lang: "it", originalLang: "it" }, "en"), "IT only");
  assert.equal(markerFor({ lang: "en", originalLang: "en" }, "it"), "solo EN");
});

test("the label has the three states of the guide's table", () => {
  assert.equal(labelState({ lang: "en", originalLang: "en" }, true), "original-twin");
  assert.equal(labelState({ lang: "en", originalLang: "it" }, true), "translation");
  assert.equal(labelState({ lang: "en", originalLang: "en" }, false), "original-only");
});

test("pagination: 50 to a page, always at least one page", () => {
  const items = Array.from({ length: 120 }, (_, i) => i);
  assert.deepEqual(
    [1, 2, 3].map((p) => paginate(items, p).items.length),
    [50, 50, 20],
  );
  assert.equal(paginate(items, 1).pages, 3);
  assert.equal(paginate([], 1).pages, 1);
  assert.equal(paginate(Array.from({ length: 50 }), 1).pages, 1);
  assert.equal(paginate(Array.from({ length: 51 }), 1).pages, 2);
});

test("paths: no trailing slash, /it in front, same slug", () => {
  assert.equal(pathFor("en", "/"), "/");
  assert.equal(pathFor("it", "/"), "/it");
  assert.equal(pathFor("it", "/alps"), "/it/alps");
  assert.equal(journalPath("en"), "/journal");
  assert.equal(journalPath("en", undefined, 2), "/journal/page/2");
  assert.equal(journalPath("it", "travel"), "/it/journal/travel");
  assert.equal(journalPath("it", "travel", 3), "/it/journal/travel/page/3");
});

test("fmt fills placeholders", () => {
  assert.equal(fmt("{n} entries since {year}.", { n: 2, year: 2026 }), "2 entries since 2026.");
});
