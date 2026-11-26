/**
 * The words and the size figure of /cv (decision 0046). The page is English only, so its text lives here and not in
 * src/i18n, where every key needs an Italian twin.
 */
export const CV_TEXT = {
  title: "CV",
  line: "My CV, as a PDF.",
  button: "Download the CV (PDF)",
  updated: "Last updated:",
} as const;

/** "184 KB", "1.2 MB" (decimal units). */
export function fileSize(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1000));
  return kb < 1000 ? `${kb} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
