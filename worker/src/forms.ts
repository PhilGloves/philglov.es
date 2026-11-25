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
import { entryFor, langOfPath, manifest, pathFor, type Lang, type Manifest } from "./manifest.ts";
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
import { allow, RATE_WINDOW } from "./ratelimit.ts";
import { required } from "./secrets.ts";
import type { FormError } from "./strings.ts";
import { checkFormToken, formToken } from "./tokens.ts";
import { readComment, readReport, sitePath, validateComment, validateReport, type Errors } from "./validate.ts";

/** Generous for a 5,000-character comment, even if every character is escaped as %XX%XX%XX. */
const MAX_BODY = 64 * 1024;

const isLang = (value: string | null): value is Lang => value === "en" || value === "it";

/**
 * An urlencoded form of at most `max` bytes, or null. The bytes are counted as they arrive: a request may leave out
 * Content-Length, and reading it whole first could take 100 MB into the Worker that serves every page (audit, 0040).
 */
export async function readForm(request: Request, max = MAX_BODY): Promise<URLSearchParams | null> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  if (Number(request.headers.get("Content-Length") ?? "0") > max) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  for (;;) {
    const read = await reader?.read();
    if (!read || read.done) break;
    size += read.value.byteLength;
    if (size > max) {
      await reader?.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  return new URLSearchParams(await new Blob(chunks).text());
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

/** The background senders (src/scripts/forms.ts, /admin/moderation.js) ask for JSON. */
export const wantsJson = (request: Request): boolean =>
  (request.headers.get("Accept") ?? "").includes("application/json");

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

/**
 * The token a background sender puts back in the form (FormReply.k): a fresh one when the one sent can never pass
 * (expired or not ours, the "expired" form error), as the page of a plain post gets; else the one sent. A token
 * that was only too fast is kept, so it passes as soon as it is old enough.
 */
async function nextToken(env: Env, form: URLSearchParams, failure?: Failure): Promise<string> {
  if (failure?.formError === "expired") return formToken(required(env.FORM_HMAC_KEY));
  return form.get("token") ?? "";
}

async function done(
  request: Request,
  env: Env,
  form: URLSearchParams,
  path: string,
  sent: FormName,
): Promise<Response> {
  if (wantsJson(request)) return reply(env, sentReply(langOfPath(path), sent, await nextToken(env, form)));
  const anchor = sent === "comment" ? "comment-status" : "report-status";
  return new Response(null, { status: 303, headers: { Location: `${path}?sent=${sent}#${anchor}` } });
}

async function again(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  form: URLSearchParams,
  path: string,
  failure: Failure,
  status = 422,
): Promise<Response> {
  if (wantsJson(request))
    return reply(env, failureReply(langOfPath(path), failure, await nextToken(env, form, failure)));
  return servePage(request, env, ctx, { path, status, failure });
}

/** Reject bots before touching the rate limit. Successful checks yield the hash used for storage. */
async function checkSubmission(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  form: URLSearchParams,
  path: string,
  submission: Pick<Failure, "form" | "values" | "url">,
): Promise<string | Response> {
  const spam = await spamCheck(env, form);
  if (spam) {
    log("spam rejected");
    return again(request, env, ctx, form, path, { ...submission, errors: {}, formError: spam });
  }
  const hash = await ipHash(request, required(env.IP_SALT));
  if (!(await allow(env.DB, hash))) {
    log("rate limited");
    return again(request, env, ctx, form, path, { ...submission, errors: {}, formError: "rate" }, 429);
  }
  return hash;
}

export async function handleComment(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.FORM_HMAC_KEY || !env.IP_SALT) {
    log("config missing");
    return plain(env, 503, "Comments are not available right now.");
  }
  if (!sameOrigin(request)) return plain(env, 403, "Forbidden");
  const form = await readForm(request);
  if (!form) return plain(env, 400, "Bad request");

  const slug = form.get("slug") ?? "";
  const lang = form.get("lang");
  const site = await manifest(env);
  const entry = isLang(lang) ? entryFor(site, slug, lang) : undefined;
  if (!entry?.comments) return plain(env, 400, "Bad request");
  const path = pathFor(entry.slug, entry.lang);

  const input = readComment(form);
  const values = { name: input.name, email: input.email, comment: input.comment };
  const hash = await checkSubmission(request, env, ctx, form, path, { form: "comment", values });
  if (typeof hash !== "string") return hash;
  const errors: Errors = validateComment(input);
  if (Object.keys(errors).length) return again(request, env, ctx, form, path, { form: "comment", errors, values });

  // The same text from the same address in the last 10 minutes is a second tap on Send: answered as sent, stored
  // once, one email (audit, decision 0040). One statement, so two taps at once cannot both insert.
  const stored = await env.DB.prepare(
    `INSERT INTO comments (slug, lang, name, email, body, status, created_at, ip_hash)
     SELECT ?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7
     WHERE NOT EXISTS (SELECT 1 FROM comments WHERE slug = ?1 AND ip_hash = ?7 AND body = ?5 AND created_at > ?8)`,
  )
    .bind(entry.slug, entry.lang, input.name, input.email, input.comment, Date.now(), hash, Date.now() - RATE_WINDOW)
    .run();
  if (stored.meta.changes) {
    log("comment stored");
    ctx.waitUntil(notify(env, "comment", entry.title));
  } else log("form repeated");
  return done(request, env, form, path, "comment");
}

export async function handleReport(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.FORM_HMAC_KEY || !env.IP_SALT) {
    log("config missing");
    return plain(env, 503, "Reports are not available right now.");
  }
  if (!sameOrigin(request)) return plain(env, 403, "Forbidden");
  const form = await readForm(request);
  if (!form) return plain(env, 400, "Bad request");

  const pagePath = sitePath(form.get("url"));
  if (!pagePath) return plain(env, 400, "Bad request");
  // A report may come from any page; a path we cannot serve falls back to that language's home.
  const site = await manifest(env);
  const origin = new URL(request.url).origin;
  const known = await env.ASSETS.fetch(new Request(`${origin}${pagePath}`, { method: "HEAD" }));
  const path = known.ok ? pagePath : langOfPath(pagePath) === "it" ? "/it" : "/";

  const input = readReport(form);
  const values = { message: input.message, email: input.email };
  const hash = await checkSubmission(request, env, ctx, form, path, { form: "report", values, url: pagePath });
  if (typeof hash !== "string") return hash;
  const errors = validateReport(input);
  if (Object.keys(errors).length)
    return again(request, env, ctx, form, path, { form: "report", errors, values, url: pagePath });

  const stored = await env.DB.prepare(
    `INSERT INTO reports (page_url, message, email, created_at, ip_hash, status)
     SELECT ?1, ?2, ?3, ?4, ?5, 'open'
     WHERE NOT EXISTS (SELECT 1 FROM reports WHERE page_url = ?1 AND ip_hash = ?5 AND message = ?2 AND created_at > ?6)`,
  )
    .bind(pagePath, input.message, input.email || null, Date.now(), hash, Date.now() - RATE_WINDOW)
    .run();
  if (stored.meta.changes) {
    log("report stored");
    ctx.waitUntil(notify(env, "report", reportTitle(site, pagePath, known.ok)));
  } else log("form repeated");
  return done(request, env, form, path, "report");
}

/**
 * What the notification calls the page a report is about: an entry's title, or the address of a page the site has.
 * A missing address is text the visitor chose (up to 300 characters), so the email never quotes it: the brief allows
 * only the page title there, and /admin shows the address (security audit, owner decision 2026-11-17, 0030).
 */
export function reportTitle(site: Manifest, pagePath: string, exists: boolean): string {
  if (!exists) return "a missing address";
  return site.entries.find((e) => e.path === pagePath)?.title ?? pagePath;
}
