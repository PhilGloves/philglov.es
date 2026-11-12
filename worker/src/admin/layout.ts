/** The admin page shell: site stylesheet, the admin bar, phone-first markup from /styleguide (Admin). */
import { adminHeaders } from "../headers.ts";
import { html, Safe } from "../html.ts";
import { manifest } from "../manifest.ts";

export type Section = "comments" | "reports" | "write";

export interface Counts {
  comments: number;
  reports: number;
}

export async function adminPage(
  env: Env,
  options: { title: string; current: Section; counts?: Counts; body: Safe; script?: boolean; status?: number },
): Promise<Response> {
  const { stylesheets } = await manifest(env);
  const nav = (section: Section, href: string, label: string) =>
    html`<li>
      <a href="${href}" ${section === options.current ? new Safe(' aria-current="page"') : ""}>${label}</a>
    </li>`;
  const counts = options.counts;
  const page = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>${options.title} · philglov.es admin</title>
        ${stylesheets.map((href) => html`<link rel="stylesheet" href="${href}" />`)}
        ${options.script ? html`<script src="/admin/write.js" defer></script>` : ""}
      </head>
      <body class="admin">
        <div class="admin-bar">
          <b>philglov.es admin</b>
          <nav class="admin-nav" aria-label="Admin">
            <ul>
              ${nav("comments", "/admin#comments", counts ? `Comments (${counts.comments})` : "Comments")}
              ${nav("reports", "/admin#reports", counts ? `Reports (${counts.reports})` : "Reports")}
              ${nav("write", "/admin/write", "Write")}
            </ul>
          </nav>
        </div>
        <main class="admin-main" id="main">${options.body}</main>
      </body>
    </html> `;
  return new Response(page.value, {
    status: options.status ?? 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...adminHeaders(env.SITE_ENV) },
  });
}

/** Plain text keeps its line breaks: escaped, then each newline becomes <br>. */
export const multiline = (text: string): Safe => new Safe(html`${text}`.value.split("\n").join("<br>"));

export const when = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
