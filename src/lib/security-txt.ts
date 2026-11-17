/**
 * /.well-known/security.txt (RFC 9116), which the guide's "Rules for the build" ask for (security audit, decision
 * 0030). The contact is the owner's address, site.json `contactEmail`, the same one the privacy page shows; until it
 * is real (owner question O1) the file carries the site's placeholder form and the launch gate fails
 * (tests/e2e/qa/launch.spec.ts). Expires is set at build time just under a year ahead, the longest RFC 9116
 * recommends, so every deploy renews it.
 */

const DAY = 86_400_000;
export const EXPIRES_DAYS = 360;

/** A plain address, not the "[contact email]" placeholder of site.json (the same test as the privacy page's). */
export const isRealEmail = (value: string): boolean => /^[^@\s[\]]+@[^@\s[\]]+\.[^@\s[\]]+$/.test(value);

export function securityTxt(contactEmail: string, now: Date): string {
  const contact = isRealEmail(contactEmail)
    ? `mailto:${contactEmail}`
    : "[placeholder: the owner's contact address, site.json contactEmail]";
  return [
    `Contact: ${contact}`,
    `Expires: ${new Date(now.getTime() + EXPIRES_DAYS * DAY).toISOString()}`,
    "Preferred-Languages: en, it",
    "Canonical: https://philglov.es/.well-known/security.txt",
    "",
  ].join("\n");
}
