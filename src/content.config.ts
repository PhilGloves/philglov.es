import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { folders } from "../scripts/lib/content-root.ts";

/**
 * The collections are read from src/content, or from the test fixtures for the test builds
 * (scripts/lib/content-root.ts, decision 0033).
 *
 * The content schema is the contract: an entry missing a field fails the
 * build, so a malformed laptop or phone entry never goes live.
 *
 * Twins are files with the same name in the en/ and it/ folders, e.g.
 * journal/it/alps.md and journal/en/alps.md. An entry may exist in one
 * language only. Cross-file checks (a translation has its original twin,
 * folder matches `lang`, reserved slugs, alt text) are a separate build check
 * owned by the content agent (TICKETS.md, C2).
 */

export const LOCALES = ["en", "it"] as const;

const locale = z.enum(LOCALES);

/**
 * Topics were removed on 2026-11-15 (decision 0023). Older files may still carry a `tags:` line, so the strict
 * schemas accept one; nothing reads it, and the publisher no longer writes it.
 */
const legacyTags = z.array(z.string()).optional();

/**
 * Both language versions are written by hand; there is no `translation`
 * field. A page is the original when `lang` equals `originalLang`, and the
 * owner's own translation otherwise. `.strict()` makes a leftover
 * `translation:` key fail the build.
 */
const languageFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(200),
  date: z.coerce.date(),
  lang: locale,
  originalLang: locale,
};

const journal = defineCollection({
  loader: glob({ base: `./${folders.journal}`, pattern: "{en,it}/*.md" }),
  schema: z
    .object({
      ...languageFields,
      tags: legacyTags,
      comments: z.boolean(),
    })
    .strict(),
});

/** About, Now, Rights, Privacy and other standalone pages. */
const pages = defineCollection({
  loader: glob({ base: `./${folders.pages}`, pattern: "{en,it}/*.md" }),
  schema: z
    .object({
      ...languageFields,
      tags: legacyTags,
      comments: z.boolean().default(false),
    })
    .strict(),
});

const bilingual = z.object({ en: z.string().trim().min(1), it: z.string().trim().min(1) }).strict();

/** Optional overrides for what is read from the original file at build. */
const exifOverrides = z
  .object({
    camera: z.string(),
    lens: z.string(),
    focalLength: z.string(),
    aperture: z.string(),
    shutter: z.string(),
    iso: z.number().int().positive(),
  })
  .partial()
  .strict();

const fileName = z.string().regex(/^[a-z0-9][a-z0-9-]*\.(jpe?g|png)$/, "lowercase name, .jpg/.jpeg/.png");

/**
 * Art direction: a separate crop for a breakpoint. Either another original of
 * the same series (`file`), or the same photo cut to a ratio around a side or
 * corner (`position`, sharp's gravity words). Breakpoints are the page tiers:
 * mobile ≤ 640 px, tablet ≤ 1040 px, desktop above.
 */
const crop = z.union([
  z.object({ file: fileName }).strict(),
  z
    .object({
      ratio: z.string().regex(/^[1-9]\d?:[1-9]\d?$/, 'width:height, e.g. "4:5"'),
      position: z
        .enum(["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"])
        .default("center"),
    })
    .strict(),
]);
const art = z.object({ desktop: crop, tablet: crop, mobile: crop }).partial().strict();

/**
 * One photos.json per series: src/content/photos/<series>/photos.json.
 * `file` names the original in the private R2 bucket philglov-originals.
 */
const photos = defineCollection({
  loader: glob({ base: `./${folders.photos}`, pattern: "*/photos.json" }),
  schema: z
    .object({
      title: bilingual,
      description: bilingual.optional(),
      photos: z
        .array(
          z
            .object({
              file: fileName,
              alt: bilingual,
              caption: bilingual,
              takenAt: z.coerce.date(),
              exif: exifOverrides.optional(),
              art: art.optional(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
});

export const collections = { journal, pages, photos };
