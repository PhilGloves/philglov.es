/**
 * The one Worker. It runs first on every HTML request (run_worker_first in
 * wrangler.jsonc) and never on /_assets/*. Routes:
 *   POST /api/comment, POST /api/report      public forms (forms.ts)
 *   /admin, /admin/*                         Access JWT checked first (access.ts), then admin/
 *   everything else                          the static page, rewritten (page.ts)
 * Cron: daily retention and weekly backup (scheduled.ts). See decision 0017.
 */
import { verifyAccess, type Identity } from "./access.ts";
import { WRITE_SCRIPT } from "./admin/client.ts";
import { moderationAction, moderationPage } from "./admin/moderation.ts";
import { upload } from "./admin/upload.ts";
import { referenceJson, writeAction, writeForm } from "./admin/write.ts";
import { handleComment, handleReport } from "./forms.ts";
import { adminHeaders, withHeaders } from "./headers.ts";
import { log } from "./log.ts";
import { pageHeaders, plain, servePage } from "./page.ts";
import { runScheduled } from "./scheduled.ts";
import { checkCsrfToken } from "./tokens.ts";

/** /admin in any case or encoding: /ADMIN, /%61dmin, /admin/… all count. */
export function isAdminPath(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // An undecodable path is still checked as written.
  }
  return /^\/+admin(\/|$)/i.test(path) || /^\/+admin(\/|$)/i.test(pathname);
}

const isApiPath = (pathname: string): boolean => /^\/+api(\/|$)/i.test(pathname);

async function api(request: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  if (path !== "/api/comment" && path !== "/api/report") return plain(env, 404, "Not found");
  if (request.method !== "POST") return plain(env, 405, "Method not allowed", { Allow: "POST" });
  const response =
    path === "/api/comment" ? await handleComment(request, env, ctx) : await handleReport(request, env, ctx);
  // Redirects and plain errors get the site headers here; servePage() already set its own.
  if (response.status === 303) return withHeaders(response, { ...pageHeaders(env), "Cache-Control": "no-store" });
  return response;
}

async function readAdminForm(request: Request): Promise<URLSearchParams | null> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  if (Number(request.headers.get("Content-Length") ?? "0") > 512 * 1024) return null;
  return new URLSearchParams(await request.text());
}

async function admin(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const identity = await verifyAccess(request, env);
  if (!identity || !env.FORM_HMAC_KEY) {
    log(identity ? "config missing" : "access denied");
    return new Response("Forbidden\n", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...adminHeaders(env.SITE_ENV) },
    });
  }
  const response = await adminRoute(request, env, ctx, url, identity);
  return withHeaders(response, adminHeaders(env.SITE_ENV));
}

async function adminRoute(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  url: URL,
  identity: Identity,
): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  const notFound = () => new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain" } });

  if (method === "GET" || method === "HEAD") {
    if (path === "/admin") return moderationPage(env, identity, url);
    if (path === "/admin/write") return writeForm(env, identity, url);
    if (path === "/admin/write/reference") return referenceJson(env, url);
    if (path === "/admin/write.js")
      return new Response(WRITE_SCRIPT, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
    return notFound();
  }

  // Every change carries a CSRF token bound to this Access user, and comes from this origin.
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== url.origin) return new Response("Forbidden\n", { status: 403 });

  if (method === "PUT" && path === "/admin/upload") {
    const token = request.headers.get("X-CSRF-Token") ?? "";
    if (!(await checkCsrfToken(env.FORM_HMAC_KEY, identity.sub, token)))
      return new Response("Forbidden\n", { status: 403 });
    return upload(request, env);
  }
  if (method !== "POST" || (path !== "/admin/action" && path !== "/admin/write")) return notFound();
  const form = await readAdminForm(request);
  if (!form) return new Response("Bad request\n", { status: 400 });
  if (!(await checkCsrfToken(env.FORM_HMAC_KEY, identity.sub, form.get("csrf") ?? "")))
    return new Response("The page was open too long. Go back, reload it and try again.\n", { status: 403 });
  return path === "/admin/action" ? moderationAction(env, identity, url, form) : writeAction(env, identity, form);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (isAdminPath(url.pathname)) return admin(request, env, ctx, url);
    if (isApiPath(url.pathname)) return api(request, env, ctx, url.pathname.toLowerCase());
    if (request.method !== "GET" && request.method !== "HEAD")
      return plain(env, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return servePage(request, env, ctx);
  },

  async scheduled(controller, env): Promise<void> {
    await runScheduled(controller, env);
  },
} satisfies ExportedHandler<Env>;
