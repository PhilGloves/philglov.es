# Brand files

The site's identity: the owner's icon, an autograph "P" in cream on the moss accent (#4a5d23), chosen 2026-11-20.
Everything the site knows about its identity is named in `brand.config.ts`; replace these files and edit that config,
and no template changes.

| File                   | Used for                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `favicon.svg`          | the main icon: browser tab (drawing elements only; `tests/unit/brand.test.ts` refuses scripts, links and images)   |
| `site-icon.png`        | 512 px source of the two PNGs below; not served                                                                    |
| `favicon-32.png`       | fallback tab icon, and `/favicon.ico` (built from it by `scripts/postbuild.ts`)                                    |
| `apple-touch-icon.png` | 180 px home-screen icon (full bleed; iOS rounds the corners)                                                       |
| `share-template.svg`   | 1200×630 share image, filled per entry by `fillShareTemplate` (`share-image.ts`, run by `scripts/share-images.ts`) |

After replacing `site-icon.png`, `node scripts/make-brand-icons.ts` redraws the two PNGs from it (with sharp).
