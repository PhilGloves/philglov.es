/**
 * scripts/restore-backup.ts writes the SQL file itself (fourth opinion, A-02). In Windows PowerShell 5.1 a redirect
 * (`node … > restore.sql`) writes UTF-16 with a byte-order mark, and `wrangler d1 execute --file` refuses it. The
 * file must be UTF-8 with no byte-order mark, and the script must never write over the backup it reads.
 * The SQL itself is tested against a real database in tests/worker/ops.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { restoreSql, type Backup } from "../../scripts/lib/backup-restore.ts";

const script = fileURLToPath(new URL("../../scripts/restore-backup.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

const backup: Backup = {
  exported_at: "2026-11-16T04:00:00.000Z",
  schema: "worker/migrations",
  comments: [
    {
      id: 1,
      slug: "alps",
      lang: "it",
      name: "Niccolò",
      email: "n@example.test",
      body: "Che caffè ☕",
      status: "approved",
      created_at: 1,
      reply_body: null,
    },
  ],
  reports: [],
};

function inTempDir(body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "restore-backup-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("writes the SQL to the named file, UTF-8 without a byte-order mark, and no SQL to standard output", () => {
  inTempDir((dir) => {
    writeFileSync(join(dir, "backup.json"), JSON.stringify(backup));
    const result = run(join(dir, "backup.json"), join(dir, "restore.sql"));
    assert.equal(result.status, 0, result.stderr);
    const bytes = readFileSync(join(dir, "restore.sql"));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 byte-order mark");
    assert.notDeepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe], "UTF-16 byte-order mark");
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), restoreSql(backup));
    assert.doesNotMatch(result.stdout, /INSERT/);
    assert.match(result.stdout, /1 comments, 0 reports/);
  });
});

test("reads a backup that was saved with a byte-order mark", () => {
  inTempDir((dir) => {
    writeFileSync(join(dir, "backup.json"), `﻿${JSON.stringify(backup)}`);
    const result = run(join(dir, "backup.json"), join(dir, "restore.sql"));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, "restore.sql"), "utf8"), restoreSql(backup));
  });
});

test("needs both paths, never writes over the backup, and writes nothing for a file that is not a backup", () => {
  inTempDir((dir) => {
    const input = join(dir, "backup.json");
    writeFileSync(input, JSON.stringify(backup));
    assert.equal(run(input).status, 2);
    assert.equal(run(input, input).status, 2);
    assert.equal(readFileSync(input, "utf8"), JSON.stringify(backup), "the backup is untouched");

    writeFileSync(join(dir, "other.json"), JSON.stringify({ ...backup, schema: "other" }));
    const refused = run(join(dir, "other.json"), join(dir, "restore.sql"));
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /not a backup/);
    assert.equal(existsSync(join(dir, "restore.sql")), false);
  });
});
