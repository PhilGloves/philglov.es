import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkTheme } from "../../scripts/contrast.ts";

const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");

for (const theme of ["light", "dark"] as const) {
  test(`every ${theme} colour pair meets its WCAG floor (body text 7:1, the rest 4.5:1, UI 3:1)`, () => {
    const rows = checkTheme(css, theme);
    assert.ok(rows.length >= 15, "the checker found the tokens");
    const failing = rows.filter((r) => !r.ok).map((r) => `${r.pair.label}: ${r.value.toFixed(2)} < ${r.pair.floor}`);
    assert.deepEqual(failing, []);
  });
}

test("the measured ratios in the tokens.css comment match the real ones", () => {
  const comment = css.slice(0, css.indexOf("*/"));
  const row = (label: string, theme: "light" | "dark"): string =>
    checkTheme(css, theme)
      .find((r) => r.pair.label === label)
      ?.value.toFixed(2) ?? "";
  for (const [label, line] of [
    ["text on bg", "text on bg (body text)"],
    ["muted on bg", "muted on bg (sign-off, footnotes, facts)"],
    ["band-text on band", "band-text on band (Now paragraph)"],
    ["accent on bg", "accent on bg (links, markers)"],
    ["band-muted on band", "band-muted on band (Now label)"],
  ] as const) {
    const at = comment.split("\n").find((l) => l.includes(line));
    assert.ok(at, `comment row for ${label}`);
    assert.ok(at.includes(row(label, "light")), `${label} light in the comment`);
    assert.ok(at.includes(row(label, "dark")), `${label} dark in the comment`);
  }
});

test("both themes define the same colour tokens", () => {
  const light = Object.keys(checkTheme(css, "light"));
  assert.equal(light.length, Object.keys(checkTheme(css, "dark")).length);
});

test("motion tokens are 150 / 250 ms ease-out and switch off for reduced motion", () => {
  assert.match(css, /--dur-fast: 150ms/);
  assert.match(css, /--dur-base: 250ms/);
  assert.match(css, /--ease: ease-out/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--dur-fast: 0ms;\s*--dur-base: 0ms/);
});

// BUG-3 and SO-08 (fix round 2, 0028): body text on the page, and the Now paragraph on the moss band, reach AAA 7:1 in both
// themes. The floors in scripts/contrast.ts say so; this proves it, so lowering a floor is a visible change.
test("the muted text and the Now paragraph are held to the AAA floor of 7:1, and reach it, in both themes", () => {
  for (const theme of ["light", "dark"] as const)
    for (const label of ["muted on bg", "band-text on band"]) {
      const found = checkTheme(css, theme).find((r) => r.pair.label === label);
      assert.ok(found, `${theme} ${label}`);
      assert.equal(found.pair.floor, 7, `${theme} ${label}: floor`);
      assert.ok(found.value >= 7, `${theme} ${label}: ${found.value.toFixed(3)}`);
    }
});
