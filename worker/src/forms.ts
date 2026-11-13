/**
 * POST /api/comment and POST /api/report (B2): plain urlencoded forms, so
 * they work with JavaScript off. Order of the checks: request shape, honeypot
 * and signed token (no database work for bots), rate limit, then the fields.
 * Success: 303 back to the page with ?sent=…; failure: the same page, 422 (429
 * when rate-limited), with the errors and everything the visitor typed.
 */
import { ipHash } from "./crypto.ts";
import { log } from "./log.ts";
import { withHeaders } from "./headers.ts";
import { entryFor, langOfPath, manifest, pathFor, type Lang } from "./manifest.ts";
import { notify } from "./notify.ts";
import {
  failureReply,
  pageHeaders,
  plain,
  sentReply,
  servePage,
  type Failure,
  type FormName,
  type FormReply,
} from "./page.ts";
import { allow } from "./ratelimit.ts";
import { required } from "./secrets.ts";
import type { FormError } from "./strings.ts";
import { checkFormToken } from "./tokens.ts";
import { readComment, readReport, sitePath, validateComment, validateReport, type Errors } from "./validate.ts";

/** Generous for a 5,000-character comment, even if every character is escaped as %XX%XX%XX. */
const MAX_BODY = 64 * 1024;

const isLang = (value: string | null): value is Lang => value === "en" || value === "it";

async function readForm(request: Request): Promise<URLSearchParams | Response | null> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  return new URLSearchParams(text);
}

/** A browser posting our own form sends our own origin (or none at all). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin === null || origin === new URL(request.url).origin;
}

async function spamCheck(env: Env, form: URLSearchParams): Promise<FormError | null> {
  if ((form.get("website") ?? "") !== "") return "honeypot";
  const check = await checkFormToken(required(env.FORM_HMAC_KEY), form.get("token") ?? "");
  if (check === "ok") return null;
  return check === "fast" ? "fast" : "expired";
}

/** The page's own script sends the form in the background and asks for JSON; a plain form post does not. */
const wantsJson = (request: Request): boolean => (request.headers.get("Accept") ?? "").includes("application/json");

/**
 * Always 200: the outcome is in the body (`ok`). A 4xx answer to fetch() makes Chrome log "Failed to load
 * resource" in the console, which rule 11 forbids. Plain form posts keep the brief's 422 and 429.
 */
function reply(env: Env, body: FormReply): Response {
  return withHeaders(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }), {
    ...pageHeaders(env),
    "Cache-Control": "no-store",
  });
}

function done(request: Request, env: Env, path: string, sent: FormName): Response {
  if (wantsJson(request)) return reply(env, sentReply(langOfPath(path), sent));
  const anchor = sent === "comment" ? "comment-status" : "report-status";
  return new Response(null, { status: 303, headers: { Location: `${path}?sent=${sent}#${anchor}` } });
}

function again(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  path: string,
  failure: Failure,
  status = 422,
): Promise<Response> {
  if (wantsJson(request)) return Promise.resolve(reply(env, failureReply(langOfPath(path), failure)));
  return servePage(request, env, ctx, { path, status, failure });
}

export async function handleComment(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.FORM_HMAC_KEY || !env.IP_SALT) {
    log("config missing");
    return plain(env, 503, "Comments are not available right now.");
  }
  if (!sameOrigin(request)) return plain(env, 403, "Forbidden");
  const form = await readForm(request);
  if (!(form instanceof URLSearchParams)) return plain(env, 400, "Bad request");

  const slug = form.get("slug") ?? "";
  const lang = form.get("lang");
  const site = await manifest(env);
  const entry = isLang(lang) ? entryFor(site, slug, lang) : undefined;
  if (!entry?.comments) return plain(env, 400, "Bad request");
  const path = pathFor(entry.slug, entry.lang);

  const input = readComment(form);
  const values = { name: input.name, email: input.email, comment: input.comment };
  const spam = await spamCheck(env, form);
  if (spam) {
    log("spam rejected");
    return again(request, env, ctx, path, { form: "comment", errors: {}, formError: spam, values });
  }
  const hash = await ipHash(request, env.IP_SALT);
  if (!(await allow(env.DB, hash))) {
    log("rate limited");
    return again(request, env, ctx, path, { form: "comment", errors: {}, formError: "rate", values }, 429);
  }
  const errors: Errors = validateComment(input);
  if (Object.keys(errors).length) return again(request, env, ctx, path, { form: "comment", errors, values });

  await env.DB.prepare(
    "INSERT INTO comments (slug, lang, name, email, body, status, created_at, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7)",
  )
    .bind(entry.slug, entry.lang, input.name, input.email, input.comment, Date.now(), hash)
    .run();
  log("comment stored");
  ctx.waitUntil(notify(env, "comment", entry.title));
  return done(request, env, path, "comment");
}

export async function handleReport(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.FORM_HMAC_KEY || !env.IP_SALT) {
    log("config missing");
    return plain(env, 503, "Reports are not available right now.");
  }
  if (!sameOrigin(request)) return plain(env, 403, "Forbidden");
  const form = await readForm(request);
  if (!(form instanceof URLSearchParams)) return plain(env, 400, "Bad request");

  const pagePath = sitePath(form.get("url"));
  if (!pagePath) return plain(env, 400, "Bad request");
  // A report may come from any page; a path we cannot serve falls back to that language's home.
  const site = await manifest(env);
  const known = await env.ASSETS.fetch(new Request(new URL(pagePath, request.url), { method: "HEAD" }));
  const path = known.ok ? pagePath : langOfPath(pagePath) === "it" ? "/it" : "/";

  const input = readReport(form);
  const values = { message: input.message, email: input.email };
  const spam = await spamCheck(env, form);
  if (spam) {
    log("spam rejected");
    return again(request, env, ctx, path, { form: "report", errors: {}, formError: spam, values });
  }
  const hash = await ipHash(request, env.IP_SALT);
  if (!(await allow(env.DB, hash))) {
    log("rate limited");
    return again(request, env, ctx, path, { form: "report", errors: {}, formError: "rate", values }, 429);
  }
  const errors = validateReport(input);
  if (Object.keys(errors).length) return again(request, env, ctx, path, { form: "report", errors, values });

  await env.DB.prepare(
    "INSERT INTO reports (page_url, message, email, created_at, ip_hash, status) VALUES (?1, ?2, ?3, ?4, ?5, 'open')",
  )
    .bind(pagePath, input.message, input.email || null, Date.now(), hash)
    .run();
  log("report stored");
  const title = site.entries.find((e) => e.path === pagePath)?.title ?? pagePath;
  ctx.waitUntil(notify(env, "report", title));
  return done(request, env, path, "report");
}
