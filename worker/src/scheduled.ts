/**
 * Cron jobs (B6, B9). Daily retention, so the privacy notice stays true:
 * IP hashes after 30 days, rejected comments after 30 days, every error report
 * 12 months after it arrived (open or done, as the privacy notice says;
 * owner decision O3, 2026-11-12), finished rate-limit windows.
 * Weekly backup: comments and reports as JSON in the backups bucket, 12 kept.
 */
import { log } from "./log.ts";
import { sweep } from "./ratelimit.ts";

const DAY = 24 * 60 * 60 * 1000;
export const IP_HASH_DAYS = 30;
export const REJECTED_DAYS = 30;
export const REPORT_DAYS = 365;
export const BACKUPS_KEPT = 12;
export const DAILY = "0 3 * * *";
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

  // Keep the newest 12 (names sort by date).
  const listed = await env.BACKUPS.list({ prefix: "backups/" });
  const names = listed.objects.map((o) => o.key).sort();
  const old = names.slice(0, Math.max(0, names.length - BACKUPS_KEPT));
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
    log("retention done");
  } catch (error) {
    log("retention failed", error);
    throw error;
  }
}
