/** getStaticPaths helpers for the four dynamic routes (entries and pages, journal, photos), shared by en and it. */
import { getPages, getSeries, getSlots } from "./collections.ts";
import { otherLocale, paginate, rowsFor, slugOf, type Locale } from "./entries.ts";
import { TOPICS } from "./topics.ts";

/** /<slug> and /it/<slug>: journal entries and standalone pages (about, now, rights, privacy). */
export async function slugPaths(locale: Locale) {
  const slots = await getSlots();
  const pages = (await getPages()).filter((p) => p.data.lang === locale);
  const twins = new Set((await getPages()).filter((p) => p.data.lang === otherLocale(locale)).map((p) => slugOf(p.id)));
  return [
    ...slots
      .filter((slot) => slot.versions[locale])
      .map((slot) => ({ params: { slug: slot.slug }, props: { kind: "entry" as const, item: slot } })),
    ...pages.map((page) => {
      const slug = slugOf(page.id);
      return { params: { slug }, props: { kind: "page" as const, slug, page, hasTwin: twins.has(slug) } };
    }),
  ];
}

/** /journal, /journal/page/2, /journal/travel, /journal/travel/page/2 … */
export async function journalPaths(locale: Locale) {
  const rows = rowsFor(await getSlots(), locale);
  const paths: { params: { rest: string | undefined }; props: { tag: string | undefined; page: number } }[] = [];
  for (const tag of [undefined, ...TOPICS]) {
    const count = rows.filter((r) => !tag || r.version.entry.data.tags.includes(tag)).length;
    const { pages } = paginate(Array.from({ length: count }), 1);
    for (let page = 1; page <= pages; page++) {
      const base = tag ? `${tag}/` : "";
      const rest = page === 1 ? (tag ?? undefined) : `${base}page/${page}`;
      paths.push({ params: { rest }, props: { tag, page } });
    }
  }
  return paths;
}

/** /photos, /photos/<series>, /photos/<series>/<photo> */
export async function photoPaths() {
  const series = await getSeries();
  return [
    { params: { rest: undefined as string | undefined }, props: {} as { series?: string; photo?: string } },
    ...series.map((s) => ({
      params: { rest: s.slug },
      props: { series: s.slug } as { series?: string; photo?: string },
    })),
    ...series.flatMap((s) =>
      s.photos.map((p) => ({
        params: { rest: `${s.slug}/${p.id}` },
        props: { series: s.slug, photo: p.id } as { series?: string; photo?: string },
      })),
    ),
  ];
}
