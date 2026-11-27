# 0047 - Buttons are an ink outline; one corner, 2 px, everywhere

Owner request, 2026-11-27. Amends [0014](0014-design-system.md) (radius tokens, the olive pill button).

**Decision.**

- **One corner.** The five radius tokens (`--radius-pill` 999px, `--radius-input` 5px, `--radius-box` 6px,
  `--radius-tag` 4px, `--radius-photo` 0) are replaced by one, `--radius: 2px`, because nothing needs to differ. It is
  used wherever a radius was before: fields, boxes (notices, replies, cards, code blocks, uploads, styleguide swatches),
  tags (markers, `kbd`, inline code, the photo placeholder label), photographs (`.frame`, so the About portrait and the
  frames that link to the watermarked large versions), buttons, `.chips a`, `.admin-nav a`, `.badge`, the `/admin` file
  picker button, and the two header controls (`.rbtn`, 50% before; its border stays transparent, so only forced-colours
  mode shows the corner). A photo in an entry (`.prose img`) had no radius and has none.
- **Buttons** (`.btn`): no fill, text in `--text`, a 2 px `--text` border; `.btn--ghost` the same with 1 px;
  `.btn--danger` 1 px in `--error`. Disabled (`[disabled]` or `aria-disabled="true"`): a 1 px dashed `--muted` border,
  `--muted` text, no fill. The label is set in capitals by CSS only (`text-transform: uppercase`, `letter-spacing:
0.08em`, `--fs-15`, 600); the words in the markup, Italian included, are unchanged. Hover: the main button fills with
  `--text` and its label takes `--bg`; ghost and danger keep their 8% and 12% tints. Height, padding, the focus ring and
  the forced-colours rule are unchanged.
- **Olive** (`--accent`) is on no button. It stays on links, the Now band and the "approved" badge. `--accent-ink`, the
  label colour on the olive button, had no other use and is gone.
- **`/admin`** buttons keep their 3.5 rem height and padding but take the same 15 px label (their 19 px override is
  gone), and ghost and danger lose their 2 px override, so the main button is still told apart by its heavier line.
- **/styleguide** shows every state: main, ghost, danger, disabled, keyboard focus, and hover (drawn by the
  styleguide-only class `.sg-hover`, which the hover rules list beside `:hover`), and disabled for each variant.

**Contrast**, measured by `scripts/contrast.ts` and held by `tests/unit/tokens.test.ts`: label on bg 17.77 / 15.46;
hover label (bg on text) the same; ghost hover 15.14 / 12.83; danger 7.11 / 9.26, on its hover tint 5.80 / 7.44;
disabled (muted on bg) 7.11 / 7.29 (light / dark). Every state is above 4.5:1.

**Rejected.** Keeping five radius tokens all set to 2 px (five names for one value). Capitals typed into the markup (it
would change the text, and screen readers may spell out capitals). A styleguide-only copy of the hover rules (it could
drift from the real ones).
