/**
 * Draws the placeholder PNG icons in src/assets/brand/ with no dependencies:
 * a moss-green rounded square (favicon-32.png) and a full-bleed square
 * (apple-touch-icon.png; iOS rounds the corners itself and paints transparent
 * pixels black). Run `node scripts/make-brand-icons.ts` after changing the
 * colour. When the owner picks an identity, replace the three icon files in
 * src/assets/brand/ and delete this script.
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const MOSS = [0x4a, 0x5d, 0x23] as const;
const out = new URL("../src/assets/brand/", import.meta.url);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (crcTable[(c ^ byte) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Coverage (0–1) of pixel (x, y) by a rounded square of the given radius, 8×8 supersampled. */
function coverage(x: number, y: number, size: number, radius: number): number {
  const n = 8;
  let hit = 0;
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const px = x + (sx + 0.5) / n;
      const py = y + (sy + 0.5) / n;
      const dx = Math.max(radius - px, px - (size - radius), 0);
      const dy = Math.max(radius - py, py - (size - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) hit++;
    }
  }
  return hit / (n * n);
}

function png(size: number, radius: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      row[i] = MOSS[0];
      row[i + 1] = MOSS[1];
      row[i + 2] = MOSS[2];
      row[i + 3] = Math.round(coverage(x, y, size, radius) * 255);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL("favicon-32.png", out), png(32, 6));
writeFileSync(new URL("apple-touch-icon.png", out), png(180, 0));
console.log("wrote favicon-32.png and apple-touch-icon.png");
