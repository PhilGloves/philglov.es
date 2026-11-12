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
 * Extra headers for the files under /_assets/ (images among them), which the
 * build serves straight from dist/_headers. Image-dataset tools such as
 * img2dataset obey `noai, noimageai` by default. Cloudflare's _headers cannot
 * match by file extension, so the whole folder carries it; for CSS, fonts and
 * scripts it is harmless. The Worker's own responses get `tdm-reservation`
 * from baseHeaders() instead, because _headers never applies to them.
 */
export function assetHeaders(): Record<string, string> {
  return { "X-Robots-Tag": "noai, noimageai" };
}

/** Apply `headers` to a response, returning a new mutable response. */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) out.headers.set(name, value);
  return out;
}
