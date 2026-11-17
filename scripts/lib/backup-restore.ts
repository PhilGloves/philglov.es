/**
 * A weekly backup (backups/YYYY-MM-DD.json in the backups bucket, worker/src/scheduled.ts) turned back into SQL for
 * `wrangler d1 execute DB --env <env> --remote --file restore.sql` (security audit, check 9, decision 0030; the
 * steps are in README.md, "Restoring comments and reports"). Pure, so tests/worker/ops.test.ts restores a real
 * backup into an empty database and compares every row.
 *
 * - Every row is checked against the schema first: a file that is not a backup of this schema is refused whole.
 * - One statement per line, every value a SQL literal (text quoted, line breaks as char(10)/char(13)), so a comment
 *   cannot end a statement or start another, and any SQL runner reads the file the same way.
 * - INSERT … ON CONFLICT (id) DO NOTHING: a restore fills in what is missing and never overwrites a row that is there.
 */

export interface BackupComment {
  id: number;
  slug: string;
  lang: string;
  name: string;
  email: string;
  body: string;
  status: string;
  created_at: number;
  reply_body: string | null;
}

export interface BackupReport {
  id: number;
  page_url: string;
  message: string;
  email: string | null;
  created_at: number;
  status: string;
  done_at: number | null;
}

export interface Backup {
  exported_at: string;
  schema: string;
  comments: BackupComment[];
  reports: BackupReport[];
}

type Kind = "id" | "int" | "text" | "text?" | "int?" | { oneOf: readonly string[] };

const COMMENT: Record<keyof BackupComment, Kind> = {
  id: "id",
  slug: "text",
  lang: { oneOf: ["en", "it"] },
  name: "text",
  email: "text",
  body: "text",
  status: { oneOf: ["pending", "approved", "rejected"] },
  created_at: "int",
  reply_body: "text?",
};

const REPORT: Record<keyof BackupReport, Kind> = {
  id: "id",
  page_url: "text",
  message: "text",
  email: "text?",
  created_at: "int",
  status: { oneOf: ["open", "done"] },
  done_at: "int?",
};

/** A SQL literal of a checked value: NULL, an integer, or quoted text with line breaks spelled out. */
function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  const text = String(value).replace(/'/g, "''");
  return `'${text.replace(/\r/g, "' || char(13) || '").replace(/\n/g, "' || char(10) || '")}'`;
}

function check(row: unknown, shape: Record<string, Kind>, where: string): Record<string, unknown> {
  if (typeof row !== "object" || row === null || Array.isArray(row)) throw new Error(`${where}: not a row`);
  const record = row as Record<string, unknown>;
  const extra = Object.keys(record).filter((k) => !(k in shape));
  if (extra.length) throw new Error(`${where}: unknown column ${extra.join(", ")}`);
  for (const [column, kind] of Object.entries(shape)) {
    const v = record[column];
    const ok =
      kind === "id"
        ? Number.isSafeInteger(v) && (v as number) > 0
        : kind === "int"
          ? Number.isSafeInteger(v)
          : kind === "int?"
            ? v === null || Number.isSafeInteger(v)
            : kind === "text"
              ? typeof v === "string"
              : kind === "text?"
                ? v === null || typeof v === "string"
                : typeof v === "string" && kind.oneOf.includes(v);
    if (!ok) throw new Error(`${where}: ${column} is ${JSON.stringify(v)}`);
  }
  return record;
}

function inserts(table: string, rows: unknown[], shape: Record<string, Kind>): string[] {
  const columns = Object.keys(shape);
  return rows.map((row, i) => {
    const r = check(row, shape, `${table} row ${i + 1}`);
    const values = columns.map((c) => literal(r[c])).join(", ");
    return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values}) ON CONFLICT (id) DO NOTHING;`;
  });
}

/** The SQL that puts a backup's rows back, or an error naming the first thing that is not as the schema says. */
export function restoreSql(backup: Backup): string {
  if (backup?.schema !== "worker/migrations") throw new Error("not a backup of this site's database");
  if (!Array.isArray(backup.comments) || !Array.isArray(backup.reports)) throw new Error("no comments or reports list");
  const exported = typeof backup.exported_at === "string" ? backup.exported_at.replace(/[^0-9TZ:.-]/g, "") : "?";
  return [
    `-- Restore of the backup exported ${exported}: ${backup.comments.length} comments, ${backup.reports.length} reports.`,
    "-- Rows already in the database are kept as they are (ON CONFLICT DO NOTHING).",
    ...inserts("comments", backup.comments, COMMENT),
    ...inserts("reports", backup.reports, REPORT),
    "",
  ].join("\n");
}
