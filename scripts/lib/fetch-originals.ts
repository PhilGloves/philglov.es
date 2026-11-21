/**
 * The download behind scripts/fetch-originals.ts: every original the content uses, from the bucket the builds read,
 * skipping what is already local.
 *
 * With credentials, a photo that cannot be fetched stops the build (final review, T1B-01). It used to be a warning:
 * an original that no entry check covers (the portrait on About, a series photo) then shipped as a grey placeholder
 * frame, and the Person data lost its image, with every check green. A wrong bucket or key after the launch copy, or
 * the portrait uploaded to the wrong bucket, would have reached production that way. Without credentials (a fork, a
 * laptop without R2 keys) the script does nothing and the pages draw placeholders, as before.
 */
import { getObject, type R2Config } from "./r2.ts";

export interface FetchReport {
  downloaded: string[];
  cached: string[];
  failed: string[];
}

export async function fetchOriginals(
  cfg: R2Config,
  keys: readonly string[],
  have: (key: string) => boolean,
  save: (key: string, bytes: Uint8Array) => void,
  force = false,
): Promise<FetchReport> {
  const report: FetchReport = { downloaded: [], cached: [], failed: [] };
  for (const key of keys) {
    if (!force && have(key)) {
      report.cached.push(key);
      continue;
    }
    try {
      save(key, await getObject(cfg, key));
      report.downloaded.push(key);
    } catch (err) {
      report.failed.push(`${key}: ${(err as Error).message}`);
    }
  }
  return report;
}

/** What the script prints, and its exit code: 1 when any original could not be fetched. */
export function fetchSummary(report: FetchReport, bucket: string): { lines: string[]; code: 0 | 1 } {
  const needed = report.downloaded.length + report.cached.length + report.failed.length;
  const lines = [
    `fetch-originals: ${needed} needed, ${report.downloaded.length} downloaded, ${report.cached.length} cached`,
  ];
  if (report.failed.length === 0) return { lines, code: 0 };
  lines.push(
    `fetch-originals: could not fetch ${report.failed.length} from ${bucket}:`,
    ...report.failed.map((f) => `  ${f}`),
    "Without them the pages would show grey placeholders. Check that each photo is in that bucket (the R2 dashboard)",
    "and that the R2 secrets and the R2_ORIGINALS_BUCKET variable are this bucket's (docs/owner-playbook.md).",
  );
  return { lines, code: 1 };
}
