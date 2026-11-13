import { defineConfig } from "astro/config";

// See docs/decisions/0009-assets-and-routing.md for why each option is set.
export default defineConfig({
  // Canonical URLs, sitemap and metadata always use the production domain,
  // even on staging and previews (brief rule 15).
  site: "https://philglov.es",
  output: "static",
  trailingSlash: "never",
  build: {
    // /alps -> dist/alps.html, served at /alps by html_handling "drop-trailing-slash".
    format: "file",
    // Every CSS, JS, font and image file lives under /_assets/, which the
    // Worker never runs on.
    assets: "_assets",
    // Inline <style> blocks would break the CSP (style-src 'self').
    inlineStylesheets: "never",
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "it"],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  markdown: {
    // Shiki writes inline style attributes, which the CSP blocks.
    syntaxHighlight: false,
  },
  // No client router (<ClientRouter />), no prefetch script, no dev toolbar.
  prefetch: false,
  // Astro inlines small <script>s below this limit; an inline script would need its own CSP hash.
  // 0 keeps src/scripts/forms.ts an external same-origin file under /_assets/ (script-src 'self').
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
  // Photos inside journal entries (Markdown images): responsive without MDX. The layout adds srcset, sizes, width
  // and height and lazy loading; the service caps files at 1600 px and sets `sizes` to the text column; the one
  // rule that makes them fit is in site.css (no inline styles, no injected <style>). 0019.
  image: {
    service: { entrypoint: "./src/lib/entry-image-service.ts", config: {} },
    layout: "constrained",
    responsiveStyles: false,
    breakpoints: [480, 800, 1200, 1600],
  },
});
