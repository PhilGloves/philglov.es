import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillShareTemplate, wrapTitle } from "../../src/assets/brand/share-image.ts";

const brandDir = new URL("../../src/assets/brand/", import.meta.url);
const template = readFileSync(new URL("share-template.svg", brandDir), "utf8");

test("the owner's icons: a 512 px source, a 32 px favicon, a 180 px apple-touch-icon, an SVG, all on moss", () => {
  const size = (file: string): [number, number] => {
    const png = readFileSync(new URL(file, brandDir));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  assert.deepEqual(size("site-icon.png"), [512, 512]);
  assert.deepEqual(size("favicon-32.png"), [32, 32]);
  assert.deepEqual(size("apple-touch-icon.png"), [180, 180]);
  assert.match(readFileSync(new URL("favicon.svg", brandDir), "utf8"), /fill="#4a5d23"/i);
});

// The SVG icon is served from this site as a file: it may draw, and do nothing else. No script, no event handler, no
// link or reference to another file (href, url(), @import, an outside DTD), no embedded image or foreign content, no
// style block.
const DRAWING = new Set([
  "svg",
  "title",
  "desc",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);
function svgProblems(svg: string): string[] {
  const out: string[] = [];
  const elements = [...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1] ?? "");
  for (const e of elements.filter((e) => !DRAWING.has(e))) out.push(`element <${e}>`);
  // XML allows white space around "=", and a browser reads `onload ="…"` as a handler.
  const attributes = [...svg.matchAll(/\s([a-zA-Z_:][\w:.-]*)\s*=/g)].map((m) => m[1] ?? "");
  for (const a of attributes.filter((a) => /^on|href$|^style$/i.test(a))) out.push(`attribute ${a}`);
  if (/url\(|@import|<!ENTITY|<!DOCTYPE|<\?xml-stylesheet|javascript:|data:/i.test(svg))
    out.push("a reference, a DTD or an entity");
  // A character reference can spell any of those ("u&#114;l("); a drawing needs none.
  if (/&#/.test(svg)) out.push("a character reference");
  // The one URL in it is the SVG namespace.
  const urls = [...svg.matchAll(/https?:\/\/[^"'\s>]+/g)].map((m) => m[0]);
  for (const u of urls.filter((u) => u !== "http://www.w3.org/2000/svg")) out.push(`address ${u}`);
  return out;
}

test("the SVG icon only draws: no script, link, embedded image or style", () => {
  assert.deepEqual(svgProblems(readFileSync(new URL("favicon.svg", brandDir), "utf8")), []);
});

// Final review, T1B-04 (FINAL-REVIEW.md): spellings that used to pass the check above.
test("the icon check refuses what a browser would still read as a handler, a style or an outside file", () => {
  const ns = 'xmlns="http://www.w3.org/2000/svg"';
  const hostile = [
    `<svg ${ns} onload ="fetch('/admin')"><path d="M0 0"/></svg>`,
    `<svg ${ns}><path onclick\t= "x()" d="M0 0"/></svg>`,
    `<svg ${ns}><path style ="fill:red" d="M0 0"/></svg>`,
    `<!DOCTYPE svg SYSTEM "//evil.example/x.dtd"><svg ${ns}><path d="M0 0"/></svg>`,
    `<svg ${ns}><path fill="u&#114;l(//evil.example/x)" d="M0 0"/></svg>`,
    `<svg ${ns} onload="x()"><path d="M0 0"/></svg>`,
    `<svg ${ns}><script>x()</script></svg>`,
  ];
  for (const svg of hostile) assert.notDeepEqual(svgProblems(svg), [], svg);
});

test("share template is 1200×630 and has a slot for the title, the name and a moss rule", () => {
  assert.match(template, /viewBox="0 0 1200 630"/);
  assert.match(template, /<!--TITLE-->/);
  assert.match(template, /Filippo Guanti/);
  assert.match(template, /#4a5d23/i);
  assert.match(template, /font-family="Crimson Pro/);
  assert.match(template, /font-weight="300"/);
  assert.doesNotMatch(template, /Archivo|Source Serif|JetBrains/);
});

test("titles wrap to at most three lines and get an ellipsis when cut", () => {
  assert.deepEqual(wrapTitle("Three weeks in Lisbon, mostly on foot"), ["Three weeks in Lisbon,", "mostly on foot"]);
  const long = wrapTitle(
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen",
  );
  assert.equal(long.length, 3);
  assert.ok(long[2]?.endsWith("…"));
});

test("a title is written into the template as escaped text, never as markup", () => {
  const svg = fillShareTemplate('Fish & chips <script>alert("x")</script>', template);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /Fish &amp; chips/);
  assert.doesNotMatch(svg, /<!--TITLE-->/);
});

// BUG-8: /favicon.ico is the site icon in the .ico container, built by scripts/postbuild.ts.
test("pngToIco wraps the site icon, unchanged, in a one-image .ico", async () => {
  const { pngToIco } = await import("../../scripts/lib/ico.ts");
  const png = readFileSync(new URL("favicon-32.png", brandDir));
  const ico = pngToIco(png);
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0]); // reserved, type 1 (icon), one image
  assert.equal(ico[6], 32); // width
  assert.equal(ico[7], 32); // height
  assert.equal(ico.readUInt32LE(14), png.length);
  const start = ico.readUInt32LE(18);
  assert.equal(start, 22);
  assert.ok(ico.subarray(start).equals(png), "the image inside is the site icon byte for byte");
  assert.throws(() => pngToIco(Buffer.from("not a png at all, no")), /not a PNG/);
});
