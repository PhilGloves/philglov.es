import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { filesUnder } from "../../scripts/lib/files.ts";
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
import { burnWatermark, JPEG_QUALITY, LARGE_EDGE, largeSize, TEXT_SHARE } from "../../src/lib/watermark.ts";

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

// ---- the large version a click opens (decision 0043) ------------------------------------

test("the large version is LARGE_EDGE px on its long edge at most, and never enlarged", () => {
  assert.equal(LARGE_EDGE, 2400);
  assert.deepEqual(largeSize(4000, 2667), { width: 2400, height: 1600 });
  assert.deepEqual(largeSize(2667, 4000), { width: 1600, height: 2400 });
  assert.deepEqual(largeSize(1600, 1200), { width: 1600, height: 1200 });
});

test("the watermark: bottom right, about 1.2 % of the long edge high, readable on light and dark, the same every time", async () => {
  const [w, h] = [2400, 1600];
  for (const [bg, level] of [
    ["#e8e4da", 0xe0],
    ["#1c1d1a", 0x1c],
  ] as const) {
    const plain = await sharp({ create: { width: w, height: h, channels: 3, background: bg } })
      .png()
      .toBuffer();
    const marked = await burnWatermark(plain);
    assert.ok(marked.equals(await burnWatermark(plain)), `${bg}: the same bytes every time`);
    const meta = await sharp(marked).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", w, h]);
    assert.equal(meta.exif, undefined, "no metadata of its own: photo-rights writes the notice");
    const a = await sharp(marked).greyscale().raw().toBuffer();
    const b = await sharp(plain).jpeg({ quality: JPEG_QUALITY }).greyscale().raw().toBuffer();
    let [x0, y0, x1, y1, lighter, darker] = [w, h, 0, 0, 0, 0];
    for (let i = 0; i < a.length; i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (Math.abs(d) < 24) continue;
      const [x, y] = [i % w, Math.floor(i / w)];
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      if (d > 0) lighter++;
      else darker++;
    }
    const cap = w * TEXT_SHARE;
    assert.ok(x0 > w * 0.8 && y0 > h * 0.9, `${bg}: the mark starts at ${x0},${y0}, not in the corner`);
    assert.ok(x1 < w - cap && y1 < h - cap, `${bg}: the mark keeps a margin (ends at ${x1},${y1})`);
    // From the top of "F" to the bottom of "pp": a little under twice the height of the capitals.
    assert.ok(y1 - y0 > cap && y1 - y0 < 2 * cap, `${bg}: the mark is ${y1 - y0} px high`);
    if (level > 0x80) assert.ok(darker > 100, `${bg}: the dark edge shows on a light photo`);
    else assert.ok(lighter > 1000, `${bg}: the white text shows on a dark photo`);
  }
});

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

const htmlFiles = (dir: URL): URL[] => filesUnder(dir, /\.html$/);

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
    // The large versions too, in their own folder (0043).
    const images = filesUnder(new URL("_assets/", dist), /\.(avif|webp|jpe?g)$/i).map((f) => fileURLToPath(f));
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

// ---- photos inside journal entries ----------------------------------------------------

test("an entry photo is capped at 1600 px with the text column as its sizes, whatever the original", async () => {
  const { capEntryImage, ENTRY_SIZES, MAX_WIDTH } = await import("../../src/lib/entry-image-service.ts");
  const out = capEntryImage({
    "data-astro-image": "constrained",
    width: 4000,
    height: 2667,
    widths: [4000, 8000],
    sizes: "(min-width: 4000px) 4000px, 100vw",
  });
  assert.equal(MAX_WIDTH, 1600);
  assert.deepEqual([out.width, out.height], [1600, 1067]);
  assert.deepEqual(out.widths, [480, 800, 1200, 1600]);
  assert.equal(out.sizes, ENTRY_SIZES);
  assert.match(ENTRY_SIZES, /36rem/);
  // A tall photo is capped by its height too, so no file is longer than 2400 px (0043).
  const tall = capEntryImage({ "data-astro-image": "constrained", width: 1080, height: 1920, widths: [] as number[] });
  assert.deepEqual([tall.width, tall.height], [1080, 1920]);
  const phone = capEntryImage({ "data-astro-image": "constrained", width: 2160, height: 3840, widths: [] as number[] });
  assert.deepEqual([phone.width, phone.height, phone.widths], [1350, 2400, [480, 800, 1200, 1350]]);
  // Portfolio photographs (<Photo>, layout "none") carry no data-astro-image and pass through untouched.
  const portfolio = { width: 2400, widths: [480, 2400], sizes: "100vw" };
  assert.deepEqual(capEntryImage(portfolio), portfolio);
});

test(
  "an entry photo in the build is never wider than 1600 px: attributes, srcset and the files themselves",
  { skip: built ? false : "run `pnpm build` first" },
  async () => {
    const assets = new URL("_assets/", dist);
    let seen = 0;
    for (const file of htmlFiles(dist)) {
      const html = readFileSync(file, "utf8");
      for (const tag of html.matchAll(/<img\b[^>]*data-astro-image[^>]*>/g)) {
        seen++;
        const img = tag[0];
        const where = fileURLToPath(file);
        const width = Number(/\swidth="(\d+)"/.exec(img)?.[1]);
        assert.ok(width > 0 && width <= 1600, `${where}: width ${width}`);
        assert.match(img, /\sheight="\d+"/, where);
        assert.match(img, /loading="lazy"/, where);
        assert.match(img, /sizes="\(min-width: 38rem\) 36rem, calc\(100vw - 2rem\)"/, where);
        assert.doesNotMatch(img, /\sstyle=/, where);
        const srcset = /srcset="([^"]+)"/.exec(img)?.[1] ?? "";
        const candidates = srcset.split(",").map((c) => c.trim().split(/\s+/));
        assert.ok(candidates.length >= 2, `${where}: several widths`);
        for (const [url = "", descriptor = ""] of candidates) {
          assert.ok(Number.parseInt(descriptor, 10) <= 1600, `${where}: ${descriptor}`);
          const actual =
            (await sharp(fileURLToPath(new URL(url.replace("/_assets/", ""), assets))).metadata()).width ?? 0;
          assert.ok(actual <= 1600, `${url} is ${actual} px wide`);
        }
      }
    }
    if (seen === 0) return; // no entry carries a photograph in this build
  },
);

// Final review, T3-01 (FINAL-REVIEW.md): the plain <img> of a <Photo> pointed at a JPEG as large as the original
// (the portrait at 3024 × 4032, the fixtures' Lisbon photos at 4000 px), a print-quality copy for anyone who reads
// the page source. Decision 0019's widths end at 2400.
test(
  "no image a page shows is wider than 2400 px, and every <img src> is one of its srcset files",
  { skip: built ? false : "run `pnpm build` first" },
  async () => {
    const assets = new URL("_assets/", dist);
    const big = new Set<string>();
    let seen = 0;
    for (const file of htmlFiles(dist)) {
      const html = readFileSync(file, "utf8");
      for (const tag of html.matchAll(/<(?:img|source)\b[^>]*\ssrcset="[^"]+"[^>]*>/g)) {
        seen++;
        const srcset = /\ssrcset="([^"]+)"/.exec(tag[0])?.[1] ?? "";
        const candidates = srcset.split(",").map((c) => c.trim().split(/\s+/)[0] ?? "");
        const src = /\ssrc="([^"]+)"/.exec(tag[0])?.[1];
        if (src !== undefined)
          assert.ok(candidates.includes(src), `${fileURLToPath(file)}: src ${src} is not one of its srcset files`);
        for (const url of [src, ...candidates].filter((u): u is string => !!u?.startsWith("/_assets/"))) {
          const { width = 0, height = 0 } = await sharp(fileURLToPath(new URL(url.slice(9), assets))).metadata();
          if (width > 2400) big.add(`${url}: ${width} × ${height}`);
        }
      }
    }
    assert.ok(seen > 0, "the build has photographs (the fixtures do; the real site has the portrait)");
    assert.deepEqual([...big], []);
  },
);

// ---- the large versions in the build (decision 0043) ------------------------------------

test(
  "no file in dist is longer than 2400 px on either side: the originals never reach the site",
  { skip: built ? false : "run `pnpm build` first" },
  async () => {
    const big: string[] = [];
    const images = filesUnder(dist, /\.(avif|webp|jpe?g|png|gif)$/i);
    for (const file of images) {
      const { width = 0, height = 0 } = await sharp(fileURLToPath(file)).metadata();
      if (Math.max(width, height) > LARGE_EDGE) big.push(`${fileURLToPath(file)}: ${width} × ${height}`);
    }
    assert.ok(images.length > 0);
    assert.deepEqual(big, []);
  },
);

test(
  "each large version a page links to is a JPEG in /_assets/large/, at most 2400 px, with the link text of its language",
  { skip: built ? false : "run `pnpm build` first" },
  async () => {
    const text = { en: "Open the large version", it: "Apri la foto" };
    const linked = new Map<string, string>();
    for (const file of htmlFiles(dist)) {
      const html = readFileSync(file, "utf8");
      const lang = /<html lang="(en|it)"/.exec(html)?.[1] as "en" | "it";
      const page = fileURLToPath(file).split(/[\\/]dist[\\/]/)[1] ?? "";
      if (page === "styleguide.html") continue; // its specimen links to the top of the page
      for (const m of html.matchAll(/<a class="large" href="([^"]+)">([^]*?)<\/a>/g)) {
        const [, href = "", inner = ""] = m;
        assert.match(href, /^\/_assets\/large\/[^/]+\.jpeg$/, page);
        assert.equal((inner.match(/<img\b/g) ?? []).length, 1, `${page}: one photograph per link`);
        assert.ok(inner.endsWith(`<span class="sr-only">${text[lang]}</span>`), `${page}: the link text`);
        linked.set(page.replaceAll("\\", "/"), href);
        // The page's own JPEG of the same width carries no mark: the two differ in the corner only.
        const large = fileURLToPath(new URL(href.slice(1), dist));
        const { width = 0, height = 0 } = await sharp(large).metadata();
        const same = new RegExp(`(/_assets/[^ "]+\\.jpeg) ${width}w`).exec(inner)?.[1];
        if (!same) continue;
        const corner = (f: string, right: boolean) =>
          sharp(f)
            .extract({ left: right ? width - 400 : 0, top: height - 120, width: 400, height: 120 })
            .greyscale()
            .raw()
            .toBuffer();
        const plainFile = fileURLToPath(new URL(same.slice(1), dist));
        const diff = async (right: boolean) => {
          const [a, b] = [await corner(large, right), await corner(plainFile, right)];
          return a.reduce((sum, v, i) => sum + Math.abs(v - (b[i] ?? 0)), 0) / a.length;
        };
        assert.ok((await diff(true)) > 4 * (await diff(false)) + 1, `${page}: the mark is in the large file only`);
      }
    }
    for (const href of new Set(linked.values())) {
      const meta = await sharp(fileURLToPath(new URL(href.slice(1), dist))).metadata();
      assert.equal(meta.format, "jpeg", href);
      assert.ok(Math.max(meta.width, meta.height) <= LARGE_EDGE, `${href}: ${meta.width} × ${meta.height}`);
    }
    // The fixtures cover a series photo, an entry photo and the About portrait, in both languages (0033).
    if (existsSync(new URL("photos/lisbon/tram-28.html", dist)))
      for (const page of [
        "photos/lisbon/tram-28.html",
        "it/photos/lisbon/alfama.html",
        "foto.html",
        "it/provafoto.html",
        "about.html",
        "it/about.html",
      ])
        assert.ok(linked.has(page), `${page} links its photograph to the large version`);
    // A series page and the home page link their photos to the photo pages, never to a large version.
    for (const page of ["index.html", "photos/lisbon.html"]) assert.ok(!linked.has(page), page);
    const sitemap = readFileSync(new URL("sitemap.xml", dist), "utf8");
    assert.doesNotMatch(sitemap, /_assets/);
  },
);
