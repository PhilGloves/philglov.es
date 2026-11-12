/**
 * New-comment and new-report email to the owner (B5), behind the NOTIFY
 * switch. Off on staging and previews: sending needs the domain. The email
 * holds the page title and a link to /admin, nothing else: no name, no email
 * address, no comment text, and never an approve link.
 */
import { log } from "./log.ts";

interface SendEmailBinding {
  send(message: unknown): Promise<void>;
}

export type Kind = "comment" | "report";

/** RFC 2047 for a non-ASCII subject. */
const encodeHeader = (text: string): string =>
  /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`;

/** The whole message, as the send_email binding wants it (raw MIME). Pure, tested. */
export function notificationMime(kind: Kind, title: string, from: string, to: string, now: Date, id: string): string {
  const subject = kind === "comment" ? `New comment: ${title}` : `New error report: ${title}`;
  const text = [
    kind === "comment" ? `A new comment is waiting on "${title}".` : `A new error report came in about "${title}".`,
    "",
    "Read it at https://philglov.es/admin",
    "",
  ].join("\r\n");
  const body = btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/.{76}/g, "$&\r\n")
    .trimEnd();
  return [
    `From: philglov.es <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject.replace(/[\r\n]+/g, " "))}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}@philglov.es>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
    "",
  ].join("\r\n");
}

export async function notify(env: Env, kind: Kind, title: string): Promise<void> {
  const binding = (env as unknown as { EMAIL?: SendEmailBinding }).EMAIL;
  if (String(env.NOTIFY) !== "on" || !binding || !env.NOTIFY_TO) {
    log("notification skipped");
    return;
  }
  try {
    // Imported only here, and only when sending is on.
    const { EmailMessage } = await import("cloudflare:email");
    const id = crypto.randomUUID();
    const raw = notificationMime(kind, title, env.NOTIFY_FROM, env.NOTIFY_TO, new Date(), id);
    await binding.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw));
    log("notification sent");
  } catch (error) {
    log("notification failed", error);
  }
}
