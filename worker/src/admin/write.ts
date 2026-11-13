/**
 * /admin/write (B8): write an entry on the phone and publish it as a pull
 * request. Text works without JavaScript; photos need the page's one script
 * (/admin/write.js: slug suggestion, autosave, uploads with progress and retry).
 *
 * Publish goes live by itself (decision 0021): the pull request gets GitHub
 * auto-merge, and merges once the required Test check passes, which also
 * proves it changes entry files only. The page lists the publisher's pull
 * requests still open, and flags any older than 15 minutes.
 *
 * Same slug, other language: the new text is that entry's other-language
 * version. originalLang comes from the existing file, which is shown under
 * the form for reference. Nothing is translated (decision 0012).
 *
 * Editing (decision 0021): a published entry, picked from the list, opens in
 * the same form with its slug and language fixed. Saving replaces only that
 * file, and only if it is still the version that was opened (`base_sha`).
 */
import type { Identity } from "../access.ts";
import {
  entryFilePath,
  entryMarkdown,
  parseEntry,
  readEntry,
  slugFromTitle,
  SLUG,
  splitPhotos,
  validateEntry,
  type EntryErrors,
  type EntryInput,
  type PhotoRef,
} from "../entry-file.ts";
import {
  enableAutoMerge,
  GitHubError,
  githubConfigured,
  openPublications,
  openPullRequest,
  readFile,
  type OpenPublication,
  type RepoFile,
} from "../github.ts";
import { html, Safe } from "../html.ts";
import { log } from "../log.ts";
import { manifest, pathFor, type Entry, type Lang } from "../manifest.ts";
import { randomId } from "../crypto.ts";
import { required } from "../secrets.ts";
import { csrfToken } from "../tokens.ts";
import { TOPICS } from "../../../src/lib/topics.ts";
import en from "../../../src/i18n/en.json" with { type: "json" };
import { adminPage, when } from "./layout.ts";
import { MAX_PHOTO } from "./upload.ts";

const LANG_NAME: Record<Lang, string> = { en: "English", it: "Italian" };
const other = (lang: Lang): Lang => (lang === "en" ? "it" : "en");
const asLang = (value: string | null): Lang => (value === "it" ? "it" : "en");

/** A publisher pull request still open after this long needs a look: a check failed, or auto-merge is off. */
export const ATTENTION_AFTER = 15 * 60 * 1000;
/** Published entries listed for editing (newest first); a search finds older ones. */
const LISTED = 30;

interface DraftRow {
  id: string;
  slug: string;
  lang: Lang;
  title: string;
  description: string;
  body: string;
  tags: string;
  photos: string;
  updated_at: number;
  base_sha: string;
}

interface FormState {
  input: EntryInput;
  draftId: string;
  /** The blob sha of the entry file when it was opened for editing; "" for a new entry. */
  baseSha: string;
  updated: number;
  errors?: EntryErrors;
  message?: Safe;
  /** The title search of the list of published entries. */
  query?: string;
}

const editing = (state: FormState): boolean => state.baseSha !== "";

const empty = (lang: Lang): EntryInput => ({
  title: "",
  slug: "",
  lang,
  description: "",
  tags: [],
  body: "",
  photos: [],
});

/** What the slug means in this language: a new entry, the other-language version of one, or an edit. */
export interface Lookup {
  kind: "new" | "translation" | "update" | "taken" | "invalid";
  message: string;
  reference?: string;
  originalLang?: Lang;
}

export async function lookup(env: Env, slug: string, lang: Lang): Promise<Lookup> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    return { kind: "invalid", message: "Lowercase letters, digits and hyphens." };
  const site = await manifest(env);
  if (site.taken.includes(slug)) return { kind: "taken", message: `"${slug}" is reserved or used by a page.` };
  const live = (l: Lang) => site.entries.find((e) => e.slug === slug && e.lang === l);
  let same: RepoFile | null = null;
  let twin: RepoFile | null = null;
  if (githubConfigured(env)) {
    [same, twin] = await Promise.all([
      readFile(env, entryFilePath(lang, slug)),
      readFile(env, entryFilePath(other(lang), slug)),
    ]);
  }
  if (same || live(lang))
    return {
      kind: "update",
      message: `This entry already exists in ${LANG_NAME[lang]}: pick it under "Edit a published entry" to change it.`,
    };
  if (twin || live(other(lang))) {
    const parsed = twin ? parseEntry(twin.text) : null;
    const originalLang =
      parsed?.originalLang === "en" || parsed?.originalLang === "it" ? parsed.originalLang : undefined;
    return {
      kind: "translation",
      message: `"${slug}" exists in ${LANG_NAME[other(lang)]}: this will be its ${LANG_NAME[lang]} version, written by you.`,
      ...(twin ? { reference: twin.text } : {}),
      ...(originalLang ? { originalLang } : {}),
    };
  }
  return { kind: "new", message: `New entry at ${pathFor(slug, lang)}` };
}

function fieldError(errors: EntryErrors | undefined, field: keyof EntryErrors, id: string): Safe {
  const message = errors?.[field];
  return html`<span id="${id}-err" class="field-error">${message ?? ""}</span>`;
}

const invalid = (errors: EntryErrors | undefined, field: keyof EntryErrors): Safe =>
  errors?.[field] ? new Safe(' aria-invalid="true"') : new Safe("");

function photoItem(photo: PhotoRef, index: number): Safe {
  const id = `ph-${index}`;
  return html`<li class="card photo-item">
    <input type="hidden" name="photo_key" value="${photo.key}" />
    <p class="fine">${photo.key.split("/").pop() ?? photo.key}</p>
    <div class="field">
      <label for="${id}-alt">Alt text: what is in it and why it matters</label
      ><input id="${id}-alt" name="photo_alt" required maxlength="300" value="${photo.alt}" />
    </div>
    <div class="field">
      <label for="${id}-cap">Caption</label
      ><input id="${id}-cap" name="photo_caption" maxlength="300" value="${photo.caption}" />
    </div>
    <div class="actions"><button type="button" class="btn btn--ghost" data-remove>Remove</button></div>
  </li>`;
}

const CHEAT_SHEET = html`<details>
  <summary>Markdown cheat sheet</summary>
  <ul class="fine">
    <li>Blank line: new paragraph</li>
    <li><code>## Heading</code> for a subheading</li>
    <li><code>_italics_</code> and <code>**bold**</code></li>
    <li><code>[words](https://example.com)</code> for a link</li>
    <li><code>- item</code> for a list, <code>1. item</code> for a numbered one</li>
    <li><code>&gt; text</code> for a quotation</li>
    <li><code>text[^1]</code> and, at the end, <code>[^1]: the note</code> for a footnote</li>
    <li>Photos go after the text, in the order you add them.</li>
  </ul>
</details>`;

/** Lowercase, accents dropped: "Città" matches "citta". */
const folded = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Published entries whose title contains the search, newest first. */
export function entriesFor(entries: readonly Entry[], query: string): Entry[] {
  const q = folded(query.trim());
  return entries
    .filter((e) => !q || folded(e.title).includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title) || a.lang.localeCompare(b.lang));
}

const editLink = (slug: string, lang: Lang): string => `/admin/write?edit=1&slug=${slug}&lang=${lang}`;

function publishedList(entries: readonly Entry[], query: string): Safe {
  const found = entriesFor(entries, query);
  const shown = found.slice(0, LISTED);
  return html`<h2 class="admin-title" id="published-entries">Edit a published entry</h2>
    <form method="get" action="/admin/write#published-entries" class="form">
      <div class="field">
        <label for="e-q">Search by title</label
        ><input id="e-q" name="q" type="search" maxlength="120" autocomplete="off" value="${query}" />
      </div>
      <div class="actions"><button type="submit" class="btn btn--ghost">Search</button></div>
    </form>
    ${
      shown.length
        ? html`<ol class="queue" data-entries>
            ${shown.map(
              (e) =>
                html`<li class="card">
                  <h3><a href="${editLink(e.slug, e.lang)}" lang="${e.lang}">${e.title}</a></h3>
                  <p class="fine muted">${e.date} · ${LANG_NAME[e.lang]} · ${e.path}</p>
                </li>`,
            )}
          </ol>`
        : html`<p class="muted">${query ? "No published entry has that in its title." : "Nothing published yet."}</p>`
    }
    ${
      found.length > shown.length
        ? html`<p class="fine muted">The newest ${shown.length} of ${found.length}. Search to find the others.</p>`
        : ""
    }`;
}

/** The publisher's pull requests that are not merged yet: on their way, or (after 15 minutes) needing a look. */
function goingLive(open: OpenPublication[] | null, now: number): Safe {
  if (open === null) return html`<p class="fine muted">Could not ask GitHub which entries are still on their way.</p>`;
  if (!open.length) return html``;
  return html`<h2 class="admin-title" id="going-live">On their way</h2>
    <ol class="queue">
      ${open.map((p) => {
        const late = now - p.openedAt > ATTENTION_AFTER;
        return html`<li class="card" data-publication="${late ? "attention" : "pending"}">
          <h3>
            <a href="${p.url}">${p.title}</a>
            <span class="${late ? "badge badge--bad" : "badge"}">${late ? "needs attention" : "going live"}</span>
          </h3>
          <p class="fine muted">Pull request opened ${when(p.openedAt)} UTC</p>
          ${
            late
              ? html`<p>Still not merged after 15 minutes. Open the pull request to see which check failed.</p>`
              : html`<p class="fine">It merges by itself once the checks pass, usually within a few minutes.</p>`
          }
        </li>`;
      })}
    </ol>`;
}

async function writePage(env: Env, identity: Identity, state: FormState, status = 200): Promise<Response> {
  const csrf = await csrfToken(required(env.FORM_HMAC_KEY), identity.sub);
  const { input, errors } = state;
  const isEdit = editing(state);
  const found = input.slug && !isEdit ? await lookup(env, input.slug, input.lang).catch(() => null) : null;
  const [drafts, site, open] = await Promise.all([
    env.DB.prepare(
      "SELECT id, slug, lang, title, updated_at, base_sha FROM drafts ORDER BY updated_at DESC LIMIT 20",
    ).all<Pick<DraftRow, "id" | "slug" | "lang" | "title" | "updated_at" | "base_sha">>(),
    manifest(env),
    githubConfigured(env)
      ? openPublications(env).catch((error: unknown) => {
          log("publications unavailable", error);
          return null;
        })
      : Promise.resolve([]),
  ]);
  // The autosave key in this browser: per server draft, per entry being edited, or the one new entry.
  const autosave = state.draftId || (isEdit ? `edit-${input.lang}-${input.slug}` : "");

  const errorList = errors && Object.values(errors).filter(Boolean);
  const body = html` <h2 class="admin-title">${isEdit ? "Edit" : "Write"}</h2>
    ${state.message ?? ""}
    ${
      errorList?.length
        ? html`<div class="alert" role="alert">
            <strong>${isEdit ? "Not saved." : "Not published."}</strong>
            <ul>
              ${errorList.map((e) => html`<li>${e}</li>`)}
            </ul>
          </div>`
        : ""
    }
    ${githubConfigured(env) ? "" : html`<p class="alert" role="alert"><strong>Publishing is not set up.</strong> The GitHub App secrets are missing (docs/setup.md, step 10). Save drafts until then.</p>`}
    ${goingLive(open, Date.now())}
    <form
      method="post"
      action="/admin/write"
      class="form"
      id="write-form"
      data-draft="${autosave}"
      data-updated="${state.updated}"
      data-max="${MAX_PHOTO}"
    >
      <input type="hidden" name="csrf" value="${csrf}" />
      <input type="hidden" name="draft_id" value="${state.draftId}" />
      <input type="hidden" name="base_sha" value="${state.baseSha}" />
      <div class="field">
        <label for="w-title">Title</label
        ><input
          id="w-title"
          name="title"
          maxlength="120"
          required
          value="${input.title}"
          aria-describedby="w-title-err"
          ${invalid(errors, "title")}
        />${fieldError(errors, "title", "w-title")}
      </div>
      ${
        isEdit
          ? html`<div class="field-row">
              <div class="field">
                <label for="w-slug">Slug</label
                ><input id="w-slug" name="slug" readonly value="${input.slug}" aria-describedby="w-slug-hint" />
                <span id="w-slug-hint" class="hint">Fixed while editing, so links to it never break.</span>
              </div>
              <div class="field">
                <p>Language: <strong>${LANG_NAME[input.lang]}</strong></p>
                <input type="hidden" id="w-lang" name="lang" value="${input.lang}" />
              </div>
            </div>`
          : html`<div class="field-row">
              <div class="field">
                <label for="w-slug">Slug</label
                ><input
                  id="w-slug"
                  name="slug"
                  maxlength="60"
                  autocapitalize="none"
                  autocomplete="off"
                  spellcheck="false"
                  value="${input.slug}"
                  aria-describedby="w-slug-hint w-slug-err"
                  ${invalid(errors, "slug")}
                />
                <span id="w-slug-hint" class="hint" aria-live="polite"
                  >${found?.message ?? "Suggested from the title; you can change it."}</span
                >${fieldError(errors, "slug", "w-slug")}
              </div>
              <div class="field">
                <label for="w-lang">Language</label
                ><select id="w-lang" name="lang">
                  <option value="en" ${input.lang === "en" ? new Safe(" selected") : ""}>English</option>
                  <option value="it" ${input.lang === "it" ? new Safe(" selected") : ""}>Italiano</option>
                </select>
              </div>
            </div>`
      }
      <div class="field">
        <label for="w-desc">Description: one sentence for search results and link previews</label
        ><input
          id="w-desc"
          name="description"
          maxlength="200"
          required
          value="${input.description}"
          aria-describedby="w-desc-err"
          ${invalid(errors, "description")}
        />${fieldError(errors, "description", "w-desc")}
      </div>
      <fieldset class="field">
        <legend>Topics</legend>
        ${TOPICS.map((topic) => html`<label><input type="checkbox" name="tags" value="${topic}" ${input.tags.includes(topic) ? new Safe(" checked") : ""} /> ${en[`topic_${topic}`]}</label> `)}
        ${fieldError(errors, "tags", "w-tags")}
      </fieldset>
      <div class="field">
        <label for="w-body">Text, in Markdown</label
        ><textarea id="w-body" name="body" class="write-body" aria-describedby="w-body-err" ${invalid(errors, "body")}>
${input.body}</textarea
        >${fieldError(errors, "body", "w-body")}
      </div>
      ${CHEAT_SHEET}
      <div class="field" id="photos-field" hidden>
        <label for="w-photos">Photos: JPEG or PNG, up to 25 MB each</label>
        <input id="w-photos" type="file" accept="image/jpeg,image/png" multiple aria-describedby="w-photos-hint" />
        <span id="w-photos-hint" class="hint"
          >They upload one at a time and retry by themselves. You can publish the text first and add photos later by
          editing the entry.</span
        >
        <div id="upload-status" role="status"></div>
      </div>
      <noscript><p class="fine">Adding photos needs JavaScript; the text works without it.</p></noscript>
      ${fieldError(errors, "photos", "w-photos")}
      <ol class="queue" id="photo-list">
        ${input.photos.map(photoItem)}
      </ol>
      <div class="actions">
        <button type="submit" name="intent" value="publish" class="btn">${isEdit ? "Save changes" : "Publish"}</button>
        <button type="submit" name="intent" value="save" class="btn btn--ghost">Save draft</button>
      </div>
      ${isEdit ? html`<p class="fine"><a href="/admin/write">Write a new entry instead</a></p>` : ""}
    </form>
    <div id="reference">
      ${
        found?.reference
          ? html`<details open>
              <summary>The ${LANG_NAME[other(input.lang)]} version, for reference</summary>
              <pre class="fine">${found.reference}</pre>
            </details>`
          : ""
      }
    </div>
    ${publishedList(site.entries, state.query ?? "")}
    <h2 class="admin-title">Drafts</h2>
    ${
      drafts.results.length
        ? html`<ol class="queue">
            ${drafts.results.map(
              (d) =>
                html`<li class="card">
                  <h3><a href="/admin/write?draft=${d.id}">${d.title || "(untitled)"}</a></h3>
                  <p class="fine muted">
                    ${d.lang} · ${d.slug || "no slug"} · ${d.base_sha ? "edit of a published entry · " : ""}saved
                    ${when(d.updated_at)} UTC
                  </p>
                  <form method="post" action="/admin/action" class="actions">
                    <input type="hidden" name="csrf" value="${csrf}" /><input
                      type="hidden"
                      name="id"
                      value="${d.id}"
                    /><button type="submit" name="action" value="delete-draft" class="btn btn--ghost">
                      Delete draft
                    </button>
                  </form>
                </li>`,
            )}
          </ol>`
        : html`<p class="muted">No drafts on the server.</p>`
    }`;
  return adminPage(env, { title: isEdit ? "Edit" : "Write", current: "write", body, script: "write", status });
}

const editingNotice = (slug: string, lang: Lang): Safe => html`<p class="notice" role="status">
  Editing <a href="${pathFor(slug, lang)}">${pathFor(slug, lang)}</a>. Saving replaces this entry and it goes live by
  itself in a few minutes.
</p>`;

/** GET /admin/write: a blank form, a server draft (?draft=), or a published entry (?edit=1&slug=&lang=). */
export async function writeForm(env: Env, identity: Identity, url: URL): Promise<Response> {
  const lang = asLang(url.searchParams.get("lang"));
  const state: FormState = {
    input: empty(lang),
    draftId: "",
    baseSha: "",
    updated: 0,
    query: (url.searchParams.get("q") ?? "").slice(0, 120),
  };
  const draftId = url.searchParams.get("draft");
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (draftId) {
    const d = await env.DB.prepare("SELECT * FROM drafts WHERE id = ?1").bind(draftId).first<DraftRow>();
    if (d) {
      state.input = {
        title: d.title,
        slug: d.slug,
        lang: d.lang,
        description: d.description,
        body: d.body,
        tags: JSON.parse(d.tags) as string[],
        photos: JSON.parse(d.photos) as PhotoRef[],
      };
      state.draftId = d.id;
      state.baseSha = d.base_sha;
      state.updated = d.updated_at;
      const saved = url.searchParams.get("saved")
        ? html`<p class="notice" role="status">Draft saved on the server.</p>`
        : html``;
      state.message = d.base_sha ? html`${saved}${editingNotice(d.slug, d.lang)}` : saved;
    }
  } else if (url.searchParams.get("edit") && SLUG.test(slug)) {
    const file = githubConfigured(env) ? await readFile(env, entryFilePath(lang, slug)).catch(() => null) : null;
    const parsed = file ? parseEntry(file.text) : null;
    if (file && parsed?.title) {
      const { body, photos } = splitPhotos(parsed.body, slug);
      state.input = {
        title: parsed.title,
        slug,
        lang,
        description: parsed.description,
        tags: parsed.tags,
        body,
        photos,
      };
      state.baseSha = file.sha;
      state.message = editingNotice(slug, lang);
    } else {
      state.input.slug = "";
      state.message = file
        ? html`<p class="alert" role="alert">
            ${pathFor(slug, lang)} uses a form of frontmatter this page cannot read. Edit it from the laptop.
          </p>`
        : html`<p class="alert" role="alert">No ${LANG_NAME[lang]} entry with the slug ${slug}.</p>`;
    }
  }
  return writePage(env, identity, state);
}

/** GET /admin/write/reference?slug=&lang= for the script: what the slug means, with the reference text. */
export async function referenceJson(env: Env, url: URL): Promise<Response> {
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const result = await lookup(env, slug, asLang(url.searchParams.get("lang"))).catch((): Lookup => ({
    kind: "invalid",
    message: "Could not check the slug right now.",
  }));
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
}

async function saveDraft(env: Env, input: EntryInput, draftId: string, baseSha: string): Promise<string> {
  const id = /^[A-Za-z0-9_-]{22}$/.test(draftId) ? draftId : randomId();
  await env.DB.prepare(
    `INSERT INTO drafts (id, slug, lang, title, description, body, tags, photos, updated_at, base_sha)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (id) DO UPDATE SET slug = ?2, lang = ?3, title = ?4, description = ?5, body = ?6, tags = ?7, photos = ?8, updated_at = ?9, base_sha = ?10`,
  )
    .bind(
      id,
      input.slug,
      input.lang,
      input.title,
      input.description,
      input.body,
      JSON.stringify(input.tags),
      JSON.stringify(input.photos),
      Date.now(),
      baseSha,
    )
    .run();
  return id;
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);

const BLOB_SHA = /^[0-9a-f]{40}$/;

/** The entry was changed on GitHub (or by another Publish) after it was opened here. */
function conflict(slug: string, lang: Lang): Safe {
  return html`<div class="alert" role="alert">
    <strong>Not saved: ${pathFor(slug, lang)} changed on GitHub since you opened it.</strong> Nothing was overwritten.
    Save a draft to keep your text, then <a href="${editLink(slug, lang)}">open the current version</a> and make your
    changes there.
  </div>`;
}

/** POST /admin/write: Save draft, or Publish (a new entry or an edit). The CSRF token has been checked by the router. */
export async function writeAction(env: Env, identity: Identity, form: URLSearchParams): Promise<Response> {
  const input = readEntry(form);
  const draftId = form.get("draft_id") ?? "";
  const sent = form.get("base_sha") ?? "";
  const baseSha = BLOB_SHA.test(sent) ? sent : "";
  const state: FormState = { input, draftId, baseSha, updated: Date.now() };
  const isEdit = editing(state);

  if (form.get("intent") === "save") {
    if (!input.slug && input.title) input.slug = slugFromTitle(input.title);
    const id = await saveDraft(env, input, draftId, baseSha);
    return new Response(null, { status: 303, headers: { Location: `/admin/write?draft=${id}&saved=1` } });
  }

  const site = await manifest(env);
  const errors = validateEntry(input, site.taken);
  if (Object.keys(errors).length) return writePage(env, identity, { ...state, errors }, 422);
  if (!githubConfigured(env)) return writePage(env, identity, state, 503);

  try {
    const path = entryFilePath(input.lang, input.slug);
    const [same, twin] = await Promise.all([
      readFile(env, path),
      readFile(env, entryFilePath(other(input.lang), input.slug)),
    ]);
    // An edit replaces exactly the version it opened; the slug and language came with it, so a changed slug or
    // language finds no file with that sha and is refused too.
    if (isEdit && same?.sha !== baseSha) {
      log("publish conflict");
      const message = same
        ? conflict(input.slug, input.lang)
        : html`<div class="alert" role="alert">
            <strong>Not saved.</strong> There is no ${LANG_NAME[input.lang]} entry at ${pathFor(input.slug, input.lang)}
            any more. Save a draft to keep your text.
          </div>`;
      return writePage(env, identity, { ...state, message }, 409);
    }
    if (!isEdit && same) {
      const message = html`<div class="alert" role="alert">
        <strong>Not published.</strong> ${pathFor(input.slug, input.lang)} already exists in ${LANG_NAME[input.lang]}.
        <a href="${editLink(input.slug, input.lang)}">Edit it</a>, or choose another slug.
      </div>`;
      return writePage(env, identity, { ...state, message }, 409);
    }
    const missing = [];
    for (const photo of input.photos) if (!(await env.ORIGINALS.head(photo.key))) missing.push(photo.key);
    if (missing.length)
      return writePage(
        env,
        identity,
        { ...state, errors: { photos: `Not uploaded yet: ${missing.join(", ")}. Add them again.` } },
        422,
      );

    const current = same ? parseEntry(same.text) : null;
    const original = twin ? parseEntry(twin.text) : null;
    const from = (current ?? original)?.originalLang;
    const originalLang: Lang = from === "en" || from === "it" ? from : input.lang;
    const now = new Date();
    const date =
      current?.date && /^\d{4}-\d{2}-\d{2}$/.test(current.date) ? current.date : now.toISOString().slice(0, 10);
    const kind = isEdit ? "Edit" : twin ? `${LANG_NAME[input.lang]} version of` : "New entry";
    const pr = await openPullRequest(env, {
      path,
      text: entryMarkdown(input, originalLang, date, current?.comments ?? true),
      sha: same?.sha,
      branch: `publish/${input.lang}-${input.slug}-${stamp(now)}`,
      title: `${kind} ${input.lang}/${input.slug}: ${input.title}`,
      body: [
        "Opened from /admin/write. It merges by itself once the Test check passes (decision 0021).",
        "",
        `- File: \`${path}\` (${isEdit ? "edited" : "new"}), \`originalLang: ${originalLang}\``,
        `- Photos: ${input.photos.length ? input.photos.map((p) => `\`${p.key}\``).join(", ") : "none"}`,
      ].join("\n"),
    });
    let autoMerge: GitHubError | null = null;
    try {
      await enableAutoMerge(env, pr);
    } catch (error) {
      log("auto-merge failed", error);
      autoMerge = error instanceof GitHubError ? error : new GitHubError(500, "auto-merge");
    }
    if (draftId) await env.DB.prepare("DELETE FROM drafts WHERE id = ?1").bind(draftId).run();
    log("entry published");
    const live = pathFor(input.slug, input.lang);
    const cleared = draftId || (isEdit ? `edit-${input.lang}-${input.slug}` : "new");
    const body = autoMerge
      ? html`<h2 class="admin-title">Pull request opened</h2>
          <div class="alert" role="alert" id="published" data-clear="${cleared}">
            <strong>It will not go live by itself:</strong> auto-merge could not be turned on
            ${`(GitHub: ${autoMerge.step}, ${autoMerge.status})`}. Merge the pull request yourself once the checks are
            green.
          </div>
          <p><a class="btn" href="${pr.url}">Open the pull request</a></p>
          <p><a href="/admin/write">Write another entry</a></p>`
      : html`<h2 class="admin-title">${isEdit ? "Saved" : "Published"}</h2>
          <p class="notice" role="status" id="published" data-clear="${cleared}">
            ${isEdit ? "Your changes" : "The entry"} will be live in a few minutes at
            <a href="${live}">${live}</a>.
          </p>
          <p class="fine">
            It goes live once the checks pass. If it is still waiting after 15 minutes, this page shows it as needing
            attention, with the link: <a href="${pr.url}">the pull request</a>.
          </p>
          <p><a href="/admin/write">Write another entry</a></p>`;
    return adminPage(env, { title: isEdit ? "Saved" : "Published", current: "write", body, script: "write" });
  } catch (error) {
    if (isEdit && error instanceof GitHubError && error.status === 409 && error.step === "write file") {
      // Changed between the check above and the write: GitHub refused to overwrite it.
      log("publish conflict");
      return writePage(env, identity, { ...state, message: conflict(input.slug, input.lang) }, 409);
    }
    log("publish failed", error);
    const step = error instanceof GitHubError ? ` (GitHub: ${error.step}, ${error.status})` : "";
    const message = html`<div class="alert" role="alert">
      <strong>Could not open the pull request${step}.</strong> Nothing was lost: save a draft and try again.
    </div>`;
    return writePage(env, identity, { ...state, message }, 502);
  }
}
