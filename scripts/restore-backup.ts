/**
 * node scripts/restore-backup.ts <backup.json> > restore.sql
 *
 * Turns a weekly backup of comments and reports (backups/YYYY-MM-DD.json in the backups bucket) into SQL for
 * `wrangler d1 execute`. The steps, and what a restore cannot know, are in README.md ("Restoring comments and
 * reports"); the SQL itself comes from scripts/lib/backup-restore.ts (decision 0030).
 */
import { readFileSync } from "node:fs";
import { restoreSql } from "./lib/backup-restore.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/restore-backup.ts <backup.json> > restore.sql");
  process.exit(2);
}
try {
  process.stdout.write(restoreSql(JSON.parse(readFileSync(file, "utf8"))));
} catch (error) {
  console.error(`restore-backup: ${(error as Error).message}`);
  process.exit(1);
}
