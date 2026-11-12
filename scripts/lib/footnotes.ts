/**
 * Footnotes in Markdown entries (decision 0016; closes the footnote back-link ticket).
 *
 * Astro 7 renders Markdown with Sätteri, which writes every footnote back-link
 * as the character "↩" and the section title and link labels in English. Crimson
 * Pro has no arrow glyphs (so "↩" would come from a system font) and Italian
 * entries need Italian labels. Configuring Sätteri needs another package and
 * still gives one language for all entries, so the build fixes the finished HTML
 * instead: no new dependency, and it can read each page's own `lang`.
 *
 *  - the back-link glyph becomes the site's one inline SVG arrow, pointing left
 *    (the same path as src/components/Arrow.astro);
 *  - the visually hidden section title and the back-link aria-labels are written
 *    in the page language.
 */
import en from "../../src/i18n/en.json" with { type: "json" };
import it from "../../src/i18n/it.json" with { type: "json" };

const strings = { en, it } as const;

const ARROW_LEFT =
  '<svg class="arr arr--left" viewBox="0 0 20 14" aria-hidden="true" focusable="false"><path d="M1 7h17M12 1.5 18 7l-6 5.5" fill="none" stroke="currentColor" stroke-width="1.6"></path></svg>';

export function localiseFootnotes(html: string): string {
  if (!html.includes("data-footnotes")) return html;
  const lang = /<html[^>]*\blang="(\w+)"/.exec(html)?.[1] === "it" ? "it" : "en";
  const text = strings[lang];
  return html
    .replace(/(<h2 [^>]*id="footnote-label"[^>]*>)[^<]*(<\/h2>)/, `$1${text.footnotesTitle}$2`)
    .replace(/<a [^>]*data-footnote-backref[^>]*>↩/g, (tag) =>
      tag
        .replace(
          /aria-label="Back to reference ([^"]*)"/,
          (_, n: string) => `aria-label="${text.footnoteBack.replace("{n}", n)}"`,
        )
        .replace(/↩$/, ARROW_LEFT),
    );
}
