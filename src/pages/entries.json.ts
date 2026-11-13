import type { APIRoute } from "astro";
import { getPages, getSlots } from "../lib/collections.ts";
import { pathFor, slugOf } from "../lib/entries.ts";
import { RESERVED_SLUGS } from "../../scripts/lib/content-check.ts";

/**
 * Build-time only: what the Worker needs to know about the content (B3, B8).
 * scripts/postbuild.ts adds the stylesheet path, writes it to
 * dist/_assets/entries.json and deletes this file, so /entries.json is never served.
 *
 * - entries: every journal entry path in both languages. The Worker inserts
 *   comments only into these pages, and accepts a comment only for one of them.
 * - taken: slugs a new entry may not use (reserved words and standalone pages).
 */
export const GET: APIRoute = async () => {
  const slots = await getSlots();
  const entries = slots.flatMap((slot) =>
    Object.values(slot.versions).map((v) => ({
      slug: slot.slug,
      lang: v.lang,
      originalLang: v.originalLang,
      path: pathFor(v.lang, `/${slot.slug}`),
      title: v.entry.data.title,
      // /admin/write lists the entries newest first for editing (decision 0021).
      date: v.entry.data.date.toISOString().slice(0, 10),
      comments: v.entry.data.comments,
    })),
  );
  const pageSlugs = (await getPages()).map((p) => slugOf(p.id));
  const taken = [...new Set([...RESERVED_SLUGS, ...pageSlugs])].sort();
  return new Response(JSON.stringify({ entries, taken }), { headers: { "Content-Type": "application/json" } });
};
