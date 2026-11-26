/**
 * Cron jobs (B6, B9). Daily retention, so the privacy notice stays true:
 * IP hashes after 30 days, rejected comments after 30 days, every error report
 * 12 months after it arrived (open or done, as the privacy notice says;
 * owner decision O3, 2026-11-12), finished rate-limit windows, and the comments of an entry no longer on the site.
 * Weekly backup: comments and reports as JSON in the backups bucket, each deleted once 12 weeks old.
 */
import { log } from "./log.ts";
import { manifest } from "./manifest.ts";
import { sweep } from "./ratelimit.ts";

const DAY = 24 * 60 * 60 * 1000;
export const IP_HASH_DAYS = 30;
export const REJECTED_DAYS = 30;
export const REPORT_DAYS = 365;
export const BACKUP_WEEKS = 12;
export const WEEKLY = "0 4 * * 1";

export async function retention(db: D1Database, now = Date.now()): Promise<void> {
  const ipCutoff = now - IP_HASH_DAYS * DAY;
  await db.batch([
    db.prepare("UPDATE comments SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?1").bind(ipCutoff),
    db.prepare("UPDATE reports SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?1").bind(ipCutoff),
    db.prepare("DELETE FROM comments WHERE status = 'rejected' AND created_at < ?1").bind(now - REJECTED_DAYS * DAY),
    db.prepare("DELETE FROM reports WHERE created_at < ?1").bind(now - REPORT_DAYS * DAY),
  ]);
  await sweep(db, now);
}

/**
 * The comments of an entry that is no longer on the site go with it, as the privacy notice says ("until ... I delete
 * the entry"; audit, decision 0040). `slugs` are the entries the deployed site has; none at all means the list could
 * not be read (or the site has no entry yet), and then nothing is deleted.
 */
export async function orphanComments(db: D1Database, slugs: readonly string[]): Promise<void> {
  if (!slugs.length) return;
  await db
    .prepare("DELETE FROM comments WHERE slug NOT IN (SELECT value FROM json_each(?1))")
    .bind(JSON.stringify([...new Set(slugs)]))
    .run();
}

/** backups/YYYY-MM-DD.json: every comment and report, without IP hashes (not needed to restore). */
export async function backup(env: Env, now = new Date()): Promise<string> {
  const [comments, reports] = await Promise.all([
    env.DB.prepare(
      "SELECT id, slug, lang, name, email, body, status, created_at, reply_body FROM comments ORDER BY id",
    ).all(),
    env.DB.prepare("SELECT id, page_url, message, email, created_at, status, done_at FROM reports ORDER BY id").all(),
  ]);
  const key = `backups/${now.toISOString().slice(0, 10)}.json`;
  const body = JSON.stringify({
    exported_at: now.toISOString(),
    schema: "worker/migrations",
    comments: comments.results,
    reports: reports.results,
  });
  await env.BACKUPS.put(key, body, { httpMetadata: { contentType: "application/json" } });

  // Delete each backup once it is 12 weeks old, by the date in its name, as the privacy notice says: by age, not
  // by count, so weeks without a backup never keep an older one (audit finding 6).
  const cutoff = new Date(now.getTime() - BACKUP_WEEKS * 7 * DAY).toISOString().slice(0, 10);
  const listed = await env.BACKUPS.list({ prefix: "backups/" });
  const old = listed.objects
    .map((o) => o.key)
    .filter((name) => (/^backups\/(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1] ?? "9999") <= cutoff);
  if (old.length) await env.BACKUPS.delete(old);
  return key;
}

export async function runScheduled(controller: ScheduledController, env: Env): Promise<void> {
  if (controller.cron === WEEKLY) {
    try {
      await backup(env, new Date(controller.scheduledTime));
      log("backup done");
    } catch (error) {
      log("backup failed", error);
      throw error;
    }
    return;
  }
  try {
    await retention(env.DB, controller.scheduledTime);
    await orphanComments(
      env.DB,
      (await manifest(env)).entries.map((e) => e.slug),
    );
    log("retention done");
  } catch (error) {
    log("retention failed", error);
    throw error;
  }
}
