/**
 * Every HTML page goes through here (B3, B3b): a fresh signed token in each
 * form, the approved comments on entry pages, the thank-you after a redirect
 * and, after a failed submission, the errors and the visitor's own text.
 *
 * Fail open: if D1 or the rewriter throws, the static page is served as built.
 * Rewritten pages lose the asset's ETag, and conditional request headers are
 * dropped on the way to the assets, so a browser never revalidates its way
 * back to an old token.
 */
import { approvedComments, commentDate, commentNumber, type PublicComment } from "./comments.ts";
import { baseHeaders, withHeaders } from "./headers.ts";
import { Parts, paragraphs } from "./html.ts";
import { log } from "./log.ts";
import { entryAt, langOfPath, manifest, type Lang } from "./manifest.ts";
// SHA-256 of the inline theme script, written by scripts/postbuild.ts from the built HTML.
import scriptHashes from "./script-hashes.json" with { type: "json" };
import { fieldLabel, fieldMessage, formMessage, t, type FormError } from "./strings.ts";
import { formToken } from "./tokens.ts";
import type { Errors, Field } from "./validate.ts";

export type FormName = "comment" | "report";

/** A submission that failed: shown again with its errors and the visitor's text. */
export interface Failure {
  form: FormName;
  errors: Errors;
  formError?: FormError | undefined;
  values: Partial<Record<Field, string>>;
}

export interface PageOptions {
  /** Serve this path instead of the request's (a 422 answers with the form's page). */
  path?: string;
  status?: number;
  failure?: Failure;
}

/** Field ids in the built forms (src/components/CommentSection.astro, SiteFooter.astro). */
const FIELD_IDS: Record<FormName, Partial<Record<Field, string>>> = {
  comment: { name: "c-name", email: "c-email", comment: "c-comment" },
  report: { message: "f-msg", email: "f-mail" },
};
const FORM_SELECTOR: Record<FormName, string> = {
  comment: "#comment-form",
  report: 'form[action^="/api/report"]',
};
const STATUS_SELECTOR: Record<FormName, string> = { comment: "#comment-status", report: "#report-status" };
const ERROR_SLOT: Record<FormName, (f: Field) => string> = {
  comment: (f) => `[data-slot="error-${f}"]`,
  report: (f) => `[data-slot="report-error-${f}"]`,
};

export const pageHeaders = (env: Env): Record<string, string> => baseHeaders(env.SITE_ENV, scriptHashes);

/**
 * The answer to a form sent in the background by src/scripts/forms.ts: the
 * same messages as the page, as plain text, so the script only places text
 * (and stays small enough for the 1.5 KB budget).
 * s: id of the status slot; t: the alert's title ("" on success); m: the
 * thank-you, or the form-level message, or the field problems in one line;
 * e: every field of the form as [field id, message next to it, "" if valid].
 */
export interface FormReply {
  ok: boolean;
  s: string;
  t: string;
  m: string;
  e: [string, string][];
}

const fieldsOf = (form: FormName): [Field, string][] => Object.entries(FIELD_IDS[form]) as [Field, string][];

const statusId = (form: FormName): string => (form === "comment" ? "comment-status" : "report-status");

export const sentReply = (lang: Lang, form: FormName): FormReply => ({
  ok: true,
  s: statusId(form),
  t: "",
  m: t(lang, form === "comment" ? "w_sentComment" : "w_sentReport"),
  e: fieldsOf(form).map(([, id]) => [id, ""]),
});

export function failureReply(lang: Lang, failure: Failure): FormReply {
  const { form, errors, formError } = failure;
  const lines: string[] = [];
  const e = fieldsOf(form).map(([field, id]): [string, string] => {
    const error = errors[field];
    if (!error) return [id, ""];
    const message = fieldMessage(lang, field, error);
    lines.push(`${fieldLabel(lang, form, field)}: ${message}.`);
    return [id, message];
  });
  return {
    ok: false,
    s: statusId(form),
    t: t(lang, form === "comment" ? "w_notSentComment" : "w_notSentReport"),
    // The leading space separates it from the bold title.
    m: ` ${formError ? formMessage(lang, formError) : lines.join(" ")}`,
    e,
  };
}

export async function servePage(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  options: PageOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const path = options.path ?? url.pathname;
  const method = options.path ? "GET" : request.method;
  const assetHeaders = new Headers(request.headers);
  for (const name of ["If-None-Match", "If-Modified-Since", "If-Match", "If-Range", "Range"]) assetHeaders.delete(name);
  const asset = await env.ASSETS.fetch(
    new Request(new URL(path + (options.path ? "" : url.search), url), {
      method,
      headers: assetHeaders,
      redirect: "manual",
    }),
  );

  const headers = pageHeaders(env);
  if (!(asset.headers.get("Content-Type") ?? "").startsWith("text/html")) return withHeaders(asset, headers);

  headers["Cache-Control"] = options.failure ? "no-store" : "no-cache";
  const out = new Headers(asset.headers);
  for (const name of ["ETag", "Last-Modified", "Content-Length"]) out.delete(name);
  for (const [name, value] of Object.entries(headers)) out.set(name, value);
  const status = options.status ?? asset.status;
  if (method === "HEAD") return new Response(null, { status, headers: out });

  const original = await asset.text();
  let body = original;
  try {
    const rewriter = await buildRewriter(env, ctx, path, url, options);
    body = await rewriter.transform(new Response(original, { headers: { "Content-Type": "text/html" } })).text();
  } catch (error) {
    log("rewrite failed", error);
    body = original;
  }
  return new Response(body, { status, headers: out });
}

async function buildRewriter(
  env: Env,
  ctx: ExecutionContext,
  path: string,
  url: URL,
  options: PageOptions,
): Promise<HTMLRewriter> {
  const rewriter = new HTMLRewriter();
  const lang = langOfPath(path);

  if (env.FORM_HMAC_KEY) {
    const token = await formToken(env.FORM_HMAC_KEY);
    rewriter.on('input[name="token"]', { element: (el) => void el.setAttribute("value", token) });
  } else log("config missing");

  const entry = entryAt(await manifest(env), path);
  if (entry?.comments) {
    let comments: PublicComment[] | null = null;
    try {
      comments = await approvedComments(env, ctx, entry.slug);
    } catch (error) {
      log("comments unavailable", error);
    }
    if (comments?.length) {
      const list = comments;
      rewriter.on('[data-slot="comments"]', { element: (el) => commentList(lang, list).fill(el) });
      rewriter.on('[data-slot="comment-count"]', {
        element: (el) => new Parts().text(`(${list.length})`).fill(el),
      });
    }
  }

  const sent = url.searchParams.get("sent");
  if (!options.failure && (sent === "comment" || sent === "report")) {
    const message = t(lang, sent === "comment" ? "w_sentComment" : "w_sentReport");
    rewriter.on(STATUS_SELECTOR[sent], {
      element: (el) => new Parts().tag('<p class="notice" role="status">').text(message).tag("</p>").fill(el),
    });
  }

  if (options.failure) showFailure(rewriter, lang, options.failure);
  return rewriter;
}

function commentList(lang: Lang, comments: PublicComment[]): Parts {
  const parts = new Parts();
  comments.forEach((c, i) => {
    parts.tag('<li class="c"><span class="c-n" aria-hidden="true">').text(commentNumber(i)).tag("</span><div>");
    parts.tag('<p class="c-who"><b>').text(c.name).tag('</b> <span class="fine">');
    parts.text(commentDate(c.created_at)).tag("</span></p>");
    paragraphs(parts, c.body, `<p class="c-body" lang="${c.lang}">`);
    if (c.reply_body) {
      parts.tag('<div class="c-reply"><span class="fine">').text(t(lang, "w_replied")).tag("</span>");
      paragraphs(parts, c.reply_body, `<p lang="${c.lang}">`);
      parts.tag("</div>");
    }
    parts.tag("</div></li>");
  });
  return parts;
}

function showFailure(rewriter: HTMLRewriter, lang: Lang, failure: Failure): void {
  const { form, errors, formError, values } = failure;
  const title = t(lang, form === "comment" ? "w_notSentComment" : "w_notSentReport");
  const alert = new Parts().tag('<div class="alert" role="alert"><strong>').text(title).tag("</strong>");
  if (formError) alert.tag(" ").text(formMessage(lang, formError));
  const fields = Object.keys(errors) as Field[];
  if (fields.length) {
    alert.tag("<ul>");
    for (const field of fields) {
      const error = errors[field];
      if (!error) continue;
      alert.tag(`<li><a href="#${FIELD_IDS[form][field] ?? ""}">`);
      alert.text(`${fieldLabel(lang, form, field)}: ${fieldMessage(lang, field, error)}`).tag("</a></li>");
    }
    alert.tag("</ul>");
  }
  alert.tag("</div>");
  rewriter.on(STATUS_SELECTOR[form], { element: (el) => alert.fill(el) });

  for (const field of fields) {
    const error = errors[field];
    if (error) {
      const message = fieldMessage(lang, field, error);
      rewriter.on(ERROR_SLOT[form](field), { element: (el) => new Parts().text(message).fill(el) });
    }
  }

  for (const [field, value] of Object.entries(values) as [Field, string][]) {
    const invalid = errors[field] !== undefined;
    const tag = field === "comment" || field === "message" ? "textarea" : "input";
    rewriter.on(`${FORM_SELECTOR[form]} ${tag}[name="${field}"]`, {
      element: (el) => {
        if (tag === "textarea") el.setInnerContent(value, { html: false });
        else el.setAttribute("value", value);
        if (invalid) el.setAttribute("aria-invalid", "true");
      },
    });
  }

  if (form === "report")
    rewriter.on('[data-slot="report-details"]', { element: (el) => void el.setAttribute("open", "") });
}

/** A short plain-text error with the site's headers (bad requests that no form could have sent). */
export function plain(env: Env, status: number, text: string, extra: Record<string, string> = {}): Response {
  return withHeaders(new Response(`${text}\n`, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }), {
    ...pageHeaders(env),
    "Cache-Control": "no-store",
    ...extra,
  });
}
