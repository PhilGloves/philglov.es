/**
 * A single line break typed in a journal entry is a line break on the page; an empty line still starts a new
 * paragraph (decision 0037). The owner writes on the phone, where one press of Enter means a new line.
 *
 * The Markdown is rendered here exactly as `astro build` renders it: the repository's own astro.config.ts, its
 * integrations' setup hooks, then the renderer of the configured processor. So these tests fail if the plugin is
 * missing from the config, and they fail if an Astro upgrade changes what the pipeline does with it.
 *
 * The owner's entries are never read here (decision 0033). The check that every line he typed is a line on his page
 * runs on the site's own build: tests/site/smoke.spec.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateConfig } from "astro/config";
import userConfig from "../../astro.config.ts";
import { collectionDir } from "../../scripts/lib/content-root.ts";
import { fixtureJournal } from "../fixtures/content.ts";
import { asLines, letters, typedParagraphs } from "../site/typed-lines.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const config = await validateConfig(userConfig, root, "build");
for (const integration of config.integrations)
  await integration.hooks["astro:config:setup"]?.({ config } as unknown as Parameters<
    NonNullable<(typeof integration.hooks)["astro:config:setup"]>
  >[0]);
// The same options, from the same config, as Astro's own content entry type passes (vite-plugin-markdown); its
// config types and the processor's are separate packages, so they are cast here as Astro's JavaScript does not need.
type RendererOptions = Parameters<typeof config.markdown.processor.createRenderer>[0];
const renderer = await config.markdown.processor.createRenderer({
  image: config.image,
  syntaxHighlight: config.markdown.syntaxHighlight,
  shikiConfig: config.markdown.shikiConfig,
  gfm: config.markdown.gfm,
  smartypants: config.markdown.smartypants,
} as unknown as RendererOptions);

/** A file in the journal folder of the content this run reads, and one in the pages folder. Neither has to exist. */
const ENTRY = new URL("en/sample.md", collectionDir("journal"));
const PAGE = new URL("en/sample.md", collectionDir("pages"));

const render = async (markdown: string, file: URL = ENTRY): Promise<string> =>
  (await renderer.render(markdown, { fileURL: file })).code.trim();

test("in an entry, a single line break is a line break and an empty line a new paragraph", async () => {
  assert.equal(await render("one\ntwo\n\nthree"), "<p>one<br>\ntwo</p>\n<p>three</p>");
  assert.equal(await render("one\ntwo\nthree"), "<p>one<br>\ntwo<br>\nthree</p>");
  // Several empty lines are still one paragraph break, never empty paragraphs or extra breaks.
  assert.equal(await render("one\n\n\n\ntwo"), "<p>one</p>\n<p>two</p>");
});

test("both journal languages get it; the standalone pages (About, Now, Rights, Privacy) do not", async () => {
  assert.equal(await render("uno\ndue", new URL("it/sample.md", collectionDir("journal"))), "<p>uno<br>\ndue</p>");
  assert.equal(await render("one\ntwo", PAGE), "<p>one\ntwo</p>");
  assert.equal(
    await render("- link to any page;\n- quote a short passage.", PAGE),
    "<ul>\n<li>link to any page;</li>\n<li>quote a short passage.</li>\n</ul>",
  );
});

test("Windows line endings, and a space left at the end of a line, change nothing", async () => {
  assert.equal(await render("one\r\ntwo\r\n\r\nthree"), "<p>one<br>\ntwo</p>\n<p>three</p>");
  assert.equal(
    await render("the one I like: _a name_. \nI do not know"),
    "<p>the one I like: <em>a name</em>.<br>\nI do not know</p>",
  );
});

test("a line break that was already forced (two spaces, a backslash) stays one line break", async () => {
  assert.equal(await render("one  \ntwo\\\nthree"), "<p>one<br>\ntwo<br>\nthree</p>");
});

test("italics, bold and link text may run over a line break", async () => {
  assert.equal(
    await render("_one\ntwo_ **three\nfour**"),
    "<p><em>one<br>\ntwo</em> <strong>three<br>\nfour</strong></p>",
  );
  assert.equal(
    await render("[some\nwords](https://example.com/a)"),
    '<p><a href="https://example.com/a">some<br>\nwords</a></p>',
  );
  assert.equal(await render("_one_\ntwo"), "<p><em>one</em><br>\ntwo</p>");
});

test("lists stay lists: one item per line, and a second line inside an item is a line break", async () => {
  assert.equal(await render("- one\n- two\n- three"), "<ul>\n<li>one</li>\n<li>two</li>\n<li>three</li>\n</ul>");
  assert.equal(await render("1. one\n2. two"), "<ol>\n<li>one</li>\n<li>two</li>\n</ol>");
  assert.equal(await render("- one\n  more\n- two"), "<ul>\n<li>one<br>\nmore</li>\n<li>two</li>\n</ul>");
  assert.equal(
    await render("text\n\n- one\n- two\n\ntext"),
    "<p>text</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<p>text</p>",
  );
});

test("a quotation stays a quotation, with its lines", async () => {
  assert.equal(await render("> one\n> two\n\nafter"), "<blockquote>\n<p>one<br>\ntwo</p>\n</blockquote>\n<p>after</p>");
});

test("headings are untouched: no line break is ever put inside one", async () => {
  assert.equal(await render("## A subheading\n\ntext"), '<h2 id="a-subheading">A subheading</h2>\n<p>text</p>');
  assert.equal(
    await render("text\n## A subheading\ntext"),
    '<p>text</p>\n<h2 id="a-subheading">A subheading</h2>\n<p>text</p>',
  );
  const twoLines = await render("A title\nin two lines\n===");
  assert.match(twoLines, /^<h1 id="[^"]+">A title\nin two lines<\/h1>$/);
});

test("footnotes still work: the reference, the note and its way back", async () => {
  const html = await render("one[^1]\ntwo\n\n[^1]: The note.");
  assert.match(
    html,
    /^<p>one<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref[^>]*>1<\/a><\/sup><br>\ntwo<\/p>/,
  );
  assert.match(html, /<section data-footnotes class="footnotes">/);
  assert.match(
    html,
    /<li id="user-content-fn-1">\n<p>The note\. <a href="#user-content-fnref-1" data-footnote-backref/,
  );
});

test("code keeps its lines as they are: no tag inside a code block or a code span", async () => {
  assert.equal(await render("```\none\ntwo\n\nthree\n```"), "<pre><code>one\ntwo\n\nthree\n</code></pre>");
  assert.equal(await render("    one\n    two"), "<pre><code>one\ntwo\n</code></pre>");
  assert.equal(await render("a `one\ntwo` b"), "<p>a <code>one two</code> b</p>");
});

test("tables, plain HTML and a photo's alt text and caption gain no tag", async () => {
  assert.doesNotMatch(await render("| a | b |\n| --- | --- |\n| 1 | 2 |"), /<br/);
  assert.equal(
    await render("<details>\n<summary>More</summary>\none\ntwo\n</details>"),
    "<details>\n<summary>More</summary>\none\ntwo\n</details>",
  );
  assert.equal(
    await render('![two\nlines](/x.jpg "a\ncaption")'),
    '<p><img src="/x.jpg" alt="two\nlines" title="a\ncaption"></p>',
  );
});

// The shapes of the owner's first entry, in placeholder words: lines after a paragraph's first, a line that ends in
// italics, a full stop and a space, a bracketed word that is not a link, a last paragraph that is one photo.
test("an entry typed on the phone, one Enter per line: every line typed is a line on the page", async () => {
  const typed = [
    "[Placeholder] First line of the first paragraph.",
    "Second line (with a bracket, a comma, and an apostrophe: it's here).",
    "Third line.",
    "",
    "A line that ends in italics: _Some Name_. ",
    "A line with a smile :)",
    "Go and see [example.org]",
    "",
    "One line alone.",
    "",
    '![Alt text](/x.jpg "A caption")',
  ].join("\n");
  assert.equal(
    await render(typed),
    [
      "<p>[Placeholder] First line of the first paragraph.<br>",
      "Second line (with a bracket, a comma, and an apostrophe: it’s here).<br>",
      "Third line.</p>",
      "<p>A line that ends in italics: <em>Some Name</em>.<br>",
      "A line with a smile :)<br>",
      "Go and see [example.org]</p>",
      "<p>One line alone.</p>",
      '<p><img src="/x.jpg" alt="Alt text" title="A caption"></p>',
    ].join("\n"),
  );
});

test("the plugin is the repository's own, on Astro's default processor; any other processor stops the build", async () => {
  assert.equal(config.markdown.processor.name, "satteri");
  const { entryLineBreaks } = (await import("../../src/lib/entry-line-breaks.ts")) as {
    entryLineBreaks: () => { name: string; hooks: Record<string, (options: { config: unknown }) => void> };
  };
  const setup = entryLineBreaks().hooks["astro:config:setup"];
  assert.ok(setup, "the integration has a setup hook");
  const other = { markdown: { processor: { name: "unified", options: { remarkPlugins: [] } } } };
  assert.throws(() => setup({ config: other }), /entry-line-breaks: .*"unified"/);
  // No package was added for it (brief rule 10): the three runtime dependencies are the three there were.
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["astro", "jose", "sharp"]);
  assert.deepEqual(
    Object.keys(pkg.devDependencies).filter((name) => /markdown|remark|rehype|satteri|unified/.test(name)),
    [],
  );
});

// The site's own check (tests/site/typed-lines.spec.ts) holds a phone publish, so its reader must take only what is
// certainly plain text typed one Enter per line, and its comparison must not see what the page changes by design.
test("the site check reads only paragraphs that are certainly plain typed lines", () => {
  const lines = (markdown: string): string[][] => typedParagraphs(markdown);
  assert.deepEqual(lines("One line.\n\nFirst line,\nsecond _line_.  \nThird [word] line\\\n\nLast."), [
    ["First line,", "second _line_.  ", "Third [word] line\\"],
  ]);
  assert.deepEqual(lines("First\r\nsecond\r\n\r\nThird\r\nfourth"), [
    ["First", "second"],
    ["Third", "fourth"],
  ]);
  // Lists, quotations, headings, tables, indented code, footnotes and definitions: not plain lines.
  for (const other of [
    "- one\n- two",
    "1. one\n2. two",
    "Text\n- one",
    "> one\n> two",
    "Title\n===",
    "Title\n---",
    "Two\nlines\n===",
    "a | b\n--- | ---\nc | d",
    "| a | b |\n| - | - |",
    "    code\n    more",
    "Text\n    more",
    "[^1]: a note\nmore",
    "[a]: https://example.com\nmore",
    "## A heading\nText",
    "2026 was\na year",
  ])
    assert.deepEqual(lines(`Before.\n\n${other}\n\nAfter.`), [], other);
  // Anything that can make a line break mean something else, or change the words shown.
  for (const unsure of [
    "A `code\nspan` here",
    "A [link\ntext](https://example.com) here",
    "A [link][ref]\nhere",
    "A note[^1]\nhere",
    "An <em>element</em>\nhere",
    "An &amp; entity\nhere",
    "A > sign\nhere",
    "A photo ![alt](x.jpg)\nhere",
  ])
    assert.deepEqual(lines(unsure), [], unsure);
  // Where an empty line does not end anything, the whole entry is left out.
  for (const whole of [
    "```\nCode line\nmore code\n\nStill code\nand more\n```",
    "~~~\nCode\n~~~",
    "<pre>\nOne\n\nTwo\nthree\n</pre>",
    "<!-- a comment\n\nTwo\nthree -->",
  ])
    assert.deepEqual(lines(`First\nsecond\n\n${whole}\n\nThird\nfourth`), [], whole);
});

test("the site check compares letters and digits only: curled quotes, joined dashes and italics do not count", () => {
  assert.equal(
    letters(`It's "here" -- _really_ **here**... 10-20 [x] :)`),
    letters("It’s “here” – really here… 10-20 [x] :)"),
  );
  assert.equal(asLines(["One, two.", "Three!"]), "Onetwo\nThree");
  assert.notEqual(asLines(["One", "two"]), asLines(["One two"]));
});

// The test build (pnpm build:fixtures): the fixture entry one-roll has a paragraph typed one Enter per line.
const dist = new URL("../../dist/", import.meta.url);
const skip = existsSync(new URL("one-roll.html", dist)) ? false : "run `pnpm build:fixtures` first";
const built = (file: string): string => readFileSync(new URL(file, dist), "utf8");

test("the fixture entry typed one Enter per line is built with its lines", { skip }, () => {
  const source = readFileSync(new URL("en/one-roll.md", fixtureJournal), "utf8");
  assert.match(
    source,
    /\n\[Placeholder\] A second paragraph, typed on the phone:\nits second line,\nand its third\.\n/,
  );
  assert.match(
    built("one-roll.html"),
    /<p>\[Placeholder\] A second paragraph, typed on the phone:<br>\nits second line,<br>\nand its third\.<\/p>/,
  );
});

test("feeds, descriptions, link previews, structured data and the lists of entries gain no tag", { skip }, () => {
  const tag = /<br\b|&lt;br\b|&#x3C;br\b|&#60;br\b/i;
  const tags = (text: string): number => (text.match(new RegExp(tag.source, "gi")) ?? []).length;
  // The site footer has a line break of its own ("All rights reserved" / "No trackers, no cookies."), on every page.
  const head = (html: string): string => html.split("</head>")[0] ?? "";
  const main = (html: string): string => /<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? "";
  for (const file of ["feed.xml", "it/feed.xml", "sitemap.xml"])
    assert.doesNotMatch(built(file), tag, `${file} has a line-break tag`);
  // The home pages and journal indexes list one-roll (its title, its description as the latest entry's summary).
  for (const file of ["index.html", "it.html", "journal.html", "it/journal.html"]) {
    assert.match(built(file), /href="\/one-roll"/, `${file} lists one-roll`);
    assert.equal(tags(head(built(file))) + tags(main(built(file))), 0, `${file} has a line-break tag`);
  }
  // The entry's own page: everything in <head> (description, Open Graph, JSON-LD) is free of it ...
  const page = built("one-roll.html");
  assert.match(head(page), /<meta name="description" content="\[Placeholder\] This entry has no Italian version yet/);
  assert.equal(tags(head(page)), 0);
  // ... and in <main> the line breaks are only where they were typed: the two in the entry's text.
  const prose = /<div class="prose">([\s\S]*?)<p class="sign">/.exec(page)?.[1] ?? "";
  assert.equal(tags(prose), 2);
  assert.equal(tags(main(page)), 2);
});
