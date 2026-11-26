/**
 * What a built page may contain (scripts/lib/page-check.ts, security audit, decision 0030). Markdown lets raw HTML
 * through untouched; the CSP stops scripts, styles, frames and other hosts, but not a meta refresh, a fake form or a
 * javascript: link, and an entry from the phone goes live by itself (0021). postbuild runs this on every page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { pageProblems, safeAddress } from "../../scripts/lib/page-check.ts";

const ICON =
  '<svg class="arr" viewBox="0 0 20 14" aria-hidden="true" focusable="false"><path d="M1 7h17" fill="none" stroke="currentColor"></path></svg>';

/** A page shaped like the built ones: head, header with an icon, the entry's text, both forms, the form script. */
const page = (text: string, extra = ""): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title>` +
  `<link rel="canonical" href="https://philglov.es/x"><meta property="og:image" content="https://philglov.es/_assets/s.png">` +
  `<script type="application/ld+json">{"@type":"Person"}</script><script>document.documentElement.dataset.theme="x"</script>` +
  `</head><body><header><a href="/">Home</a><button type="button" data-theme-toggle>${ICON}</button></header>` +
  `<main id="main"><div class="g"><div class="con"><div class="prose">${text}<p class="sign">- Filippo</p></div></div>` +
  `<form class="form" method="post" action="/api/comment#comment-status" id="comment-form"><input type="hidden" name="token" value=""><textarea name="comment"></textarea><button type="submit">Send</button></form>` +
  `</div></main>${extra}<footer><form class="rform" method="post" action="/api/report#report-status"><input type="hidden" name="url" value="/x"><textarea name="message"></textarea><button type="submit">Send</button></form></footer>` +
  `<script type="module" src="/_assets/FormGuard.abc.js"></script></body></html>`;

test("a page as the site builds it passes, with everything an entry's text may hold", async () => {
  const text =
    '<p>Text with <a href="/alps">a link</a>, <a href="https://example.com/a?b=1&amp;c=2">another</a>, ' +
    '<a href="mailto:phil@philglov.es">mail</a>, <a href="tel:+390000">phone</a>, <a href="#fn-1">a note</a>, ' +
    '<em>em</em>, <strong>strong</strong>, <code>&lt;meta&gt;</code>, <kbd>K</kbd>, <abbr title="x">A</abbr>, <sup>1</sup>.</p>' +
    '<figure><img src="/_assets/a.webp" srcset="/_assets/a-480.webp 480w, /_assets/a-800.webp 800w" alt="A"><figcaption>C</figcaption></figure>' +
    '<ul class="contains-task-list"><li><input type="checkbox" disabled> to do</li></ul>' +
    "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>" +
    "<details><summary>More</summary><p>Hidden</p></details><blockquote><p>Q</p></blockquote><hr><pre><code>x</code></pre>" +
    `<section data-footnotes><ol><li id="fn-1"><p>Note <a href="#ref-1" data-footnote-backref>${ICON}</a></p></li></ol></section>`;
  assert.deepEqual(await pageProblems(page(text)), []);
});

test("every way an entry could redirect, embed, collect or run something is refused", async () => {
  const cases: [string, string, RegExp][] = [
    ["a meta refresh", '<meta http-equiv="refresh" content="0;url=https://example.invalid/">', /<meta>/],
    ["a meta refresh in capitals", '<META HTTP-EQUIV=refresh CONTENT="0;url=x">', /<meta>/],
    [
      "a meta refresh after leaving the text",
      '</div></div></div><meta http-equiv="refresh" content="0;url=x">',
      /<meta>/,
    ],
    ["a meta refresh that breaks out of an SVG", '<svg><meta http-equiv="refresh" content="0;url=x"></svg>', /svg/i],
    ["a page the parser cannot read", '<meta/http-equiv="refresh"/content="0;url=x">', /cannot be read/],
    ["a frame", '<iframe src="https://example.invalid/" title="x"></iframe>', /<iframe>/],
    ["a frame from markup", '<iframe srcdoc="&lt;p&gt;x" title="x"></iframe>', /<iframe>|srcdoc/],
    ["an object", '<object data="/x.swf"></object>', /<object>/],
    ["an embed", '<embed src="/x.swf" title="x">', /<embed>/],
    ["a base address", '<base href="https://example.invalid/">', /<base>/],
    ["a style sheet in the text", "<style>main{display:none}</style>", /<style>/],
    ["a style sheet link in the body", '<link rel="stylesheet" href="https://example.invalid/x.css">', /<link>/],
    ["an inline script", "<script>alert(1)</script>", /<script>/],
    ["an inline script in capitals", "<SCRIPT>alert(1)</SCRIPT>", /<script>/],
    ["a data block that pretends to be the site's", '<script type="application/ld+json">{}</script>', /<script>/],
    ["a script file", '<script src="/_assets/x.js"></script>', /<script>/],
    ["a template", "<template><p>x</p></template>", /<template>/],
    ["a noscript block", "<noscript><p>x</p></noscript>", /<noscript>/],
    ["MathML", "<math><mi>x</mi></math>", /<math>/],
    ["an element the site never uses", "<marquee>x</marquee>", /<marquee>/],
    [
      "a sign-in form to another host",
      '<form action="https://example.invalid/" method="post"><input name="p" type="password"></form>',
      /form/,
    ],
    [
      "a second report form",
      '<form method="post" action="/api/report#report-status"><textarea name="message"></textarea></form>',
      /form/,
    ],
    ["a field in the text", '<input name="password" type="password">', /<input>/],
    ["a field joined to the comment form", '<input type="text" name="comment" form="comment-form">', /<input>|"form"/],
    ["a button in the text", '<button type="submit" formaction="/api/report">Go</button>', /<button>|formaction/],
    ["a javascript: link", '<a href="javascript:alert(1)">x</a>', /javascript/],
    ["a javascript: link in capitals with spaces", '<a href=" JavaScript:alert(1)">x</a>', /javascript/i],
    ["a javascript: link spelled with entities", '<a href="java&#x09;script&colon;alert(1)">x</a>', /address/],
    ["a data: link", '<a href="data:text/html;base64,PHA+">x</a>', /data:/],
    ["a vbscript: link", '<a href="vbscript:msgbox">x</a>', /vbscript/],
    [
      "a picture from another host",
      '<img src="https://example.invalid/t.png" alt="t">',
      /another host|example\.invalid/,
    ],
    [
      "a picture set from another host",
      '<img src="/a.png" srcset="https://example.invalid/t.png 2x" alt="t">',
      /example\.invalid/,
    ],
    ["an event handler", '<img src="/a.png" alt="a" onerror="alert(1)">', /onerror/],
    ["a style attribute", '<p style="color:red">x</p>', /style/],
    ["a ping", '<a href="/x" ping="https://example.invalid/">x</a>', /ping/],
    ["a link inside an SVG", '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>', /svg/i],
    ["a handler inside an SVG", '<svg><circle r="1" onload="alert(1)"></circle></svg>', /svg/i],
    ["a frame inside an SVG", '<svg><foreignObject><iframe src="/x"></iframe></foreignObject></svg>', /svg/i],
    // Audit finding 2: an inner </svg>, or one inside a quoted value or a comment, does not end the SVG.
    [
      "a meta refresh after a nested SVG",
      '<svg><svg></svg><meta http-equiv="refresh" content="0;url=https://evil.example"></svg>',
      /svg/i,
    ],
    [
      "a meta refresh after a quoted </svg>",
      '<svg><g data-x="</svg>"></g><meta http-equiv="refresh" content="0;url=https://evil.example"></svg>',
      /svg/i,
    ],
    [
      "a meta refresh after a commented </svg>",
      '<svg><!-- </svg> --><meta http-equiv="refresh" content="0;url=https://evil.example"></svg>',
      /svg/i,
    ],
    [
      "a form after a nested SVG",
      '<svg><svg></svg><foreignObject><form action="https://evil.example"><input name="password"></form></foreignObject></svg>',
      /svg/i,
    ],
  ];
  for (const [name, text, expected] of cases) {
    const problems = await pageProblems(page(text));
    assert.ok(problems.length > 0, `${name} should be refused`);
    assert.ok(
      problems.some((p) => expected.test(p)),
      `${name}: expected a problem matching ${expected}, got:\n${problems.join("\n")}`,
    );
  }
});

test("addresses: relative, http(s), mailto and tel only; nothing spelled to hide its scheme", () => {
  for (const ok of [
    "/alps",
    "alps",
    "#fn-1",
    "?q=1",
    "https://example.com/a",
    "HTTP://x",
    "mailto:a@b.co",
    "tel:+39",
    "//cdn.example/x",
    "",
  ])
    assert.equal(safeAddress(ok), true, ok);
  for (const bad of [
    "javascript:alert(1)",
    " javascript:x",
    "java\tscript:x",
    "java\nscript:x",
    "\u0001javascript:x",
    "JAVASCRIPT:x",
    "data:text/html,x",
    "vbscript:x",
    "blob:https://philglov.es/x",
    "file:///etc/passwd",
    "java&#x09;script:x",
    "javascript&colon;x",
    "&#106;avascript:x",
  ])
    assert.equal(safeAddress(bad), false, JSON.stringify(bad));
});

test("only /styleguide may show the forms as specimens, and nothing else is relaxed there", async () => {
  const specimen = '<form method="post" action="#sg-top"><input name="x"></form>';
  const twice = page("", '<form method="post" action="/api/report#report-status"></form>');
  assert.ok((await pageProblems(page(""), { specimens: true })).length === 0);
  assert.ok((await pageProblems(twice)).length > 0);
  assert.deepEqual(await pageProblems(twice, { specimens: true }), []);
  assert.deepEqual(await pageProblems(page("", specimen), { specimens: true }), []);
  const meta = await pageProblems(page('<meta http-equiv="refresh" content="0;url=x">'), { specimens: true });
  assert.ok(meta.some((p) => /<meta>/.test(p)));
});

test(
  "every page of the current build passes",
  { skip: !existsSync(new URL("../../dist/index.html", import.meta.url)) },
  async () => {
    const dist = new URL("../../dist/", import.meta.url);
    const files = (dir: URL): URL[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(new URL(`${e.name}/`, dir)) : e.name.endsWith(".html") ? [new URL(e.name, dir)] : [],
      );
    for (const file of files(dist)) {
      const specimens = file.pathname.endsWith("/styleguide.html");
      assert.deepEqual(await pageProblems(readFileSync(file, "utf8"), { specimens }), [], file.pathname);
    }
  },
);
