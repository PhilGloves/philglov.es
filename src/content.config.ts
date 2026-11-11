import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * The content schema is the contract: an entry missing a field fails the
 * build, so a malformed laptop or phone entry never goes live.
 *
 * Twins are files with the same name in the en/ and it/ folders, e.g.
 * journal/it/alps.md and journal/en/alps.md. Cross-file checks (twin exists,
 * folder matches `lang`, reserved slugs, alt text) are a separate build check
 * owned by the content agent (TICKETS.md, C2).
 */

export const LOCALES = ["en", "it"] as const;
export const TRANSLATIONS = ["original", "machine", "reviewed"] as const;
export const TOPICS = ["travel", "photography", "projects", "thoughts"] as const;

const locale = z.enum(LOCALES);

const languageFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(200),
  date: z.coerce.date(),
  lang: locale,
  originalLang: locale,
  translation: z.enum(TRANSLATIONS),
};

/** An original is written in its own language; a translation is not. */
function checkLanguage(page: { lang: string; originalLang: string; translation: string }, ctx: z.RefinementCtx): void {
  const isOriginal = page.translation === "original";
  if (isOriginal && page.lang !== page.originalLang) {
    ctx.addIssue({
      code: "custom",
      path: ["originalLang"],
      message: "translation is 'original', so originalLang must equal lang",
    });
  }
  if (!isOriginal && page.lang === page.originalLang) {
    ctx.addIssue({
      code: "custom",
      path: ["originalLang"],
      message: "a machine or reviewed translation must have originalLang different from lang",
    });
  }
}

const journal = defineCollection({
  loader: glob({ base: "./src/content/journal", pattern: "{en,it}/*.md" }),
  schema: z
    .object({
      ...languageFields,
      tags: z.array(z.enum(TOPICS)).min(1),
      comments: z.boolean(),
    })
    .strict()
    .superRefine(checkLanguage),
});

/** About, Now, Rights, Privacy and other standalone pages. */
const pages = defineCollection({
  loader: glob({ base: "./src/content/pages", pattern: "{en,it}/*.md" }),
  schema: z
    .object({
      ...languageFields,
      tags: z.array(z.enum(TOPICS)).default([]),
      comments: z.boolean().default(false),
    })
    .strict()
    .superRefine(checkLanguage),
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

/**
 * One photos.json per series: src/content/photos/<series>/photos.json.
 * `file` names the original in the private R2 bucket philglov-originals.
 */
const photos = defineCollection({
  loader: glob({ base: "./src/content/photos", pattern: "*/photos.json" }),
  schema: z
    .object({
      title: bilingual,
      description: bilingual.optional(),
      photos: z
        .array(
          z
            .object({
              file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(jpe?g|png)$/, "lowercase name, .jpg/.jpeg/.png"),
              alt: bilingual,
              caption: bilingual,
              takenAt: z.coerce.date(),
              exif: exifOverrides.optional(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
});

export const collections = { journal, pages, photos };
