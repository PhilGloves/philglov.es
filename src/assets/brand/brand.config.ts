/**
 * The one place that names the site's identity files. The owner has deferred
 * the brand (logo, favicon, colours of the share image): when it is chosen,
 * replace the files in this folder and edit this config; no template changes.
 *
 * Icons are imported, so Astro copies them to /_assets/ with a hashed name and
 * the Worker never runs for them. The share image is an SVG template that the
 * build fills per entry (see `shareImageSvg`); turning it into the 1200×630 PNG
 * that social networks need is a build step still to be chosen (TICKETS.md, P).
 */
import faviconPng from "./favicon-32.png";
import faviconSvg from "./favicon.svg";
import appleTouchIcon from "./apple-touch-icon.png";
import shareTemplate from "./share-template.svg?raw";
import { fillShareTemplate } from "./share-image";

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

/** The share-image SVG for one entry: the template with the title written in. */
export const shareImageSvg = (title: string): string => fillShareTemplate(title, brand.share.template);
