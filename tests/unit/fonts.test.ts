import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const dir = new URL("../../public/_assets/fonts/", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".woff2"))
  .sort();

// The 63 table tags a WOFF2 directory can refer to by number (W3C WOFF2, section 5.1).
const KNOWN_TAGS =
  "cmap head hhea hmtx maxp name OS/2 post cvt fpgm glyf loca prep CFF VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill".split(
    " ",
  );

/** The strings of a WOFF2 file's `name` table (it is never glyph-transformed), keyed by name ID. */
function nameRecords(buffer: Buffer): Map<number, string[]> {
  assert.equal(buffer.toString("ascii", 0, 4), "wOF2");
  const numTables = buffer.readUInt16BE(12);
  const compressedLength = buffer.readUInt32BE(20);
  let pos = 48;
  const base128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buffer[pos++] ?? 0;
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return value;
  };
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buffer[pos++] ?? 0;
    let tag: string;
    if ((flags & 0x3f) === 0x3f) {
      tag = buffer.toString("ascii", pos, pos + 4);
      pos += 4;
    } else {
      tag = KNOWN_TAGS[flags & 0x3f] ?? "????";
    }
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? flags >> 6 === 0 : flags >> 6 !== 0;
    tables.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = brotliDecompressSync(buffer.subarray(pos, pos + compressedLength));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === "name") {
      const table = data.subarray(offset, offset + t.length);
      const count = table.readUInt16BE(2);
      const stringOffset = table.readUInt16BE(4);
      const out = new Map<number, string[]>();
      for (let i = 0; i < count; i++) {
        const r = 6 + i * 12;
        if (table.readUInt16BE(r) !== 3) continue; // Windows records, UTF-16BE
        const id = table.readUInt16BE(r + 6);
        const len = table.readUInt16BE(r + 8);
        const off = table.readUInt16BE(r + 10);
        const raw = Buffer.from(table.subarray(stringOffset + off, stringOffset + off + len));
        const text = raw.swap16().toString("utf16le");
        out.set(id, [...(out.get(id) ?? []), text]);
      }
      return out;
    }
    offset += t.length;
  }
  throw new Error("no name table");
}

test("two font files, 80 KB in total (brief rule 8)", () => {
  assert.deepEqual(files, ["crimson-pro-italic.woff2", "crimson-pro.woff2"]);
  const total = files.reduce((sum, f) => sum + readFileSync(new URL(f, dir)).length, 0);
  assert.ok(total <= 80 * 1024, `${total} bytes`);
});

test("the family has its OFL.txt next to it", () => {
  const licence = readFileSync(new URL("crimson-pro-OFL.txt", dir), "utf8");
  assert.match(licence, /SIL OPEN FONT LICENSE Version 1\.1/i);
  assert.match(licence, /^Copyright .*Crimson Pro/);
  assert.deepEqual(
    readdirSync(dir).filter((f) => !f.endsWith(".woff2")),
    ["crimson-pro-OFL.txt"],
  );
});

test("every font keeps its copyright and licence notice inside the file", () => {
  for (const f of files) {
    const names = nameRecords(readFileSync(new URL(f, dir)));
    assert.ok(
      (names.get(0) ?? []).some((s) => /copyright|©/i.test(s)),
      `${f}: copyright (name 0)`,
    );
    assert.ok(
      (names.get(13) ?? []).some((s) => /Open Font License/i.test(s)),
      `${f}: licence (name 13)`,
    );
  }
});

test("a font that reserves a name is renamed; Crimson Pro reserves none, so it keeps its own", () => {
  for (const f of files) {
    const names = nameRecords(readFileSync(new URL(f, dir)));
    const reserved = (names.get(0) ?? []).flatMap((s) =>
      [...s.matchAll(/Reserved Font Name\s*[‘'"“]?([^’'"”.]+)/gi)].map((m) => m[1] ?? ""),
    );
    assert.deepEqual(
      reserved,
      [],
      `${f} now declares a reserved name: rename the family (decision 0014 did so for Source Serif 4)`,
    );
    for (const s of names.get(1) ?? []) assert.equal(s, "Crimson Pro");
  }
});

test("one family only: no other web font anywhere in the styles or templates", () => {
  const css = readFileSync(new URL("../../src/styles/site.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const tokens = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const families = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*"?([^";]+)"?/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(families)].sort(), [
    "Crimson Pro",
    "Crimson Pro Fallback",
    "Crimson Pro Fallback Georgia",
  ]);
  assert.equal([...css.matchAll(/url\("\/_assets\/fonts\/[^"]+"\)/g)].length, 2);
  assert.doesNotMatch(css + tokens, /Archivo|Source Serif|PG Serif|JetBrains/);
});

test("fonts: only the upright file is preloaded, never the italic", () => {
  const layout = readFileSync(new URL("../../src/layouts/BaseLayout.astro", import.meta.url), "utf8");
  assert.match(layout, /preload" href="\/_assets\/fonts\/crimson-pro\.woff2"/);
  assert.equal((layout.match(/rel="preload"/g) ?? []).length, 1);
});

test("weight 300 is used only at 28 px and larger", () => {
  const css = readFileSync(new URL("../../src/styles/site.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const tokens = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
  const px = new Map<string, number>();
  for (const [, name, rem] of tokens.matchAll(/--(fs-[0-9-]+):\s*([\d.]+)rem/g))
    px.set(`var(--${name})`, Number(rem) * 16);
  px.set("var(--fs-display)", 40);
  for (const [, body] of css.matchAll(/\{([^{}]*font-weight:\s*300\s*;[^{}]*)\}/g)) {
    const size = /font-size:\s*(var\(--[a-z0-9-]+\)|clamp[^;]*)/.exec(body ?? "");
    assert.ok(size, `a weight-300 rule without its own font-size: ${body?.trim().slice(0, 80)}`);
    const clamp = /^clamp\(([\d.]+)rem/.exec(size[1] ?? ""); // the smallest the clamp can be
    const value = clamp ? Number(clamp[1]) * 16 : (px.get(size[1] ?? "") ?? 0);
    assert.ok(value >= 28, `${size[1]} = ${value} px is too small for weight 300`);
  }
});
