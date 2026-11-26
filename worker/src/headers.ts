/**
 * Response headers shared by the Worker (HTML, API, admin) and by the
 * build-generated dist/_headers file (assets served without the Worker).
 * One source, so the two never drift. Spec: docs/guide.md, "Rules for the build".
 */

export type SiteEnv = "local" | "preview" | "staging" | "production";

/** Only production may be indexed; every other environment says noindex. */
export function isIndexable(env: string): boolean {
  return env === "production";
}

/**
 * The site CSP. `scriptHashes` are the 'sha256-…' sources of the inline
 * theme script, written by the build (TICKETS.md, F1).
 */
export function contentSecurityPolicy(scriptHashes: readonly string[] = []): string {
  const scriptSrc = ["'self'", ...scriptHashes.map((h) => `'${h}'`)].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * The admin pages' own CSP (B7): like the site's, plus their one script, which
 * the Worker serves from /admin/write.js behind Access, and blob: images for
 * the photo previews on /admin/write. No inline script or style.
 */
export function adminContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Headers for every /admin response: never indexed, never stored, own CSP. */
export function adminHeaders(env: string): Record<string, string> {
  return {
    ...baseHeaders(env),
    "Content-Security-Policy": adminContentSecurityPolicy(),
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
    "Referrer-Policy": "same-origin",
  };
}

/** Headers every response carries, whatever its type. */
export function baseHeaders(env: string, scriptHashes: readonly string[] = []): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(scriptHashes),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "tdm-reservation": "1",
  };
  if (!isIndexable(env)) headers["X-Robots-Tag"] = "noindex";
  return headers;
}

/**
 * The lines of the /_assets/* rule in dist/_headers, after the "/*" rule (the
 * files there are served without the Worker). Image-dataset tools such as
 * img2dataset obey `noai, noimageai` by default. Cloudflare's _headers cannot
 * match by file extension, so the whole folder carries it; for CSS, fonts and
 * scripts it is harmless. The Worker's own responses get `tdm-reservation`
 * from baseHeaders() instead, because _headers never applies to them.
 *
 * Outside production these files are noindex like every other response (rule
 * 15). The rule says so itself: it detaches the "/*" rule's X-Robots-Tag and
 * writes the whole value, so it never depends on how two matching rules are
 * joined (decision 0027). Production is unchanged: noai, noimageai only.
 */
export function assetHeaderLines(env: string): string[] {
  if (isIndexable(env)) return ["X-Robots-Tag: noai, noimageai"];
  return ["! X-Robots-Tag", "X-Robots-Tag: noindex, noai, noimageai"];
}

/** The folder of the large versions a click on a photograph opens (decision 0043); scripts/postbuild.ts moves them. */
export const LARGE_DIR = "/_assets/large/";

/**
 * The lines of the /_assets/large/* rule, after the /_assets/* rule: in every environment a large version is never
 * a search result of its own (noindex), and never AI training material. It detaches the earlier rules' value and
 * writes the whole one, like assetHeaderLines.
 */
export const largeHeaderLines = (): string[] => ["! X-Robots-Tag", "X-Robots-Tag: noindex, noai, noimageai"];

/** The CV (decision 0046): the unlisted page, the published PDF and the name a download gets. */
export const CV_PAGE = "/cv";
export const CV_PDF = "/cv/filippo-guanti-cv.pdf";
export const CV_FILENAME = "Filippo-Guanti-CV.pdf";

/**
 * The _headers rules of the CV, after the "/*" rule: the page and everything under it are noindex in every
 * environment, and the PDF is a download. They detach X-Robots-Tag first, like assetHeaderLines. The PDF is served
 * without the Worker (wrangler.jsonc), because _headers never applies to the Worker's own responses.
 */
export function cvHeaderRules(): [path: string, lines: string[]][] {
  const noindex = ["! X-Robots-Tag", "X-Robots-Tag: noindex"];
  return [
    [CV_PAGE, noindex],
    [`${CV_PAGE}/*`, noindex],
    [CV_PDF, [`Content-Disposition: attachment; filename="${CV_FILENAME}"`]],
  ];
}

/** Apply `headers` to a response, returning a new mutable response. */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) out.headers.set(name, value);
  return out;
}
