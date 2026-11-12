import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillShareTemplate, wrapTitle } from "../../src/assets/brand/share-image.ts";

const brandDir = new URL("../../src/assets/brand/", import.meta.url);
const template = readFileSync(new URL("share-template.svg", brandDir), "utf8");

test("placeholder icons: a 32 px favicon, a 180 px apple-touch-icon, an SVG, all moss", () => {
  const size = (file: string): [number, number] => {
    const png = readFileSync(new URL(file, brandDir));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  assert.deepEqual(size("favicon-32.png"), [32, 32]);
  assert.deepEqual(size("apple-touch-icon.png"), [180, 180]);
  assert.match(readFileSync(new URL("favicon.svg", brandDir), "utf8"), /fill="#4a5d23"/i);
});

test("share template is 1200×630 and has a slot for the title, the name and a moss rule", () => {
  assert.match(template, /viewBox="0 0 1200 630"/);
  assert.match(template, /<!--TITLE-->/);
  assert.match(template, /Filippo Guanti/);
  assert.match(template, /#4a5d23/i);
  assert.match(template, /font-family="Archivo/);
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
