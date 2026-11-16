/**
 * A .ico file that holds one PNG (every browser since IE 11 reads the PNG form). /favicon.ico is made from the site's
 * own icon, src/assets/brand/favicon-32.png, at build time (scripts/postbuild.ts), so it follows the icon when the owner
 * replaces it (BUG-8). No dependencies.
 */
export function pngToIco(png: Buffer): Buffer {
  if (png.toString("ascii", 1, 4) !== "PNG") throw new Error("pngToIco: not a PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > 256 || height > 256) throw new Error("pngToIco: an icon is at most 256 px");
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = width === 256 ? 0 : width;
  entry[1] = height === 256 ? 0 : height;
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12); // where the image starts
  return Buffer.concat([header, entry, png]);
}
