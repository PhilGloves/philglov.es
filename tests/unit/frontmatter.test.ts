/**
 * SO-01: front matter survives both publishing paths unchanged (decision 0027).
 *  - the content check (laptop path) reads the front matter with Astro's own parser, so it accepts what the build
 *    accepts: inline comments, single and double quotes, quoted dates, folded values;
 *  - the phone editor (worker/src/frontmatter.ts) reads only values it can keep exactly; every value it does read
 *    is checked here against Astro's parser, and an edit of the text alone leaves the file byte for byte as it was.
 * The same variants go through open, edit and publish against the GitHub stand-in in tests/worker/write.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkContent, frontMatter } from "../../scripts/lib/content-check.ts";
import { newEntry } from "../../scripts/lib/new-entry.ts";
import { editable, editedEntryMarkdown, parseEntry, splitPhotos } from "../../worker/src/entry-file.ts";
import { readFrontMatter } from "../../worker/src/frontmatter.ts";
import { clean } from "../../worker/src/validate.ts";
import { VARIANTS } from "../worker/frontmatter-variants.ts";

const BODY = ["The full article.", "", "A second paragraph."];
const entry = (lines: string[], eol = "\n") => ["---", ...lines, "---", "", ...BODY].join(eol) + eol;

const astro = (text: string) => frontMatter(text).data;

for (const [name, v] of Object.entries(VARIANTS)) {
  for (const eol of ["\n", "\r\n"]) {
    const text = entry(v.lines, eol);
    const label = `${name}${eol === "\r\n" ? " (CRLF)" : ""}`;

    test(`content check accepts: ${label}`, () => {
      assert.deepEqual(checkContent([{ path: "journal/en/rome.md", text }]), []);
    });

    test(`phone editor: ${label}`, () => {
      const found = editable(text);
      assert.equal(found.ok, v.editable, found.ok ? "opened" : found.reason);
      const data = astro(text);
      if (!found.ok) {
        assert.equal(editedEntryMarkdown(text, input(text, "x", "x")), null, "refused at publish too");
        return;
      }
      // What it shows is what the build reads.
      assert.equal(found.title, data["title"]);
      assert.equal(found.description, data["description"] ?? "");
      // Saving without a change gives the same file, byte for byte.
      const same = input(text, found.title, found.description);
      assert.equal(editedEntryMarkdown(text, same), text);
      // Changing only the text keeps every front matter line.
      const edited = editedEntryMarkdown(text, { ...same, body: "Rewritten on the phone." }) ?? "";
      assert.equal(edited.slice(0, edited.indexOf(`${eol}---${eol}`)), text.slice(0, text.indexOf(`${eol}---${eol}`)));
      assert.deepEqual(astro(edited), data);
      assert.match(edited, new RegExp(`${eol}Rewritten on the phone\\.${eol}$`));
      if (eol === "\r\n") assert.doesNotMatch(edited.replace(/\r\n/g, ""), /\n/, "one kind of line end");
      // Changing the title replaces that one line, keeps its comment, and the build reads the new title.
      const retitled = editedEntryMarkdown(text, { ...same, title: 'New: "title" # not a comment' }) ?? "";
      assert.deepEqual(astro(retitled), { ...data, title: 'New: "title" # not a comment' });
      const changed = retitled.split(eol).filter((l, i) => l !== text.split(eol)[i]);
      assert.equal(changed.length, 1, changed.join(" | "));
    });
  }
}

/** The form as the browser sends it back for this file (readEntry cleans every field the same way). */
function input(text: string, title: string, description: string) {
  const parsed = parseEntry(text);
  const { body, photos } = splitPhotos(parsed?.body ?? "", "rome");
  return {
    title: clean(title, false),
    slug: "rome",
    lang: "en" as const,
    description: clean(description, false),
    body: clean(body, true),
    photos,
  };
}

test("every value the phone editor reads is the value Astro reads", () => {
  const values = [
    "plain words",
    "words # comment",
    "C#, not a comment",
    "it's plain",
    "'single ''quoted'''",
    "'with # inside' # and after",
    '"double \\"quoted\\""',
    '"tab\\tnewline\\nslash\\/ unicode \\u00e8 \\x41 \\U0001F600"',
    '"\\e\\0\\a\\b\\f\\r\\v\\N\\_\\L\\P\\ "',
    '"ends with space "   # comment',
    "true",
    "False",
    "~",
    "null",
    "12",
    "-3.5",
    "0x1F",
    ".inf",
    "2026-10-21",
    '"2026-10-21"',
    "[a, b]",
    "{a: 1}",
    "a: b",
    "&anchor value",
    "!!str 12",
    "- item",
    "| ",
    ">-",
    "@reserved",
    "`reserved",
    "trailing colon:",
    "ok:no-space",
    "  spaced  ",
    "un # ",
    "Ünïcödé — dash",
  ];
  let read = 0;
  for (const raw of values) {
    const text = `---\nk: ${raw}\n---\n`;
    const fm = readFrontMatter(text);
    let expected: unknown;
    try {
      expected = astro(text)["k"];
    } catch {
      assert.equal(fm?.fields.get("k")?.value, undefined, `${raw}: Astro refuses it, the editor must not read it`);
      continue;
    }
    const value = fm?.fields.get("k")?.value;
    if (value === undefined) continue; // refused: the editor will not guess
    read += 1;
    assert.equal(value, expected, raw);
  }
  assert.ok(read >= 12, `the editor reads the ordinary forms (${read})`);
});

test("front matter the line reader cannot follow is refused whole, not misread", () => {
  for (const text of [
    '---\nnote: "open quote\ntitle: Fake"\n---\n',
    "---\ntags: [a,\ntitle: Fake]\n---\n",
    "---\ntitle: A\ntitle: B\n---\n",
    '---\n"title": Quoted key\n---\n',
    "---\n%YAML 1.2\ntitle: A\n---\n",
    "---\ntitle: never closed\n",
    "no front matter",
  ])
    assert.equal(editable(text).ok, false, text);
});

test("the content check reports YAML the build would refuse, instead of passing it", () => {
  const out = checkContent([{ path: "journal/en/x.md", text: "---\ntitle: [unclosed\nlang: en\n---\nText.\n" }]);
  assert.match(out.join("\n"), /front matter is not valid YAML/);
});

test("pnpm new reads the other version's originalLang as the build does: comments and quotes", () => {
  for (const line of ["originalLang: it # the first version", "originalLang: 'it'", 'originalLang: "it"'])
    assert.match(
      newEntry({ slug: "lisbona", lang: "en", today: "2026-11-16", twinText: `---\n${line}\n---\n` }),
      /^originalLang: it$/m,
    );
});
