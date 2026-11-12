import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import bots from "../../src/data/ai-bots.json" with { type: "json" };
import { robotsTxt, tdmrepJson } from "../../src/lib/robots.ts";
import { blogPostingJsonLd, imageObjectJsonLd, jsonLdText, personJsonLd } from "../../src/lib/seo.ts";
import { rssFeed, sitemapXml } from "../../src/lib/xml.ts";

test("robots.txt is exactly the one in the guide", () => {
  const guide = readFileSync(new URL("../../docs/guide.md", import.meta.url), "utf8");
  const block = /```text\n(# philglov\.es — ©[\s\S]*?)\n```/.exec(guide)?.[1];
  assert.ok(block, "robots.txt block not found in docs/guide.md");
  assert.equal(robotsTxt(), `${block}\n`);
});

test("robots.txt: search allowed, AI training refused, every bot from the data file, sitemap", () => {
  const txt = robotsTxt();
  assert.match(txt, /Content-Signal: search=yes, ai-train=no/);
  for (const bot of bots.trainingBots) assert.equal(txt.split(`User-agent: ${bot}\n`).length, 2, bot);
  for (const bot of bots.notBlockedOnPurpose) assert.doesNotMatch(txt, new RegExp(`User-agent: ${bot}(?![-\\w])`), bot);
  assert.match(txt, /Sitemap: https:\/\/philglov\.es\/sitemap\.xml/);
  assert.match(txt, /Disallow: \/api\//);
});

test("tdmrep.json reserves the whole site (TDM Reservation Protocol)", () => {
  assert.deepEqual(JSON.parse(tdmrepJson()), [{ location: "/", "tdm-reservation": 1 }]);
});

test("Person JSON-LD names Filippo Guanti, both languages, and omits an empty sameAs", () => {
  const person = personJsonLd("en");
  assert.equal(person["@type"], "Person");
  assert.equal(person["name"], "Filippo Guanti");
  assert.deepEqual(person["knowsLanguage"], ["en", "it"]);
  assert.deepEqual(person["alternateName"], ["Phil Guanti", "philglov"]);
  assert.equal("sameAs" in person, false);
  assert.equal(personJsonLd("it")["jobTitle"], "Fotografo e sviluppatore");
});

test("BlogPosting JSON-LD has author, date, language", () => {
  const post = blogPostingJsonLd({
    title: "T",
    description: "D",
    url: "https://philglov.es/alps",
    datePublished: new Date("2026-10-21"),
    lang: "en",
    image: "https://philglov.es/_assets/share/en-alps.png",
  });
  assert.equal(post["@type"], "BlogPosting");
  assert.equal(post["datePublished"], "2026-10-21");
  assert.equal(post["inLanguage"], "en");
  assert.deepEqual((post["author"] as Record<string, unknown>)["@id"], "https://philglov.es/#person");
});

test("ImageObject JSON-LD has creator, credit, copyright, licence and the licensing page /rights", () => {
  const image = imageObjectJsonLd({
    pageUrl: "https://philglov.es/photos/lisbon/tram-28",
    name: "Tram 28",
    caption: "Tram 28",
    description: "A tram",
    dateCreated: new Date("2026-10-12"),
    lang: "en",
    rightsPath: "/rights",
  });
  assert.equal(image["@type"], "ImageObject");
  assert.equal((image["creator"] as Record<string, unknown>)["name"], "Filippo Guanti");
  assert.equal(image["creditText"], "Filippo Guanti");
  assert.match(String(image["copyrightNotice"]), /^© 2026 Filippo Guanti\. All rights reserved/);
  assert.equal(image["license"], "https://philglov.es/rights");
  assert.equal(image["acquireLicensePage"], "https://philglov.es/rights");
});

test("JSON-LD text can never close its own script tag", () => {
  assert.doesNotMatch(jsonLdText({ a: "</script><script>alert(1)</script>" }), /</);
});

test("RSS escapes text and lists each item once", () => {
  const xml = rssFeed({
    title: "A & B",
    description: "d",
    link: "https://philglov.es/",
    self: "https://philglov.es/feed.xml",
    lang: "en",
    items: [
      {
        title: "<b>x</b>",
        link: "https://philglov.es/x",
        description: "y",
        date: new Date("2026-10-21"),
        categories: ["Travel"],
      },
    ],
  });
  assert.match(xml, /<title>A &amp; B<\/title>/);
  assert.match(xml, /<title>&lt;b&gt;x&lt;\/b&gt;<\/title>/);
  assert.equal(xml.split("<item>").length, 2);
  assert.match(xml, /<language>en<\/language>/);
});

test("sitemap carries hreflang alternates only where given", () => {
  const xml = sitemapXml([
    {
      loc: "https://philglov.es/a",
      alternates: { en: "https://philglov.es/a", it: "https://philglov.es/it/a" },
    },
    { loc: "https://philglov.es/only" },
  ]);
  assert.equal(xml.split('rel="alternate"').length, 3);
  assert.match(xml, /<loc>https:\/\/philglov\.es\/only<\/loc>\n {2}<\/url>/);
});
