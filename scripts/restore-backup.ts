/**
 * node scripts/restore-backup.ts <backup.json> <restore.sql>
 *
 * Turns a weekly backup of comments and reports (backups/YYYY-MM-DD.json in the backups bucket) into SQL for
 * `wrangler d1 execute`, and writes it to <restore.sql> as UTF-8 without a byte-order mark. The script writes the
 * file itself, so no shell redirect is needed: in Windows PowerShell 5.1 `> restore.sql` writes UTF-16, which D1
 * refuses (fourth opinion, A-02). The steps, and what a restore cannot know, are in README.md ("Restoring comments
 * and reports"); the SQL itself comes from scripts/lib/backup-restore.ts (decision 0030).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { restoreSql, type Backup } from "./lib/backup-restore.ts";

const usage = "usage: node scripts/restore-backup.ts <backup.json> <restore.sql>";
const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output || rest.length) {
  console.error(usage);
  process.exit(2);
}
const same = (a: string, b: string) =>
  process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
if (same(input, output)) {
  console.error("restore-backup: the SQL file would replace the backup; give it another name, such as restore.sql");
  process.exit(2);
}
try {
  // A file saved by a Windows editor may start with a byte-order mark, which JSON.parse does not accept.
  const backup = JSON.parse(readFileSync(input, "utf8").replace(/^﻿/, "")) as Backup;
  const sql = restoreSql(backup);
  writeFileSync(output, sql, "utf8");
  console.log(
    `restore-backup: wrote ${output} (${backup.comments.length} comments, ${backup.reports.length} reports). ` +
      "Delete it, and the backup, once the restore is done: both hold visitors' names and email addresses.",
  );
} catch (error) {
  console.error(`restore-backup: ${(error as Error).message}`);
  process.exit(1);
}
