import { env, SELF } from "cloudflare:test";
import type { Manifest } from "../../worker/src/manifest.ts";
import { formToken } from "../../worker/src/tokens.ts";

export const ORIGIN = "https://example.com";

export async function resetDb(): Promise<void> {
  await env.DB.batch(["comments", "reports", "rate_limits", "drafts"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
}

export async function siteManifest(): Promise<Manifest> {
  const res = await env.ASSETS.fetch("https://assets.local/_assets/entries.json");
  return res.json();
}

/** An entry that exists in both languages, from the build (the seed content changes; tests do not hard-code it). */
export async function twinEntry(): Promise<{ slug: string; en: string; it: string }> {
  const m = await siteManifest();
  const slug = m.entries.find((e) => e.comments && m.entries.some((o) => o.slug === e.slug && o.lang !== e.lang))?.slug;
  if (!slug) throw new Error("the build has no entry in both languages");
  return { slug, en: `/${slug}`, it: `/it/${slug}` };
}

/** A token as the page would have written it `ageMs` ago. */
export const agedToken = (ageMs = 5_000): Promise<string> => formToken(env.FORM_HMAC_KEY, Date.now() - ageMs);

export async function post(
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

export async function commentFields(slug: string, lang: "en" | "it", over: Record<string, string> = {}) {
  return {
    name: "Marta",
    email: "marta@example.com",
    comment: "The bit about hills being a negotiation is exactly how it felt to me too.",
    slug,
    lang,
    website: "",
    token: await agedToken(),
    ...over,
  };
}

export const adminFetch = (path: string, init: RequestInit = {}, jwt = env.TEST_ACCESS_JWT): Promise<Response> =>
  SELF.fetch(`${ORIGIN}${path}`, {
    redirect: "manual",
    ...init,
    headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: ORIGIN, ...(init.headers as Record<string, string>) },
  });

export async function csrf(): Promise<string> {
  const page = await (await adminFetch("/admin")).text();
  const token = /name="csrf" value="([^"]+)"/.exec(page)?.[1];
  if (!token) throw new Error("no CSRF token on /admin");
  return token;
}

export const adminPost = (path: string, fields: Record<string, string>): Promise<Response> =>
  adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

export async function insertComment(row: {
  slug: string;
  lang?: "en" | "it";
  name?: string;
  email?: string;
  body?: string;
  status?: string;
  created_at?: number;
  reply_body?: string | null;
  ip_hash?: string | null;
}): Promise<number> {
  const r = await env.DB.prepare(
    "INSERT INTO comments (slug, lang, name, email, body, status, created_at, ip_hash, reply_body) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) RETURNING id",
  )
    .bind(
      row.slug,
      row.lang ?? "en",
      row.name ?? "Luca",
      row.email ?? "luca@example.com",
      row.body ?? "Bellissimo.",
      row.status ?? "approved",
      row.created_at ?? Date.now(),
      row.ip_hash ?? "hash",
      row.reply_body ?? null,
    )
    .first<{ id: number }>();
  return r?.id ?? 0;
}
