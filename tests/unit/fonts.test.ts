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

test("four font files, 135 KB in total (brief rule 8, owner ruling 2026-11-12)", () => {
  assert.equal(files.length, 4, files.join(", "));
  const total = files.reduce((sum, f) => sum + readFileSync(new URL(f, dir)).length, 0);
  assert.ok(total <= 135 * 1024, `${total} bytes`);
});

test("each font family has its OFL.txt next to it", () => {
  for (const f of ["archivo", "source-serif-4", "jetbrains-mono"]) {
    const licence = readFileSync(new URL(`${f}-OFL.txt`, dir), "utf8");
    assert.match(licence, /SIL OPEN FONT LICENSE Version 1\.1/i);
    assert.match(licence, /^Copyright /);
  }
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

test("fonts that reserve a name are renamed: Source Serif 4 is PG Serif inside the files", () => {
  for (const f of ["source-serif-4.woff2", "source-serif-4-italic.woff2"]) {
    const names = nameRecords(readFileSync(new URL(f, dir)));
    assert.ok(
      (names.get(0) ?? []).some((s) => /Reserved Font Name .?Source/.test(s)),
      `${f} still carries Adobe's notice`,
    );
    for (const id of [1, 4, 6, 16]) {
      for (const s of names.get(id) ?? []) {
        assert.doesNotMatch(s, /Source/i, `${f}: name ${id} = ${s}`);
        assert.match(s, /PG ?Serif/, `${f}: name ${id} = ${s}`);
      }
    }
  }
});

test("the stylesheet uses the renamed family and never the reserved name", () => {
  const css = readFileSync(new URL("../../src/styles/site.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const tokens = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  assert.match(css, /font-family: "PG Serif"/);
  assert.doesNotMatch(css + tokens, /Source Serif/);
});

test("fonts are preloaded for Archivo and PG Serif upright, not the italic", () => {
  const layout = readFileSync(new URL("../../src/layouts/BaseLayout.astro", import.meta.url), "utf8");
  assert.match(layout, /preload" href="\/_assets\/fonts\/archivo\.woff2"/);
  assert.match(layout, /preload" href="\/_assets\/fonts\/source-serif-4\.woff2"/);
  assert.doesNotMatch(layout, /preload[^>]*italic/);
});
