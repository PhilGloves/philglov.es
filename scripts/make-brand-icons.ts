/**
 * Draws the site's small PNG icons in src/assets/brand/ from the owner's icon, site-icon.png (512 px, full bleed,
 * opaque): favicon-32.png (the fallback tab icon, and the source of /favicon.ico, scripts/postbuild.ts) and
 * apple-touch-icon.png (180 px; iOS rounds the corners itself). sharp is already a dependency. Run
 * `node scripts/make-brand-icons.ts` after replacing site-icon.png, and commit the two PNGs it writes.
 */
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const brand = new URL("../src/assets/brand/", import.meta.url);
const path = (file: string): string => fileURLToPath(new URL(file, brand));

for (const [file, size] of [
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
] as const) {
  await sharp(path("site-icon.png"))
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(path(file));
}
console.log("wrote favicon-32.png and apple-touch-icon.png from site-icon.png");
