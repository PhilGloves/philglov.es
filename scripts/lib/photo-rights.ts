/**
 * Rights metadata for every published image. Astro's image service strips all
 * metadata, GPS included; this writes back only what we want to say, with
 * exiftool (it also handles AVIF, which sharp's withXmp does not).
 *
 * Written into every output: IPTC/XMP Creator, Copyright Notice, Credit Line,
 * Web Statement of Rights, and the IPTC/PLUS Data Mining field (plus:DataMining)
 * set to "prohibited except search engine indexing". GPS is removed again as a
 * belt-and-braces step. Camera data is shown as text on the page, never embedded.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CREATOR = "Filippo Guanti";
export const WEB_STATEMENT = "https://philglov.es/rights";
export const DATA_MINING = "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING";
export const copyrightNotice = (year: number): string => `© ${year} ${CREATOR}. All rights reserved.`;

/** exiftool arguments (one per line in an argfile) for one image. `ext` is lower case without the dot. */
export function rightsArgs(ext: string, year: number): string[] {
  const args = [
    `-XMP-dc:Creator=${CREATOR}`,
    `-XMP-dc:Rights=${copyrightNotice(year)}`,
    `-XMP-photoshop:Credit=${CREATOR}`,
    `-XMP-xmpRights:Marked=True`,
    `-XMP-xmpRights:WebStatement=${WEB_STATEMENT}`,
    // "#" writes the raw PLUS vocabulary URI, not the printable label.
    `-XMP-plus:DataMining#=${DATA_MINING}`,
  ];
  if (ext === "jpg" || ext === "jpeg") {
    args.push(`-IPTC:By-line=${CREATOR}`, `-IPTC:CopyrightNotice=${copyrightNotice(year)}`, `-IPTC:Credit=${CREATOR}`);
  }
  args.push("-gps:all=", "-XMP-exif:GPS*=");
  return args;
}

export function hasExiftool(): boolean {
  try {
    execFileSync("exiftool", ["-ver"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Writes the rights fields into each file in place. `items` are absolute paths with their copyright year. */
export function applyRights(items: { file: string; year: number }[]): void {
  if (items.length === 0) return;
  const dir = mkdtempSync(join(tmpdir(), "exiftool-"));
  try {
    // One argfile, one process: exiftool's own startup is the slow part. -execute separates the files.
    const lines: string[] = [];
    for (const { file, year } of items) {
      const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
      lines.push(
        "-charset",
        "filename=utf8",
        "-overwrite_original",
        "-P",
        "-m",
        ...rightsArgs(ext, year),
        file,
        "-execute",
      );
    }
    const argfile = join(dir, "args.txt");
    writeFileSync(argfile, `${lines.join("\n")}\n`, "utf8");
    // Each -execute runs one command, so every block repeats its options.
    execFileSync("exiftool", ["-@", argfile], { stdio: ["ignore", "ignore", "inherit"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface ExifSummary {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutter?: string;
  iso?: number;
  /** Capture year, when the file says. */
  year?: number;
}

/** Reads the camera data of an original (printed values), or {} when exiftool cannot. */
export function readExif(file: string): ExifSummary {
  try {
    const out = execFileSync(
      "exiftool",
      [
        "-json",
        "-Make",
        "-Model",
        "-LensModel",
        "-FocalLength",
        "-FNumber",
        "-ExposureTime",
        "-ISO",
        "-DateTimeOriginal",
        file,
      ],
      { encoding: "utf8" },
    );
    return parseExif(JSON.parse(out)[0] ?? {});
  } catch {
    return {};
  }
}

export function parseExif(raw: Record<string, unknown>): ExifSummary {
  const s = (k: string): string | undefined =>
    typeof raw[k] === "string" || typeof raw[k] === "number" ? String(raw[k]).trim() || undefined : undefined;
  const make = s("Make");
  const model = s("Model");
  // "Canon" + "Canon EOS R6" is just "Canon EOS R6".
  const camera =
    model && make && !model.toLowerCase().startsWith(make.toLowerCase().split(" ")[0] ?? "")
      ? `${make} ${model}`
      : (model ?? make);
  const shutter = s("ExposureTime");
  const aperture = s("FNumber");
  const iso = Number(raw["ISO"]);
  const year = Number(/^(\d{4})/.exec(s("DateTimeOriginal") ?? "")?.[1]);
  const out: ExifSummary = {};
  if (camera) out.camera = camera;
  const lens = s("LensModel");
  if (lens) out.lens = lens;
  const focal = s("FocalLength");
  if (focal) out.focalLength = focal.replace(/\.0\b/, "");
  if (aperture) out.aperture = `ƒ/${aperture}`;
  if (shutter) out.shutter = `${shutter} s`;
  if (Number.isFinite(iso) && iso > 0) out.iso = iso;
  if (Number.isFinite(year) && year > 1900) out.year = year;
  return out;
}
