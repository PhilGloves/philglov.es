/**
 * Approved comments for one entry (B3). One thread per slug, shown on both
 * language versions. The list is cached per slug for 60 seconds in the Cache
 * API and never purged: a Cache API delete clears only one data centre, so an
 * approval simply shows up within a minute everywhere. Only this data is
 * cached, never a page (pages carry a fresh form token).
 */
import type { Lang } from "./manifest.ts";

export interface PublicComment {
  name: string;
  body: string;
  lang: Lang;
  created_at: number;
  reply_body: string | null;
}

export const COMMENTS_TTL = 60;
const cacheKey = (slug: string): string => `https://comments.cache.internal/v1/${encodeURIComponent(slug)}`;

export async function approvedComments(env: Env, ctx: ExecutionContext, slug: string): Promise<PublicComment[]> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = cacheKey(slug);
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) return hit.json();

  const { results } = await env.DB.prepare(
    "SELECT name, body, lang, created_at, reply_body FROM comments WHERE slug = ?1 AND status = 'approved' ORDER BY created_at, id",
  )
    .bind(slug)
    .all<PublicComment>();
  const response = new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${COMMENTS_TTL}` },
  });
  ctx.waitUntil(cache.put(key, response).catch(() => undefined));
  return results;
}

/** "001", "002" … as in the prototype. */
export const commentNumber = (index: number): string => String(index + 1).padStart(3, "0");

/** The date a comment shows: YYYY-MM-DD, in UTC. */
export const commentDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
