/**
 * The `sizes` attribute for each place a photograph is drawn, measured against
 * the layout in site.css (phone ≤ 40rem: one column with a 1rem gutter; wider:
 * the content column of the 12-column grid). The browser picks the 480–2400 px
 * file from these, so they decide how many bytes a phone downloads.
 */
export const SIZES = {
  /** Home hero: full width of the page, capped at the 90rem grid. */
  hero: "(min-width: 90rem) 1440px, 100vw",
  /** Series grid, a narrow tile (one third of the content column). */
  tile: "(min-width: 65rem) 26vw, (min-width: 40rem) 40vw, calc(100vw - 2rem)",
  /** Series grid, a wide tile (two thirds). */
  tileWide: "(min-width: 65rem) 52vw, (min-width: 40rem) 80vw, calc(100vw - 2rem)",
  /** The single photograph page: the content column, as large as it gets. */
  single: "(min-width: 65rem) 62rem, calc(100vw - 2rem)",
} as const;
