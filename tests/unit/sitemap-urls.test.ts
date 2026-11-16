import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlots, type EntryLike } from "../../src/lib/entries.ts";
import { sitemapUrls } from "../../src/lib/sitemap-urls.ts";

const entries = (count: number, lang: "en" | "it" = "en"): EntryLike[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${lang}/entry-${i}`,
    body: "word ",
    data: {
      title: `Entry ${i}`,
      description: "d",
      date: new Date(Date.UTC(2026, 0, 1 + i)),
      lang,
      originalLang: lang,
      comments: true,
    },
  }));

const locs = (count: number, lang: "en" | "it" = "en") =>
  sitemapUrls({ slots: buildSlots(entries(count, lang)), pages: [], series: [] }).map((u) => u.loc);

// SO-07: the journal index is paginated at 50, and its later pages are pages too.
test("sitemap: 50 entries make one journal page, 51 make /journal/page/2 in both languages", () => {
  const fifty = locs(50);
  assert.ok(fifty.includes("https://philglov.es/journal"));
  assert.ok(!fifty.some((l) => l.includes("/page/")));

  const urls = sitemapUrls({ slots: buildSlots(entries(51)), pages: [], series: [] });
  const page2 = urls.filter((u) => u.loc.endsWith("/journal/page/2"));
  assert.deepEqual(
    page2.map((u) => u.loc),
    ["https://philglov.es/journal/page/2", "https://philglov.es/it/journal/page/2"],
  );
  for (const u of page2)
    assert.deepEqual(u.alternates, {
      en: "https://philglov.es/journal/page/2",
      it: "https://philglov.es/it/journal/page/2",
      "x-default": "https://philglov.es/journal/page/2",
    });
  assert.ok(!locs(51).some((l) => l.endsWith("/page/3")));
});

test("sitemap: 101 entries make pages 2 and 3, and an Italian-only collection paginates the same way", () => {
  assert.ok(locs(101).some((l) => l.endsWith("/it/journal/page/3")));
  assert.ok(locs(51, "it").some((l) => l.endsWith("/journal/page/2")));
});

test("sitemap: every entry, page and photo is still listed once", () => {
  const urls = sitemapUrls({
    slots: buildSlots(entries(2)),
    pages: [
      { id: "en/about", data: { lang: "en" } },
      { id: "it/about", data: { lang: "it" } },
      { id: "en/solo", data: { lang: "en" } },
    ],
    series: [{ slug: "lisbon", photos: [{ id: "tram" }] }],
  }).map((u) => u.loc);
  assert.equal(new Set(urls).size, urls.length);
  for (const l of [
    "/entry-0",
    "/entry-1",
    "/about",
    "/it/about",
    "/solo",
    "/photos/lisbon",
    "/it/photos/lisbon/tram",
    "/photos",
    "/it",
  ])
    assert.ok(urls.includes(`https://philglov.es${l}`), l);
  assert.ok(!urls.includes("https://philglov.es/it/solo"));
});
