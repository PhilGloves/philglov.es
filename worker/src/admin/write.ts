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
 *
 * One entry, two languages (decision 0029): the list has one row per entry,
 * and a missing language is a link to write it. That form has the entry's
 * slug, its photos by the same stored keys (alt text and caption empty, the
 * existing ones shown as hints) and the existing version for reference. On an
 * entry's form the language is a choice between its two versions; switching
 * keeps what was typed (the browser copy, or a server draft without JavaScript).
 */
import { localDay } from "../../../src/lib/dates.ts";
import type { Identity } from "../access.ts";
import {
  editable,
  editedEntryMarkdown,
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
import { randomId, sha256Hex } from "../crypto.ts";
import { required } from "../secrets.ts";
import { csrfToken } from "../tokens.ts";
import { clean } from "../validate.ts";
import { adminPage, when } from "./layout.ts";
import { NOTICES } from "./moderation.ts";
import { MAX_PHOTO } from "./upload.ts";

const LANG_NAME: Record<Lang, string> = { en: "English", it: "Italian" };
/** Each language in its own name, as the language choices show it. */
const OWN_NAME: Record<Lang, string> = { en: "English", it: "Italiano" };
const LANGS: readonly Lang[] = ["en", "it"];
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
  photos: string;
  updated_at: number;
  base_sha: string;
  /** 1 for a draft of an entry's other-language version written from the entry (decision 0029). */
  twin: number;
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
  /** After a first Save draft: the browser copy the text came from, which the page's script removes (SO-03). */
  moved?: string;
  /** The form writes the other-language version of a published entry: slug fixed, photos carried over (0029). */
  twin?: boolean;
  /** That entry's existing version, once read (null: not found). */
  other?: Twin | null;
  /** What the form held when it was opened (fingerprint), so a switch keeps a draft only when something was typed. */
  opened?: string;
}

const editing = (state: FormState): boolean => state.baseSha !== "";
/** The form belongs to a published entry (an edit, or its other-language version): the slug is fixed. */
const fixed = (state: FormState): boolean => editing(state) || state.twin === true;

/** The existing version a new language version is written from: on main, or still in its publisher pull request. */
interface Twin {
  lang: Lang;
  text: string;
  /** On main; false while its pull request has not merged (Publish waits for it). */
  live: boolean;
}

/** The branch of a publisher pull request for this file (worker/src/github.ts names it). */
const branchFor = (lang: Lang, slug: string): RegExp => new RegExp(`^publish/${lang}-${slug}-[0-9]{14}$`);

const publications = (env: Env): Promise<OpenPublication[] | null> =>
  githubConfigured(env)
    ? openPublications(env).catch((error: unknown) => {
        log("publications unavailable", error);
        return null;
      })
    : Promise.resolve([]);

/** The other-language version of slug in lang, from main or else from the newest open publisher pull request. */
async function twinOf(env: Env, slug: string, lang: Lang, open?: OpenPublication[] | null): Promise<Twin | null> {
  if (!githubConfigured(env) || !SLUG.test(slug)) return null;
  const o = other(lang);
  const path = entryFilePath(o, slug);
  const live = await readFile(env, path);
  if (live) return { lang: o, text: live.text, live: true };
  const coming = (open === undefined ? await publications(env) : open)?.filter((p) =>
    branchFor(o, slug).test(p.branch),
  );
  const branch = coming?.[coming.length - 1]?.branch;
  const file = branch ? await readFile(env, path, branch) : null;
  return file ? { lang: o, text: file.text, live: false } : null;
}

/** The photos after the existing version's text, by key: their alt text and caption are the hints (0029). */
const photosOf = (twin: Twin | null | undefined, slug: string): PhotoRef[] =>
  twin ? splitPhotos(parseEntry(twin.text)?.body ?? "", slug).photos : [];

/** What a form holds, normalised as a post of it is read, as a short hash. */
async function fingerprint(input: EntryInput): Promise<string> {
  const text = JSON.stringify([
    clean(input.title, false),
    clean(input.description, false),
    clean(input.body, true),
    input.photos.map((p) => [p.key, clean(p.alt, false), clean(p.caption, false)]),
  ]);
  return (await sha256Hex(text)).slice(0, 32);
}

/** The browser copy (autosave key, after "philglov-write:") of an edit of a published entry not yet a draft. */
const editKey = (lang: Lang, slug: string): string => `edit-${lang}-${slug}`;
/** The browser copies a first Save draft can move from: the new-entry form, or an edit of a published entry. */
const MOVED_KEY = /^(?:new|edit-(?:en|it)-[a-z0-9]+(?:-[a-z0-9]+)*)$/;

const empty = (lang: Lang): EntryInput => ({
  title: "",
  slug: "",
  lang,
  description: "",
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
  if (!SLUG.test(slug)) return { kind: "invalid", message: "Lowercase letters, digits and hyphens." };
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

/**
 * One photo with its alt text and caption. A photo carried over from the other-language version shows that
 * version's alt text and caption under the fields, in its own language (`data-hint`, which the page's script keeps
 * when it restores a browser copy).
 */
function photoItem(id: string, photo?: PhotoRef, hint?: PhotoRef, hintLang?: Lang): Safe {
  const said = (field: "alt" | "cap", text: string): Safe | string => {
    if (!hint || !hintLang) return "";
    const what = field === "alt" ? "alt text" : "caption";
    return html`<span id="${id}-${field}-hint" class="hint" data-hint="${field}"
      >${
        text
          ? html`${LANG_NAME[hintLang]} version: <span lang="${hintLang}">${text}</span>`
          : `The ${LANG_NAME[hintLang]} version has no ${what}.`
      }</span
    >`;
  };
  const described = (field: "alt" | "cap"): Safe => new Safe(hint ? ` aria-describedby="${id}-${field}-hint"` : "");
  return html`<li class="card photo-item">
    <input type="hidden" name="photo_key"${photo ? html` value="${photo.key}"` : ""} />
    <p class="fine">${photo?.key.split("/").pop() ?? ""}</p>
    <div class="field">
      <label for="${id}-alt">Alt text: what is in it and why it matters</label
      ><input id="${id}-alt" name="photo_alt" required maxlength="300"${photo ? html` value="${photo.alt}"` : ""}${described("alt")} />
      ${said("alt", hint?.alt ?? "")}
    </div>
    <div class="field">
      <label for="${id}-cap">Caption</label
      ><input id="${id}-cap" name="photo_caption" maxlength="300"${photo ? html` value="${photo.caption}"` : ""}${described("cap")} />
      ${said("cap", hint?.caption ?? "")}
    </div>
    <div class="actions"><button type="button" class="btn btn--ghost" data-remove>Remove</button></div>
  </li>`;
}

/**
 * In a journal entry one Enter is a new line and an empty line a new paragraph (decision 0037). The two lines under
 * the text box say so, and how to write a link, without opening the cheat sheet, which repeats them.
 */
const LINE_HINT = "Enter: new line. Empty line: new paragraph.";
const LINK_HINT = html`Link: <code>[words](https://address)</code>`;

const CHEAT_SHEET = html`<details>
  <summary>Markdown cheat sheet</summary>
  <ul class="fine">
    <li>${LINE_HINT}</li>
    <li>${LINK_HINT}</li>
    <li><code>## Heading</code> for a subheading</li>
    <li><code>_italics_</code> and <code>**bold**</code></li>
    <li><code>- item</code> for a list, <code>1. item</code> for a numbered one</li>
    <li><code>&gt; text</code> for a quotation</li>
    <li><code>text[^1]</code> and, at the end, <code>[^1]: the note</code> for a footnote</li>
    <li>Photos go after the text, in the order you add them.</li>
  </ul>
</details>`;

/** Lowercase, accents dropped: "Città" matches "citta". */
const folded = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** One published entry: its slug, its date (the original's), and the versions that exist. */
export interface EntryRow {
  slug: string;
  date: string;
  versions: Partial<Record<Lang, Entry>>;
}

/** Published entries, one row per entry, whose title in either language contains the search, newest first. */
export function entryRows(entries: readonly Entry[], query: string): EntryRow[] {
  const q = folded(query.trim());
  const rows = new Map<string, EntryRow>();
  for (const e of entries) {
    const row = rows.get(e.slug) ?? { slug: e.slug, date: e.date, versions: {} };
    row.versions[e.lang] = e;
    if (e.lang === e.originalLang) row.date = e.date;
    rows.set(e.slug, row);
  }
  return [...rows.values()]
    .filter((r) => !q || Object.values(r.versions).some((e) => folded(e.title).includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** The entry in this language: its edit form, or the form that writes this version when it does not exist yet. */
const editLink = (slug: string, lang: Lang): string => `/admin/write?edit=1&slug=${slug}&lang=${lang}`;

function publishedList(entries: readonly Entry[], query: string): Safe {
  const found = entryRows(entries, query);
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
              (r) =>
                html`<li class="card" data-entry="${r.slug}">
                  <p class="fine muted">${r.date} · ${r.slug}</p>
                  <ul class="versions">
                    ${LANGS.map((l) => {
                      const e = r.versions[l];
                      return e
                        ? html`<li>${LANG_NAME[l]}: <a href="${editLink(r.slug, l)}" lang="${l}">${e.title}</a></li>`
                        : html`<li><a href="${editLink(r.slug, l)}">Write the ${LANG_NAME[l]} version</a></li>`;
                    })}
                  </ul>
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

/** What a version of an entry is, as its language choice says it. */
type VersionState = "published" | "on its way" | "draft saved" | "not written yet";

/**
 * On an entry's form, the language is a choice between the entry's two versions, each with its state (0029).
 * Choosing the other opens the same entry in that language: on change with JavaScript, with Switch without it
 * (which keeps the typed text as a server draft first). A version still on its way cannot be opened yet.
 */
async function versionChoice(
  env: Env,
  state: FormState,
  twin: Twin | null,
  entries: readonly Entry[],
  open: OpenPublication[] | null,
): Promise<Safe> {
  const { slug, lang } = state.input;
  const o = other(lang);
  const otherLive = state.twin
    ? twin?.live === true
    : entries.some((e) => e.slug === slug && e.lang === o) ||
      (githubConfigured(env) && (await readFile(env, entryFilePath(o, slug)).catch(() => null)) !== null);
  const drafted = (
    await env.DB.prepare("SELECT DISTINCT lang FROM drafts WHERE slug = ?1").bind(slug).all<{ lang: Lang }>()
  ).results.map((r) => r.lang);
  const stateOf = (l: Lang, live: boolean): VersionState => {
    if (live) return "published";
    if ((open ?? []).some((p) => branchFor(l, slug).test(p.branch))) return "on its way";
    return drafted.includes(l) ? "draft saved" : "not written yet";
  };
  const states = { [lang]: stateOf(lang, editing(state)), [o]: stateOf(o, otherLive) } as Record<Lang, VersionState>;
  const option = (l: Lang): Safe => {
    const flag = l === lang ? " selected" : states[l] === "on its way" ? " disabled" : "";
    return html`<option value="${l}"${new Safe(flag)}>${OWN_NAME[l]} · ${states[l]}</option>`;
  };
  return html`<div class="field">
    <label for="w-version">Language</label>
    <div class="switch">
      <select id="w-version" name="to">
        ${LANGS.map(option)}
      </select>
      <button type="submit" name="intent" value="switch" class="btn btn--ghost" formnovalidate data-switch>Switch</button>
    </div>
    <input type="hidden" id="w-lang" name="lang" value="${lang}" />
  </div>`;
}

async function writePage(env: Env, identity: Identity, state: FormState, status = 200): Promise<Response> {
  const csrf = await csrfToken(required(env.FORM_HMAC_KEY), identity.sub);
  const { input, errors } = state;
  const isEdit = editing(state);
  const isFixed = fixed(state);
  const found = input.slug && !isFixed ? await lookup(env, input.slug, input.lang).catch(() => null) : null;
  const [drafts, site, open] = await Promise.all([
    env.DB.prepare("SELECT id, slug, lang, title, updated_at, base_sha, twin FROM drafts ORDER BY updated_at DESC").all<
      Pick<DraftRow, "id" | "slug" | "lang" | "title" | "updated_at" | "base_sha" | "twin">
    >(),
    manifest(env),
    publications(env),
  ]);
  // The autosave key in this browser: per server draft, per entry (an edit or its other-language version), or the
  // one new entry. A language switch keeps the typed text under it.
  const autosave = state.draftId || (isFixed ? editKey(input.lang, input.slug) : "");
  // A new language version is written from the existing one: its reference text, its photos' alt text and captions.
  const twin = state.twin
    ? state.other !== undefined
      ? state.other
      : await twinOf(env, input.slug, input.lang, open).catch(() => null)
    : null;
  const hints = new Map(photosOf(twin, input.slug).map((p) => [p.key, p]));
  const reference = twin
    ? { lang: twin.lang, text: twin.text }
    : found?.reference
      ? { lang: other(input.lang), text: found.reference }
      : null;

  const errorList = errors && Object.values(errors).filter(Boolean);
  const heading = isEdit ? "Edit" : state.twin ? `Write the ${LANG_NAME[input.lang]} version` : "Write";
  const body = html` <h2 class="admin-title">${heading}</h2>
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
      data-moved="${state.moved ?? ""}"
      data-updated="${state.updated}"
      data-max="${MAX_PHOTO}"
    >
      <input type="hidden" name="csrf" value="${csrf}" />
      <input type="hidden" name="draft_id" value="${state.draftId}" />
      <input type="hidden" name="base_sha" value="${state.baseSha}" />
      ${state.twin ? html`<input type="hidden" name="twin" value="1" />` : ""}
      ${isFixed ? html`<input type="hidden" name="opened" value="${state.opened ?? (await fingerprint(input))}" />` : ""}
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
        isFixed
          ? html`<div class="field-row">
              <div class="field">
                <label for="w-slug">Slug</label
                ><input id="w-slug" name="slug" readonly value="${input.slug}" aria-describedby="w-slug-hint" />
                <span id="w-slug-hint" class="hint"
                  >${
                    isEdit
                      ? "Fixed while editing, so links to it never break."
                      : `The same as the ${LANG_NAME[other(input.lang)]} version's, so the two are paired.`
                  }</span
                >
              </div>
              ${await versionChoice(env, state, twin, site.entries, open)}
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
      <div class="field">
        <label for="w-body">Text, in Markdown</label
        ><textarea
          id="w-body"
          name="body"
          class="write-body"
          aria-describedby="w-body-hint w-body-link w-body-err"
          ${invalid(errors, "body")}
        >
${input.body}</textarea
        ><span id="w-body-hint" class="hint">${LINE_HINT}</span
        ><span id="w-body-link" class="hint">${LINK_HINT}</span
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
        ${input.photos.map((p, i) => photoItem(`ph-${i}`, p, hints.get(p.key), twin?.lang))}
      </ol>
      <template id="photo-row">${photoItem("ph-template")}</template>
      <div class="actions">
        <button type="submit" name="intent" value="publish" class="btn">${isEdit ? "Save changes" : "Publish"}</button>
        <button type="submit" name="intent" value="save" class="btn btn--ghost" formnovalidate>Save draft</button>
      </div>
      ${isFixed ? html`<p class="fine"><a href="/admin/write">Write a new entry instead</a></p>` : ""}
    </form>
    <div id="reference">
      ${
        reference
          ? html`<details open>
              <summary>The ${LANG_NAME[reference.lang]} version, for reference</summary>
              <pre class="fine" lang="${reference.lang}">${reference.text}</pre>
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
                    ${d.lang} · ${d.slug || "no slug"} ·
                    ${d.base_sha ? "edit of a published entry · " : d.twin ? "other-language version · " : ""}saved
                    ${when(d.updated_at)} UTC
                  </p>
                  <details>
                    <summary>Delete draft</summary>
                    <form method="post" action="/admin/action" class="form">
                      <input type="hidden" name="csrf" value="${csrf}" /><input
                        type="hidden"
                        name="id"
                        value="${d.id}"
                      />
                      <div class="field">
                        <label
                          ><input type="checkbox" name="confirm" value="yes" required /> Delete this draft. This cannot
                          be undone.</label
                        >
                      </div>
                      <div class="actions">
                        <button type="submit" name="action" value="delete-draft" class="btn btn--danger">Delete</button>
                      </div>
                    </form>
                  </details>
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

/** An entry whose front matter this page cannot keep exactly (SO-01): it is not opened, and nothing is guessed. */
const notEditable = (slug: string, lang: Lang, reason: string): Safe => html`<div class="alert" role="alert">
  <strong>${pathFor(slug, lang)} cannot be edited here:</strong> ${reason}. Edit it on the laptop, so that nothing
  else in it changes.
</div>`;

/** A draft row in the form: an edit keeps the version it started from, a language version its mode. */
function fromDraft(state: FormState, d: DraftRow): void {
  state.input = {
    title: d.title,
    slug: d.slug,
    lang: d.lang,
    description: d.description,
    body: d.body,
    photos: JSON.parse(d.photos) as PhotoRef[],
  };
  state.draftId = d.id;
  state.baseSha = d.base_sha;
  state.twin = !d.base_sha && d.twin === 1;
  state.updated = d.updated_at;
}

/**
 * GET /admin/write: a blank form, a server draft (?draft=), or a published entry in one language
 * (?edit=1&slug=&lang=): its edit form, or, when that language does not exist yet, the form that writes it from the
 * other (0029). Either opens the newest server draft of that version instead when there is one: a language switch
 * without JavaScript keeps the typed text there.
 */
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
  if (url.searchParams.get("done") === "delete-draft")
    state.message = html`<p class="notice" role="status">${NOTICES["delete-draft"]}</p>`;
  if (draftId) {
    const d = await env.DB.prepare("SELECT * FROM drafts WHERE id = ?1").bind(draftId).first<DraftRow>();
    if (d) {
      fromDraft(state, d);
      const moved = url.searchParams.get("moved") ?? "";
      if (MOVED_KEY.test(moved)) state.moved = moved;
      const saved = url.searchParams.get("saved")
        ? html`<p class="notice" role="status">Draft saved on the server.</p>`
        : html``;
      state.message = d.base_sha ? html`${saved}${editingNotice(d.slug, d.lang)}` : saved;
    }
  } else if (url.searchParams.get("edit") && SLUG.test(slug)) {
    const file = githubConfigured(env) ? await readFile(env, entryFilePath(lang, slug)).catch(() => null) : null;
    const twin = file ? null : await twinOf(env, slug, lang).catch(() => null);
    const kept = url.searchParams.get("kept");
    const keptNotice =
      kept === "en" || kept === "it"
        ? html`<p class="notice" role="status">
            What you typed in ${LANG_NAME[kept]} is kept as a draft, and is there again when you switch back.
          </p>`
        : html``;
    const draft =
      file || twin
        ? await env.DB.prepare(
            `SELECT * FROM drafts WHERE slug = ?1 AND lang = ?2 AND ${file ? "base_sha <> ''" : "base_sha = '' AND twin = 1"}
             ORDER BY updated_at DESC LIMIT 1`,
          )
            .bind(slug, lang)
            .first<DraftRow>()
        : null;
    const found = file && !draft ? editable(file.text) : null;
    if (draft) {
      fromDraft(state, draft);
      state.other = twin;
      state.message = html`${keptNotice}
        <p class="notice" role="status">
          Opened your draft of this version, saved ${when(draft.updated_at)} UTC. To start again from
          ${file ? "the published text" : "an empty form"}, delete the draft under Drafts.
        </p>
        ${file ? editingNotice(slug, lang) : ""}`;
    } else if (twin) {
      // The other-language version, written by hand: the same slug, the same photos (by their stored keys, nothing
      // uploaded again), alt text and captions empty, the existing ones shown as hints.
      state.input = {
        ...empty(lang),
        slug,
        photos: photosOf(twin, slug).map((p) => ({ key: p.key, alt: "", caption: "" })),
      };
      state.twin = true;
      state.other = twin;
      state.message = keptNotice;
    } else if (file && found?.ok) {
      const { body, photos } = splitPhotos(found.body, slug);
      state.input = {
        title: found.title,
        slug,
        lang,
        description: found.description,
        body,
        photos,
      };
      state.baseSha = file.sha;
      state.message = html`${keptNotice}${editingNotice(slug, lang)}`;
    } else {
      state.input.slug = "";
      state.message = found
        ? notEditable(slug, lang, found.ok ? "" : found.reason)
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

async function saveDraft(env: Env, input: EntryInput, draftId: string, baseSha: string, twin = false): Promise<string> {
  const id = /^[A-Za-z0-9_-]{22}$/.test(draftId) ? draftId : randomId();
  await env.DB.prepare(
    `INSERT INTO drafts (id, slug, lang, title, description, body, photos, updated_at, base_sha, twin)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (id) DO UPDATE SET slug = ?2, lang = ?3, title = ?4, description = ?5, body = ?6, photos = ?7, updated_at = ?8, base_sha = ?9, twin = ?10`,
  )
    .bind(
      id,
      input.slug,
      input.lang,
      input.title,
      input.description,
      input.body,
      JSON.stringify(input.photos),
      Date.now(),
      baseSha,
      twin ? 1 : 0,
    )
    .run();
  return id;
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);

/**
 * One Publish of an entry file at a time (final review T2-03): two taps arrive together, and each would find no
 * pull request open yet. The second waits here until the first has opened its pull request, then finds it. A row
 * left by a request that died is taken over after two minutes; the GitHub calls take seconds.
 */
const CLAIM_STALE = 2 * 60 * 1000;
const CLAIM_WAIT = 20 * 1000;
export async function claim(env: Env, path: string, wait = CLAIM_WAIT): Promise<boolean> {
  for (const start = Date.now(); ; await new Promise((r) => setTimeout(r, 250))) {
    const now = Date.now();
    const row = await env.DB.prepare(
      `INSERT INTO publishing (path, started_at) VALUES (?1, ?2)
       ON CONFLICT (path) DO UPDATE SET started_at = ?2 WHERE publishing.started_at < ?3 RETURNING path`,
    )
      .bind(path, now, now - CLAIM_STALE)
      .first();
    if (row) return true;
    if (now - start > wait) return false;
  }
}

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
  state.twin = !baseSha && form.get("twin") === "1";
  const opened = form.get("opened");
  if (opened) state.opened = opened;
  const isEdit = editing(state);
  const isFixed = fixed(state);

  if (form.get("intent") === "switch") {
    // Switch without JavaScript (0029): the text typed here is kept as a server draft, which the entry opens again
    // when switching back; nothing typed, no draft. Then the same entry in the language chosen.
    if (!isFixed || !SLUG.test(input.slug))
      return new Response(null, { status: 303, headers: { Location: "/admin/write" } });
    const typed = Boolean(draftId) || (await fingerprint(input)) !== opened;
    if (typed) await saveDraft(env, input, draftId, baseSha, state.twin);
    const to = asLang(form.get("to"));
    const location = `${editLink(input.slug, to)}${typed ? `&kept=${input.lang}` : ""}`;
    return new Response(null, { status: 303, headers: { Location: location } });
  }

  if (form.get("intent") === "save") {
    if (!input.slug && input.title) input.slug = slugFromTitle(input.title);
    const id = await saveDraft(env, input, draftId, baseSha, state.twin);
    // The first save of a new entry or of an entry's form moves the text from that form's browser copy to this
    // draft, which has its own; the draft page then removes the old copy, so it never comes back after Publish (SO-03).
    const moved = id === draftId ? "" : isFixed ? editKey(input.lang, input.slug) : "new";
    const location = `/admin/write?draft=${id}&saved=1${moved ? `&moved=${encodeURIComponent(moved)}` : ""}`;
    return new Response(null, { status: 303, headers: { Location: location } });
  }

  const site = await manifest(env);
  const errors = validateEntry(input, site.taken);
  if (Object.keys(errors).length) return writePage(env, identity, { ...state, errors }, 422);
  if (!githubConfigured(env)) return writePage(env, identity, state, 503);

  const path = entryFilePath(input.lang, input.slug);
  if (!(await claim(env, path))) {
    const message = html`<div class="alert" role="alert">
      <strong>Not published:</strong> another Publish of ${pathFor(input.slug, input.lang)} is still being sent. Your
      text is kept here. In a minute, open <a href="/admin/write">the write page</a> to see it under "On their way".
    </div>`;
    return writePage(env, identity, { ...state, message }, 409);
  }
  try {
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
    // A language version needs the version it is written from on main: until then its pull request would fail the
    // content check (a translation without its original), so it waits, and the text can be kept as a draft.
    if (state.twin && !twin) {
      const message = html`<div class="alert" role="alert">
        <strong>Not published yet.</strong> The ${LANG_NAME[other(input.lang)]} version is not on the site yet: its pull
        request may still be on its way. Save a draft, and publish this once it is live.
      </div>`;
      return writePage(env, identity, { ...state, message }, 409);
    }
    // A new entry whose slug the other language is publishing right now would be a second original: each pull request
    // passes on its own, and main then fails the content check (audit finding 7). It waits, as a language version does.
    const open = await openPublications(env);
    if (!isEdit && !state.twin && !twin && open.some((p) => branchFor(other(input.lang), input.slug).test(p.branch))) {
      const message = html`<div class="alert" role="alert">
        <strong>Not published yet.</strong> The ${LANG_NAME[other(input.lang)]} entry at
        ${pathFor(input.slug, other(input.lang))} is still on its way. Save a draft, and once it is live, publish this
        as its ${LANG_NAME[input.lang]} version: "Write the ${LANG_NAME[input.lang]} version" in the list.
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

    // An edit changes the title, description and text and keeps every other front matter line as it was (SO-01);
    // a file it cannot keep exactly is refused, as when it was opened.
    const edited = isEdit && same ? editedEntryMarkdown(same.text, input) : null;
    if (isEdit && same && edited === null) {
      const found = editable(same.text);
      const message = notEditable(input.slug, input.lang, found.ok ? "" : found.reason);
      return writePage(env, identity, { ...state, message }, 422);
    }
    const current = same ? parseEntry(same.text) : null;
    const original = twin ? parseEntry(twin.text) : null;
    const from = (current ?? original)?.originalLang;
    const originalLang: Lang = from === "en" || from === "it" ? from : input.lang;
    const now = new Date();
    const text = edited ?? entryMarkdown(input, originalLang, localDay(now));
    const live = pathFor(input.slug, input.lang);
    const cleared = draftId || (isFixed ? editKey(input.lang, input.slug) : "new");
    // The other language next: its edit form, or the form that writes it from this one (0029).
    const next = other(input.lang);
    const afterPublish = html`<p>
        <a href="${editLink(input.slug, next)}">${twin ? "Edit" : "Write"} the ${LANG_NAME[next]} version</a>
      </p>
      <p><a href="/admin/write">Write another entry</a></p>`;

    // This file already has a publisher pull request open (T2-03): the same text again is a resend (a double tap,
    // or the "Published" page reloaded), answered with that pull request; another text waits until it has merged.
    // Once it is merged or closed it is not open, and nothing here blocks the next Publish.
    const waiting = open.filter((p) => branchFor(input.lang, input.slug).test(p.branch));
    if (waiting.length) {
      const sent = await Promise.all(waiting.map((p) => readFile(env, path, p.branch).catch(() => null)));
      const resent = waiting.find((_, i) => sent[i]?.text === text);
      if (resent) {
        log("publish repeated");
        if (draftId) await env.DB.prepare("DELETE FROM drafts WHERE id = ?1").bind(draftId).run();
        const body = html`<h2 class="admin-title">Already on its way</h2>
          <p class="notice" role="status" id="published" data-clear="${cleared}">
            It was sent already, so nothing was published twice. ${isEdit ? "Your changes" : "The entry"} will be live
            in a few minutes at <a href="${live}">${live}</a>.
          </p>
          <p class="fine">
            It goes live once the checks pass. If it is still waiting after 15 minutes, the write page shows it as
            needing attention, with the link: <a href="${resent.url}">the pull request</a>.
          </p>
          ${afterPublish}`;
        return adminPage(env, { title: "Already on its way", current: "write", body, script: "write" });
      }
      const newest = waiting[waiting.length - 1];
      const message = html`<div class="alert" role="alert">
        <strong>Not published: ${live} is still on its way</strong>, with the text you published before:
        <a href="${newest?.url ?? ""}">its pull request</a>. Nothing was sent. Once it is live, open the entry under
        "Edit a published entry" and make this change there. Save a draft to keep this text until then. If it shows
        as needing attention (a check failed, so it will not go live), close that pull request on GitHub, then
        publish this again.
      </div>`;
      return writePage(env, identity, { ...state, message }, 409);
    }

    const kind = isEdit ? "Edit" : twin ? `${LANG_NAME[input.lang]} version of` : "New entry";
    const pr = await openPullRequest(env, {
      path,
      text,
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
    const body = autoMerge
      ? html`<h2 class="admin-title">Pull request opened</h2>
          <div class="alert" role="alert" id="published" data-clear="${cleared}">
            <strong>It will not go live by itself:</strong> auto-merge could not be turned on
            ${`(GitHub: ${autoMerge.step}, ${autoMerge.status})`}. Merge the pull request yourself once the checks are
            green.
          </div>
          <p><a class="btn" href="${pr.url}">Open the pull request</a></p>
          ${afterPublish}`
      : html`<h2 class="admin-title">${isEdit ? "Saved" : "Published"}</h2>
          <p class="notice" role="status" id="published" data-clear="${cleared}">
            ${isEdit ? "Your changes" : "The entry"} will be live in a few minutes at
            <a href="${live}">${live}</a>.
          </p>
          <p class="fine">
            It goes live once the checks pass. If it is still waiting after 15 minutes, this page shows it as needing
            attention, with the link: <a href="${pr.url}">the pull request</a>.
          </p>
          ${afterPublish}`;
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
  } finally {
    await env.DB.prepare("DELETE FROM publishing WHERE path = ?1").bind(path).run();
  }
}
