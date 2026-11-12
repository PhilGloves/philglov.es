# Decision records

One short file per architectural decision: what was decided, why, and what was rejected. Number them in order and
never renumber. To change a decision, add a new record that supersedes the old one and mark the old one
"Superseded by NNNN".

| #    | Decision                                                                                 | Status                                  |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| 0001 | [Astro, static output](0001-astro-static.md)                                             | Accepted                                |
| 0002 | [Cloudflare Workers with Static Assets, EU data](0002-cloudflare-workers.md)             | Accepted                                |
| 0003 | [Flat bilingual URL scheme](0003-url-scheme.md)                                          | Accepted                                |
| 0004 | [No CAPTCHA](0004-no-captcha.md)                                                         | Accepted                                |
| 0005 | [Photo originals in private R2](0005-r2-photo-originals.md)                              | Accepted                                |
| 0006 | [Publishing from the phone](0006-phone-publishing.md)                                    | Accepted                                |
| 0007 | [How the dependency cap is counted](0007-dependency-cap.md)                              | Accepted                                |
| 0008 | [Environments and their data](0008-environments.md)                                      | Accepted                                |
| 0009 | [Asset layout, routing and headers](0009-assets-and-routing.md)                          | Accepted                                |
| 0010 | [Tooling and supply chain](0010-tooling.md)                                              | Accepted                                |
| 0011 | [Translation inside the pull-request run](0011-ci-translation.md)                        | Superseded by 0012                      |
| 0012 | [Both languages written by hand](0012-hand-written-translations.md)                      | Accepted                                |
| 0013 | [Lighthouse: median of three runs](0013-lighthouse-median-of-three.md)                   | Accepted                                |
| 0014 | [Design system: one stylesheet, pinned fonts](0014-design-system.md)                     | Accepted; typography superseded by 0015 |
| 0015 | [One typeface, Crimson Pro, two files, 80 KB](0015-one-typeface-crimson-pro.md)          | Accepted                                |
| 0016 | [Frontend: pages, Worker form contract, share images, footnotes](0016-frontend-pages.md) | Accepted                                |
