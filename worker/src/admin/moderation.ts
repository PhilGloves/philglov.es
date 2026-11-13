/**
 * GET /admin and POST /admin/action (B4): the moderation queue and the open
 * error reports, with approve / reject / reply / mark done / delete as plain
 * forms carrying a CSRF token. Everything shown is escaped (html``).
 * With JavaScript on, /admin/moderation.js sends the same forms in the
 * background and gets a `RowReply` (JSON) instead of the 303 (decision 0020).
 */
import type { Identity } from "../access.ts";
import { html, Safe } from "../html.ts";
import { log } from "../log.ts";
import { manifest, pathFor, type Lang, type Manifest } from "../manifest.ts";
import { required } from "../secrets.ts";
import { csrfToken } from "../tokens.ts";
import { clean, isEmail, length, LIMITS } from "../validate.ts";
import { adminPage, multiline, when, type Counts } from "./layout.ts";

interface CommentRow {
  id: number;
  slug: string;
  lang: Lang;
  name: string;
  email: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: number;
  reply_body: string | null;
}

interface ReportRow {
  id: number;
  page_url: string;
  message: string;
  email: string | null;
  created_at: number;
}

const COMMENT_COLUMNS = "id, slug, lang, name, email, body, status, created_at, reply_body";

const NOTICES: Record<string, string> = {
  approve: "Approved. The comment is live within a minute.",
  reject: "Rejected. It is deleted after 30 days.",
  reply: "Reply saved and the comment approved. Both are live within a minute.",
  delete: "Deleted for good, with its name and email.",
  done: "Report marked done. It is deleted 12 months after it arrived.",
  "delete-report": "Report deleted for good.",
  "delete-draft": "Draft deleted.",
};

const GONE = "Already deleted.";

/** What /admin/moderation.js needs to update one row in place: never HTML, only text and states. */
export interface RowReply {
  ok: true;
  /** The `data-row` of every card that shows this item ("comment-12", "report-3"). */
  row: string;
  status: "approved" | "rejected" | "done" | "deleted";
  notice: string;
  /** After a reply: the saved text ("" when it was cleared). */
  reply?: string;
  counts: Counts;
}

/** The page carries the counts in these spans, so the script can update them. */
const count = (kind: keyof Counts, n: number): Safe => html`<span data-count="${kind}">${n}</span>`;

/** One per card, after its buttons: the script writes the outcome here and moves focus to it. */
const rowStatus = new Safe('<p class="notice row-status" role="status" tabindex="-1" data-row-status></p>');

const hiddenIf = (yes: boolean): Safe | string => (yes ? new Safe(" hidden") : "");

export async function counts(env: Env): Promise<Counts> {
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS comments, (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports",
  ).first<Counts>();
  return row ?? { comments: 0, reports: 0 };
}

function hidden(csrf: string, id: number): Safe {
  return html`<input type="hidden" name="csrf" value="${csrf}" /><input type="hidden" name="id" value="${id}" />`;
}

function entryLink(site: Manifest, slug: string, lang: Lang): Safe {
  const entry = site.entries.find((e) => e.slug === slug && e.lang === lang);
  return html`<a href="${pathFor(slug, lang)}">${entry?.title ?? slug}</a>`;
}

function commentCard(c: CommentRow, csrf: string, site: Manifest): Safe {
  const badge = c.status === "approved" ? "badge badge--ok" : c.status === "rejected" ? "badge badge--bad" : "badge";
  return html`<li class="card" data-row="comment-${c.id}">
    <h3>${c.name} <span class="${badge}">${c.status}</span></h3>
    <p class="fine muted">
      ${when(c.created_at)} UTC · ${entryLink(site, c.slug, c.lang)} · written on the
      ${c.lang === "en" ? "English" : "Italian"} page · <a href="mailto:${c.email}">${c.email}</a>
    </p>
    <p class="body" lang="${c.lang}">${multiline(c.body)}</p>
    <div class="c-reply" data-reply${hiddenIf(!c.reply_body)}>
      <span class="fine">Your reply</span>
      <p>${multiline(c.reply_body ?? "")}</p>
    </div>
    <form method="post" action="/admin/action" class="actions">
      ${hidden(csrf, c.id)}
      <button type="submit" name="action" value="approve" class="btn"${hiddenIf(c.status === "approved")}>
        Approve
      </button>
      <button type="submit" name="action" value="reject" class="btn btn--danger"${hiddenIf(c.status === "rejected")}>
        Reject
      </button>
    </form>
    ${rowStatus}
    <details>
      <summary>Reply</summary>
      <form method="post" action="/admin/action" class="form">
        ${hidden(csrf, c.id)}
        <div class="field">
          <label for="reply-${c.id}">Your reply, shown under the comment (plain text)</label>
          <textarea id="reply-${c.id}" name="reply" rows="4" maxlength="${LIMITS.comment}">
${c.reply_body ?? ""}</textarea>
        </div>
        <div class="actions">
          <button type="submit" name="action" value="reply" class="btn btn--ghost">Save reply and approve</button>
        </div>
      </form>
    </details>
    <details>
      <summary>Delete for good</summary>
      <form method="post" action="/admin/action" class="form">
        ${hidden(csrf, c.id)}
        <div class="field">
          <label
            ><input type="checkbox" name="confirm" value="yes" required /> Delete this comment with its name and email.
            This cannot be undone.</label
          >
        </div>
        <div class="actions">
          <button type="submit" name="action" value="delete" class="btn btn--danger">Delete</button>
        </div>
      </form>
    </details>
  </li>`;
}

function reportCard(r: ReportRow, csrf: string): Safe {
  return html`<li class="card" data-row="report-${r.id}">
    <h3><a href="${r.page_url}">${r.page_url}</a> <span class="badge">open</span></h3>
    <p class="fine muted">
      ${when(r.created_at)} UTC${r.email ? html` · <a href="mailto:${r.email}">${r.email}</a>` : " · no email"}
    </p>
    <p class="body">${multiline(r.message)}</p>
    <form method="post" action="/admin/action" class="actions">
      ${hidden(csrf, r.id)}
      <button type="submit" name="action" value="done" class="btn">Mark done</button>
    </form>
    ${rowStatus}
    <details>
      <summary>Delete for good</summary>
      <form method="post" action="/admin/action" class="form">
        ${hidden(csrf, r.id)}
        <div class="field">
          <label
            ><input type="checkbox" name="confirm" value="yes" required /> Delete this report. This cannot be
            undone.</label
          >
        </div>
        <div class="actions">
          <button type="submit" name="action" value="delete-report" class="btn btn--danger">Delete</button>
        </div>
      </form>
    </details>
  </li>`;
}

const list = (items: Safe[], empty: string): Safe =>
  items.length
    ? html`<ol class="queue">
        ${items}
      </ol>`
    : html`<p class="muted">${empty}</p>`;

/** GET /admin, and the result of a search by email (POST, so the address never sits in a URL or a log). */
export async function moderationPage(
  env: Env,
  identity: Identity,
  url: URL,
  found?: { email: string; rows: CommentRow[] },
): Promise<Response> {
  const csrf = await csrfToken(required(env.FORM_HMAC_KEY), identity.sub);
  const site = await manifest(env);
  const [pending, reports, recent, total] = await Promise.all([
    env.DB.prepare(
      `SELECT ${COMMENT_COLUMNS} FROM comments WHERE status = 'pending' ORDER BY created_at LIMIT 100`,
    ).all<CommentRow>(),
    env.DB.prepare(
      "SELECT id, page_url, message, email, created_at FROM reports WHERE status = 'open' ORDER BY created_at LIMIT 100",
    ).all<ReportRow>(),
    env.DB.prepare(
      `SELECT ${COMMENT_COLUMNS} FROM comments WHERE status = 'approved' ORDER BY created_at DESC LIMIT 20`,
    ).all<CommentRow>(),
    counts(env),
  ]);
  const done = url.searchParams.get("done") ?? "";
  const notice = NOTICES[done];
  const body = html` ${notice ? html`<p class="notice" role="status">${notice}</p>` : ""}
    ${
      found
        ? html`<h2 class="admin-title" id="found">Comments from ${found.email} (${found.rows.length})</h2>
            ${list(
              found.rows.map((c) => commentCard(c, csrf, site)),
              "No comment from this address.",
            )}`
        : ""
    }
    <h2 class="admin-title" id="comments">Comments to moderate (${count("comments", total.comments)})</h2>
    ${list(
      pending.results.map((c) => commentCard(c, csrf, site)),
      "Nothing waiting.",
    )}
    <h2 class="admin-title" id="reports">Error reports (${count("reports", total.reports)})</h2>
    ${list(
      reports.results.map((r) => reportCard(r, csrf)),
      "No open reports.",
    )}
    <h2 class="admin-title" id="published">Latest published comments</h2>
    ${list(
      recent.results.map((c) => commentCard(c, csrf, site)),
      "None yet.",
    )}
    <h2 class="admin-title" id="find">Find comments by email</h2>
    <p class="fine muted">For a request to see or delete someone's data. Exact address, any case.</p>
    <form method="post" action="/admin/action" class="form">
      <input type="hidden" name="csrf" value="${csrf}" />
      <div class="field">
        <label for="find-email">Email</label
        ><input id="find-email" name="email" type="email" autocomplete="off" required maxlength="254" />
      </div>
      <div class="actions"><button type="submit" name="action" value="find" class="btn btn--ghost">Find</button></div>
    </form>`;
  return adminPage(env, { title: "Moderation", current: "comments", counts: total, body, script: "moderation" });
}

/**
 * POST /admin/action. The CSRF token has been checked by the router. `json`: the request came from
 * /admin/moderation.js, which gets a `RowReply`, or `{ ok: false }` and then posts the form the plain way.
 */
export async function moderationAction(
  env: Env,
  identity: Identity,
  url: URL,
  form: URLSearchParams,
  json = false,
): Promise<Response> {
  const action = form.get("action") ?? "";
  const id = Number(form.get("id"));
  const confirmed = form.get("confirm") === "yes";
  const db = env.DB;

  if (action === "find") {
    const email = clean(form.get("email"), false);
    if (!isEmail(email)) return moderationPage(env, identity, url, { email, rows: [] });
    const { results } = await db
      .prepare(`SELECT ${COMMENT_COLUMNS} FROM comments WHERE email = ?1 COLLATE NOCASE ORDER BY created_at`)
      .bind(email)
      .all<CommentRow>();
    return moderationPage(env, identity, url, { email, rows: results });
  }

  if (action === "delete-draft") {
    await db
      .prepare("DELETE FROM drafts WHERE id = ?1")
      .bind(form.get("id") ?? "")
      .run();
    log("admin action");
    return back("/admin/write", action);
  }

  const refuse = (): Response => (json ? answer({ ok: false }) : back("/admin", ""));
  if (!Number.isSafeInteger(id) || id < 1) return refuse();
  let changes: number;
  let reply: string | undefined;
  switch (action) {
    case "approve":
      changes = await change(db.prepare("UPDATE comments SET status = 'approved' WHERE id = ?1").bind(id));
      break;
    case "reject":
      changes = await change(db.prepare("UPDATE comments SET status = 'rejected' WHERE id = ?1").bind(id));
      break;
    case "reply":
      reply = clean(form.get("reply"), true);
      if (length(reply) > LIMITS.comment) return refuse();
      changes = await change(
        db.prepare("UPDATE comments SET reply_body = ?2, status = 'approved' WHERE id = ?1").bind(id, reply || null),
      );
      break;
    case "delete":
      if (!confirmed) return refuse();
      changes = await change(db.prepare("DELETE FROM comments WHERE id = ?1").bind(id));
      break;
    case "done":
      changes = await change(
        db.prepare("UPDATE reports SET status = 'done', done_at = ?2 WHERE id = ?1").bind(id, Date.now()),
      );
      break;
    case "delete-report":
      if (!confirmed) return refuse();
      changes = await change(db.prepare("DELETE FROM reports WHERE id = ?1").bind(id));
      break;
    default:
      return refuse();
  }
  log("admin action");
  if (!json) return back("/admin", action);
  const gone = changes === 0;
  return answer({
    ok: true,
    row: `${action === "done" || action === "delete-report" ? "report" : "comment"}-${id}`,
    status: gone ? "deleted" : (STATUS[action] ?? "deleted"),
    notice: gone ? GONE : (NOTICES[action] ?? ""),
    ...(reply !== undefined && !gone ? { reply } : {}),
    counts: await counts(env),
  });
}

/** The state an item is in after each action that succeeded. */
const STATUS: Record<string, RowReply["status"]> = {
  approve: "approved",
  reject: "rejected",
  reply: "approved",
  delete: "deleted",
  done: "done",
  "delete-report": "deleted",
};

/** Rows the statement changed: 0 means the item was already gone (deleted in another tab). */
const change = async (statement: D1PreparedStatement): Promise<number> => (await statement.run()).meta.changes;

/** Always 200 with the outcome in the body: a 4xx answer to fetch() would put a line in the console (rule 11). */
const answer = (body: RowReply | { ok: false }): Response =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });

function back(path: string, done: string): Response {
  const query = NOTICES[done] ? `?done=${done}` : "";
  return new Response(null, { status: 303, headers: { Location: `${path}${query}` } });
}
