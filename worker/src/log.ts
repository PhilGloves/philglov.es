/**
 * The Worker's only logger. Workers Logs keep what is written here, so it
 * takes fixed event names and never a value from a request: no names, emails,
 * comment text or IP addresses (brief, Backend prompt). An error is reduced to
 * its class name, because a message can quote the data that caused it.
 */
export type LogEvent =
  | "comment stored"
  | "report stored"
  | "notification sent"
  | "notification skipped"
  | "notification failed"
  | "comments unavailable"
  | "rewrite failed"
  | "rate limited"
  | "spam rejected"
  | "access denied"
  | "admin action"
  | "entry published"
  | "publish failed"
  | "publish conflict"
  | "auto-merge failed"
  | "publications unavailable"
  | "photo stored"
  | "photo rejected"
  | "retention done"
  | "retention failed"
  | "backup done"
  | "backup failed"
  | "config missing";

export function log(event: LogEvent, error?: unknown): void {
  const detail = error instanceof Error ? error.name : error === undefined ? undefined : typeof error;
  if (detail === undefined) {
    // eslint-disable-next-line no-console -- the one place the Worker writes to its logs
    console.info(event);
  } else console.error(`${event} (${detail})`);
}
