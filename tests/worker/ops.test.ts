/** Notifications (B5), retention and backups (B6, B9), and the headers on every kind of response (B7). */
import { createScheduledController, env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { notificationMime, notify } from "../../worker/src/notify.ts";
import { backup, orphanComments, retention } from "../../worker/src/scheduled.ts";
import worker from "../../worker/src/index.ts";
import { agedToken, commentFields, insertComment, ORIGIN, post, resetDb, twinEntry } from "./helpers.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12);

beforeEach(resetDb);

describe("notifications", () => {
  test("off: only 'notification skipped' is logged, nothing is sent", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await notify(env, "comment", "Some entry");
    expect(info).toHaveBeenCalledWith("notification skipped");
    info.mockRestore();
  });

  test("the email holds the page title and the /admin link, nothing about the visitor", () => {
    const mime = notificationMime(
      "comment",
      "Tre settimane a Lisbona",
      "notify@philglov.es",
      "me@example.test",
      new Date(NOW),
      "id1",
    );
    expect(mime).toContain("Subject: New comment: Tre settimane a Lisbona");
    expect(mime).toContain("Message-ID: <id1@philglov.es>");
    const body = atob((mime.split("\r\n\r\n")[1] ?? "").replace(/\r\n/g, ""));
    expect(body).toContain("https://philglov.es/admin");
    expect(body).not.toMatch(/approve|action|@/i);
  });

  test("non-ASCII subjects are encoded", () => {
    const mime = notificationMime("report", "Città", "a@philglov.es", "b@example.test", new Date(NOW), "x");
    expect(mime).toMatch(/^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/m);
  });

  test("a comment's name, email and text never reach the logs", async () => {
    const lines: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" "))),
    );
    const { slug } = await twinEntry();
    await post(
      "/api/comment",
      await commentFields(slug, "en", { name: "Secret Name", email: "secret@example.com", comment: "Secret text" }),
      { "CF-Connecting-IP": "192.0.2.55" },
    );
    await post(
      "/api/comment",
      await commentFields(slug, "en", { name: "Secret Name", email: "bad", comment: "Secret text" }),
    );
    spies.forEach((s) => s.mockRestore());
    expect(lines.join("\n")).not.toMatch(/Secret|secret@|192\.0\.2\.55/);
  });
});

describe("retention", () => {
  test("IP hashes and rejected comments go after 30 days, every report 12 months after it arrived", async () => {
    const { slug } = await twinEntry();
    const old = NOW - 31 * DAY;
    const recent = NOW - 29 * DAY;
    const keptOld = await insertComment({ slug, status: "approved", created_at: old, ip_hash: "h1" });
    const keptRecent = await insertComment({ slug, status: "approved", created_at: recent, ip_hash: "h2" });
    await insertComment({ slug, status: "rejected", created_at: old });
    const rejectedRecent = await insertComment({ slug, status: "rejected", created_at: recent });
    const pendingOld = await insertComment({ slug, status: "pending", created_at: old });
    const insert = env.DB.prepare(
      "INSERT INTO reports (page_url, message, created_at, ip_hash, status, done_at) VALUES ('/', 'x', ?1, 'h', ?2, ?3)",
    );
    // Deleted 12 months after arrival, whether marked done or still open; kept until then, even if done long ago.
    await env.DB.batch([
      insert.bind(NOW - 366 * DAY, "open", null),
      insert.bind(NOW - 366 * DAY, "done", NOW - 1 * DAY),
      insert.bind(NOW - 364 * DAY, "done", NOW - 360 * DAY),
      insert.bind(NOW - 364 * DAY, "open", null),
      insert.bind(NOW - 10 * DAY, "open", null),
    ]);

    await retention(env.DB, NOW);

    const comments = await env.DB.prepare("SELECT id, ip_hash FROM comments ORDER BY id").all<{
      id: number;
      ip_hash: string | null;
    }>();
    expect(comments.results).toEqual([
      { id: keptOld, ip_hash: null },
      { id: keptRecent, ip_hash: "h2" },
      { id: rejectedRecent, ip_hash: "hash" },
      { id: pendingOld, ip_hash: null },
    ]);
    const reports = await env.DB.prepare("SELECT created_at, status, ip_hash FROM reports ORDER BY id").all();
    expect(reports.results).toEqual([
      { created_at: NOW - 364 * DAY, status: "done", ip_hash: null },
      { created_at: NOW - 364 * DAY, status: "open", ip_hash: null },
      { created_at: NOW - 10 * DAY, status: "open", ip_hash: "h" },
    ]);
  });
});

describe("comments of an entry no longer on the site (0040)", () => {
  test("go with the entry; a list of no entries (unread, or none yet) deletes nothing", async () => {
    const { slug } = await twinEntry();
    const kept = await insertComment({ slug, status: "approved" });
    await insertComment({ slug: "a-deleted-entry", status: "approved" });
    await insertComment({ slug: "a-deleted-entry", status: "pending" });

    await orphanComments(env.DB, []);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first<{ n: number }>())?.n).toBe(3);

    await orphanComments(env.DB, [slug, slug, "another-entry"]);
    const left = await env.DB.prepare("SELECT id FROM comments").all<{ id: number }>();
    expect(left.results).toEqual([{ id: kept }]);
  });
});

describe("backups", () => {
  // Audit finding 6: deleted by age, as the privacy notice says ("backups after 12 weeks"), not the newest 12 kept:
  // weeks without a backup (8 and 9 here) must not keep one older than 12 weeks.
  test("weekly JSON export of comments and reports, without IP hashes, each deleted at 12 weeks old", async () => {
    const { slug } = await twinEntry();
    await insertComment({ slug, name: "Marta", ip_hash: "secret-hash" });
    const weeksAgo = (n: number) => `backups/${new Date(NOW - n * 7 * DAY).toISOString().slice(0, 10)}.json`;
    for (const n of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 16]) await env.BACKUPS.put(weeksAgo(n), "{}");
    const key = await backup(env, new Date(NOW));
    expect(key).toBe("backups/2026-11-12.json");
    const data = await (await env.BACKUPS.get(key))?.json<{ comments: Record<string, unknown>[] }>();
    expect(data?.comments[0]).toMatchObject({ name: "Marta", email: "luca@example.com" });
    expect(JSON.stringify(data)).not.toContain("secret-hash");
    const listed = await env.BACKUPS.list({ prefix: "backups/" });
    expect(listed.objects.map((o) => o.key).sort()).toEqual(
      [key, ...[1, 2, 3, 4, 5, 6, 7, 10, 11].map(weeksAgo)].sort(),
    );
  });

  // Security audit, check 9 (decision 0030): a backup is only as good as its restore. Last week's export goes back
  // into an empty database and every comment and report comes back as it was, text the visitor chose included.
  test("a backup restores into an empty database, row for row, and never over rows already there", async () => {
    const { restoreSql } = await import("../../scripts/lib/backup-restore.ts");
    const { slug } = await twinEntry();
    const tricky = "It's \"quoted\";\nline two\r\n'); DROP TABLE comments; --\n\u{1F989} caffè";
    await insertComment({ slug, name: "O'Brien", body: tricky, status: "approved", reply_body: "Grazie\n\nPhil" });
    await insertComment({ slug, lang: "it", status: "pending", reply_body: null });
    await env.DB.prepare(
      "INSERT INTO reports (page_url, message, email, created_at, status, done_at) VALUES ('/it/x', ?1, NULL, 5, 'done', 6)",
    )
      .bind(tricky)
      .run();
    const columns = "id, slug, lang, name, email, body, status, created_at, reply_body";
    const before = (await env.DB.prepare(`SELECT ${columns} FROM comments ORDER BY id`).all()).results;
    const reportsBefore = (
      await env.DB.prepare("SELECT id, page_url, message, email, created_at, status, done_at FROM reports").all()
    ).results;
    const key = await backup(env, new Date(NOW));
    const exported = await (await env.BACKUPS.get(key))?.json<Parameters<typeof restoreSql>[0]>();
    if (!exported) throw new Error("no backup");

    await resetDb();
    const sql = restoreSql(exported);
    // One statement per line, so `wrangler d1 execute --file` and D1's exec() read it the same way.
    for (const line of sql.split("\n").filter((l) => l.trim() && !l.startsWith("--"))) await env.DB.prepare(line).run();
    expect((await env.DB.prepare(`SELECT ${columns} FROM comments ORDER BY id`).all()).results).toEqual(before);
    expect(
      (await env.DB.prepare("SELECT id, page_url, message, email, created_at, status, done_at FROM reports").all())
        .results,
    ).toEqual(reportsBefore);

    // Run again over the restored rows, after one was changed: nothing is overwritten.
    await env.DB.prepare("UPDATE comments SET body = 'changed since' WHERE name = 'O''Brien'").run();
    for (const line of sql.split("\n").filter((l) => l.trim() && !l.startsWith("--"))) await env.DB.prepare(line).run();
    expect(await env.DB.prepare("SELECT body FROM comments WHERE name = 'O''Brien'").first("body")).toBe(
      "changed since",
    );
  });

  test("a restore refuses a file that is not a backup of this schema", async () => {
    const { restoreSql } = await import("../../scripts/lib/backup-restore.ts");
    const ok = { exported_at: "2026-11-12T00:00:00.000Z", schema: "worker/migrations", comments: [], reports: [] };
    expect(restoreSql(ok)).toMatch(/0 comments, 0 reports/);
    const comment = {
      id: 1,
      slug: "x",
      lang: "en",
      name: "n",
      email: "e@x.it",
      body: "b",
      status: "approved",
      created_at: 1,
      reply_body: null,
    };
    for (const bad of [
      { ...ok, schema: "other" },
      { ...ok, comments: [{ ...comment, lang: "de" }] },
      { ...ok, comments: [{ ...comment, status: "spam" }] },
      { ...ok, comments: [{ ...comment, id: "1; DROP TABLE comments" }] },
      { ...ok, comments: [{ ...comment, created_at: "yesterday" }] },
      { ...ok, comments: [{ ...comment, extra: 1 }] },
    ])
      expect(() => restoreSql(bad as never)).toThrow();
  });

  test("the crons in wrangler.jsonc reach the right job", async () => {
    const { slug } = await twinEntry();
    await insertComment({ slug, status: "rejected", created_at: Date.now() - 40 * DAY });
    await worker.scheduled(createScheduledController({ cron: "0 3 * * *", scheduledTime: Date.now() }), env);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(0);
    await worker.scheduled(createScheduledController({ cron: "0 4 * * 1", scheduledTime: NOW }), env);
    expect(await env.BACKUPS.head("backups/2026-11-12.json")).not.toBeNull();
  });
});

describe("headers on every kind of response", () => {
  const security = (res: Response) => {
    expect(res.headers.get("Content-Security-Policy")).toMatch(/^default-src '(self|none)'/);
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("tdm-reservation")).toBe("1");
    expect(res.headers.get("X-Robots-Tag")).toMatch(/noindex/);
  };
  test("page, 404, redirect, 422, 405 and admin 403", async () => {
    const { slug, en } = await twinEntry();
    security(await SELF.fetch(`${ORIGIN}${en}`));
    security(await SELF.fetch(`${ORIGIN}/no-such-page`));
    security(await post("/api/comment", await commentFields(slug, "en")));
    security(await post("/api/comment", await commentFields(slug, "en", { comment: "" })));
    security(await SELF.fetch(`${ORIGIN}/api/comment`));
    security(await SELF.fetch(`${ORIGIN}/admin`));
    expect((await SELF.fetch(`${ORIGIN}${en}`)).headers.get("Content-Security-Policy")).toMatch(
      /script-src 'self' 'sha256-/,
    );
    expect(await agedToken()).toMatch(/^v1\./);
  });
});
