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
  devToolbar: { enabled: false },
});
