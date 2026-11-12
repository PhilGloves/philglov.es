/**
 * 5 submissions per 10 minutes per ip_hash, across both forms (B2). One D1
 * statement: insert the first hit, or count the next, or start a new window
 * when the old one is over. SQLite evaluates every SET expression against the
 * old row, so `count` and `window_start` see the same window.
 */
export const RATE_LIMIT = 5;
export const RATE_WINDOW = 10 * 60 * 1000;

const HIT = `
INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
ON CONFLICT (key) DO UPDATE SET
  count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
  window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
RETURNING count`;

/** Counts this submission; true while the address is within the limit. */
export async function allow(db: D1Database, key: string, now = Date.now()): Promise<boolean> {
  const row = await db.prepare(HIT).bind(key, now, RATE_WINDOW).first<{ count: number }>();
  return (row?.count ?? 1) <= RATE_LIMIT;
}

/** Forget windows that are over (retention job): the table holds address hashes. */
export async function sweep(db: D1Database, now = Date.now()): Promise<void> {
  await db
    .prepare("DELETE FROM rate_limits WHERE window_start < ?1")
    .bind(now - RATE_WINDOW)
    .run();
}
