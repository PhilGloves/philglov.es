# Brand files (placeholder)

Neutral placeholders until the owner chooses an identity. Everything the site knows about its identity is named in
`brand.config.ts`; replace these files and edit that config, and no template changes.

| File                   | Used for                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `favicon.svg`          | browser tab icon (moss rounded square, no letters)                                  |
| `favicon-32.png`       | fallback tab icon                                                                   |
| `apple-touch-icon.png` | 180 px home-screen icon (full bleed; iOS rounds the corners)                        |
| `share-template.svg`   | 1200×630 share image, filled per entry by `shareImageSvg(title)` (`share-image.ts`) |

`node scripts/make-brand-icons.ts` redraws the two PNGs from the accent colour.
