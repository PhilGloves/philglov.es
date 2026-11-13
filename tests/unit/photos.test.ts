import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { colourClass, colourCss } from "../../scripts/lib/photo-meta.ts";
import { entryKeys, seriesKeys } from "../../scripts/lib/photo-keys.ts";
import {
  DATA_MINING,
  applyRights,
  copyrightNotice,
  hasExiftool,
  parseExif,
  rightsArgs,
} from "../../scripts/lib/photo-rights.ts";
import { authorization } from "../../scripts/lib/r2.ts";

// ---- R2 download: Signature V4 -------------------------------------------------

test("SigV4 matches the AWS documentation's 'GET Object with Range' example", () => {
  const header = authorization({
    method: "GET",
    path: "/test.txt",
    headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-date": "20130524T000000Z" },
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    service: "s3",
    amzDate: "20130524T000000Z",
  });
  assert.match(header, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(header, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
});

test("which originals a build needs: series photos, their art-direction files, entry photos", () => {
  const keys = seriesKeys({
    lisbon: JSON.stringify({
      photos: [
        { file: "a.jpg", art: { mobile: { file: "a-tall.jpg" }, tablet: { ratio: "3:2", position: "top" } } },
        { file: "b.png" },
      ],
    }),
  });
  assert.deepEqual(keys, ["photos/lisbon/a.jpg", "photos/lisbon/a-tall.jpg", "photos/lisbon/b.png"]);
  const md = 'Text\n\n![A tram](../../../.originals/alps/tram.jpg "Tram 28")\n![Two](../../../.originals/alps/two.png)';
  assert.deepEqual(entryKeys(md), ["alps/tram.jpg", "alps/two.png"]);
  assert.deepEqual(entryKeys("![x](https://example.com/a.jpg)"), []);
});

// ---- placeholder colours and EXIF text -------------------------------------------

test("colour classes are plain rules, one per colour, never inline styles", () => {
  assert.equal(colourClass("aabbcc"), "c-aabbcc");
  const css = colourCss(["aabbcc", "112233", "aabbcc"]);
  assert.equal(css.match(/\.c-/g)?.length, 2);
  assert.match(css, /\.c-112233\{background:#112233\}/);
  assert.doesNotMatch(css, /!important|style=/);
});

test("EXIF is shown as text: camera, lens, focal length, aperture, shutter, ISO", () => {
  const e = parseExif({
    Make: "Canon",
    Model: "Canon EOS R6",
    LensModel: "RF 35mm F1.8",
    FocalLength: "35.0 mm",
    FNumber: 1.8,
    ExposureTime: "1/250",
    ISO: 400,
    DateTimeOriginal: "2026:10:12 18:04:00",
  });
  assert.deepEqual(e, {
    camera: "Canon EOS R6",
    lens: "RF 35mm F1.8",
    focalLength: "35 mm",
    aperture: "ƒ/1.8",
    shutter: "1/250 s",
    iso: 400,
    year: 2026,
  });
  assert.deepEqual(parseExif({}), {});
  assert.equal(parseExif({ Make: "FUJIFILM", Model: "X-T5" }).camera, "FUJIFILM X-T5");
});

// ---- rights metadata ----------------------------------------------------------------

test("rights fields: creator, notice, credit, web statement, PLUS data-mining prohibition, GPS cleared", () => {
  assert.equal(copyrightNotice(2026), "© 2026 Filippo Guanti. All rights reserved.");
  const avif = rightsArgs("avif", 2026);
  assert.ok(avif.includes("-XMP-dc:Creator=Filippo Guanti"));
  assert.ok(avif.includes("-XMP-xmpRights:WebStatement=https://philglov.es/rights"));
  assert.ok(avif.includes(`-XMP-plus:DataMining#=${DATA_MINING}`));
  assert.equal(DATA_MINING, "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING");
  assert.ok(avif.includes("-gps:all="));
  assert.ok(!avif.some((a) => a.startsWith("-IPTC:")), "IPTC records exist in JPEG only");
  const jpeg = rightsArgs("jpg", 2026);
  assert.ok(jpeg.includes("-IPTC:By-line=Filippo Guanti"));
  assert.ok(jpeg.includes("-IPTC:CopyrightNotice=© 2026 Filippo Guanti. All rights reserved."));
  assert.ok(jpeg.includes("-IPTC:Credit=Filippo Guanti"));
});

const noExiftool = hasExiftool() ? false : "exiftool is not installed (CI installs it)";

test(
  "a photo with a GPS position comes out with the rights fields and no position, in every format",
  { skip: noExiftool },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "rights-"));
    try {
      const base = sharp({ create: { width: 64, height: 48, channels: 3, background: "#778899" } });
      const gps = {
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "38/1 42/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "9/1 8/1 0/1" },
      };
      writeFileSync(join(dir, "a.jpg"), await base.clone().jpeg().withExif(gps).toBuffer());
      writeFileSync(join(dir, "a.webp"), await base.clone().webp().withExif(gps).toBuffer());
      writeFileSync(join(dir, "a.avif"), await base.clone().avif().toBuffer());
      // Plant a position in the AVIF too, the way a careless pipeline might.
      execFileSync("exiftool", ["-overwrite_original", "-GPSLatitude=38.7", "-GPSLatitudeRef=N", join(dir, "a.avif")], {
        stdio: "ignore",
      });

      applyRights(readdirSync(dir).map((n) => ({ file: join(dir, n), year: 2026 })));

      for (const name of readdirSync(dir)) {
        const out = JSON.parse(
          execFileSync("exiftool", ["-json", "-a", "-G1", "-n", join(dir, name)], { encoding: "utf8" }),
        )[0] as Record<string, unknown>;
        const keys = Object.keys(out);
        assert.ok(!keys.some((k) => /GPS/i.test(k)), `${name}: GPS survived: ${keys.filter((k) => /GPS/i.test(k))}`);
        assert.equal(out["XMP-dc:Creator"], "Filippo Guanti", name);
        assert.equal(out["XMP-dc:Rights"], "© 2026 Filippo Guanti. All rights reserved.", name);
        assert.equal(out["XMP-photoshop:Credit"], "Filippo Guanti", name);
        assert.equal(out["XMP-xmpRights:WebStatement"], "https://philglov.es/rights", name);
        assert.equal(out["XMP-plus:DataMining"], DATA_MINING, name);
        if (name.endsWith(".jpg")) {
          assert.equal(out["IPTC:CopyrightNotice"], "© 2026 Filippo Guanti. All rights reserved.");
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// ---- the built site -------------------------------------------------------------------

const dist = new URL("../../dist/", import.meta.url);
const built = existsSync(new URL("index.html", dist));

function htmlFiles(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(new URL(`${e.name}/`, dir)) : e.name.endsWith(".html") ? [new URL(e.name, dir)] : [],
  );
}

test(
  "every photograph on every page has alt text, width and height, lazy loading except one priority image",
  { skip: built ? false : "run `pnpm build` first" },
  () => {
    const problems: string[] = [];
    for (const file of htmlFiles(dist)) {
      const html = readFileSync(file, "utf8");
      const imgs = [...html.matchAll(/<img\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => /\/_assets\/[^"]+\.(jpe?g|png|webp|avif)/.test(tag) && !tag.includes("/_assets/share/"));
      const name = fileURLToPath(file).split(/[\\/]dist[\\/]/)[1];
      let eager = 0;
      for (const tag of imgs) {
        if (!/\balt="[^"]+"/.test(tag)) problems.push(`${name}: <img> without alt text`);
        if (!/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag))
          problems.push(`${name}: <img> without width and height`);
        if (/loading="eager"/.test(tag)) {
          eager++;
          if (!/fetchpriority="high"/.test(tag)) problems.push(`${name}: eager image without fetchpriority="high"`);
        } else if (!/loading="lazy"/.test(tag)) problems.push(`${name}: <img> is neither lazy nor the priority image`);
      }
      if (eager > 1) problems.push(`${name}: ${eager} eager images`);
    }
    assert.deepEqual(problems, []);
  },
);

test(
  "no photograph in dist carries GPS data or lacks the copyright notice",
  { skip: built && hasExiftool() ? false : "needs a build and exiftool" },
  () => {
    const assets = new URL("_assets/", dist);
    const images = readdirSync(assets)
      .filter((f) => /\.(avif|webp|jpe?g)$/i.test(f))
      .map((f) => fileURLToPath(new URL(f, assets)));
    if (images.length === 0) return;
    const rows = JSON.parse(
      execFileSync("exiftool", ["-json", "-a", "-G1", "-Copyright", "-Rights", "-GPS*", ...images], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    ) as Record<string, unknown>[];
    assert.equal(rows.length, images.length);
    for (const row of rows) {
      const keys = Object.keys(row);
      assert.ok(!keys.some((k) => /GPS/i.test(k)), `${String(row["SourceFile"])} carries GPS`);
      assert.ok(
        keys.some((k) => /Rights|Copyright/.test(k)),
        `${String(row["SourceFile"])} has no copyright notice`,
      );
    }
  },
);
