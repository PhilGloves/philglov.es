/**
 * The one place that names the site's identity files. The icon is the owner's
 * autograph "P" on moss (2026-11-20): favicon.svg is the main icon, and
 * site-icon.png (512 px) is the source of the two PNGs, drawn by
 * `node scripts/make-brand-icons.ts`; /favicon.ico is built from favicon-32.png
 * (scripts/postbuild.ts). To change the icon, replace those files and edit this
 * config; no template changes.
 *
 * Icons are imported, so Astro copies them to /_assets/ with a hashed name and
 * the Worker never runs for them. The share image is an SVG template that the
 * build fills with each title and draws as a 1200×630 PNG (scripts/share-images.ts,
 * with `fillShareTemplate` from share-image.ts).
 */
import faviconPng from "./favicon-32.png";
import faviconSvg from "./favicon.svg";
import appleTouchIcon from "./apple-touch-icon.png";
import shareTemplate from "./share-template.svg?raw";

export const brand = {
  /** Shown in the header, titles, structured data and the share image. */
  name: "Filippo Guanti",
  domain: "philglov.es",
  /** Address bar colour on phones; the moss accent of the light theme. */
  themeColor: "#4a5d23",
  icons: {
    svg: faviconSvg.src,
    png32: faviconPng.src,
    appleTouch: appleTouchIcon.src,
  },
  share: { width: 1200, height: 630, template: shareTemplate },
} as const;
