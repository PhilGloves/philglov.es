/**
 * The one Worker. It runs first on every HTML request (see run_worker_first
 * in wrangler.jsonc) and passes everything to the static assets. The backend
 * agent adds form tokens, comments, /api/* and /admin (TICKETS.md, B1–B10).
 */
import { baseHeaders, withHeaders } from "./headers.ts";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // Not built yet: answer 404 rather than fall through to a static file.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/") || /^\/admin(\/|$)/i.test(url.pathname)) {
      const notFound = await env.ASSETS.fetch(new Request(new URL("/404", url), request));
      return withHeaders(
        new Response(notFound.body, { status: 404, headers: notFound.headers }),
        baseHeaders(env.SITE_ENV),
      );
    }

    const response = await env.ASSETS.fetch(request);
    const headers = baseHeaders(env.SITE_ENV);
    if ((response.headers.get("Content-Type") ?? "").startsWith("text/html")) {
      headers["Cache-Control"] = "no-cache";
    }
    return withHeaders(response, headers);
  },
} satisfies ExportedHandler<Env>;
