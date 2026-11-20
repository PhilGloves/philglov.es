/**
 * The owner's portrait (TICKETS.md, TO-03): `site.json` `portrait` names its original in the photo bucket
 * ("portrait/<file>", fetched like every other original, never in git) and its alt text in both languages. About
 * draws it with <Photo>; the Person data on Home and About names one JPEG made from it as its `image`. Until the
 * original is there, About keeps the placeholder frame and the Person data has no image, which the launch gate reports.
 */
import { getImage } from "astro:assets";
import site from "../data/site.json" with { type: "json" };
import type { Locale } from "./entries.ts";
import { originals, records } from "./photo-meta.ts";

/** Key of the portrait's original, or undefined while site.json names none. */
export const portraitKey: string | undefined = site.portrait?.file;

/** The alt text for the page language, or the placeholder's while there is no portrait. */
export const portraitAlt = (locale: Locale): string =>
  site.portrait?.alt[locale] ?? "[Portrait of Filippo Guanti: placeholder until the photograph is added]";

/**
 * Path of a 1200 px JPEG of the portrait on this site, for the Person data; undefined until the original has been
 * fetched. The same output as the build writes for <Photo>, so the rights metadata and the no-GPS check cover it.
 */
export async function portraitImage(): Promise<string | undefined> {
  const load = portraitKey ? originals[portraitKey] : undefined;
  if (!portraitKey || !load || !records[portraitKey]) return undefined;
  const image = await getImage({ src: (await load()).default, format: "jpeg", width: 1200, quality: 78 });
  return image.src;
}
