import { createHash } from "node:crypto";

/** The bodies of scripts that execute: no `src`, and not JSON-LD data blocks. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=|type="application\/ld\+json"/.test(m.groups?.["attrs"] ?? ""))
    .map((m) => m.groups?.["body"] ?? "");
}

/** CSP source for an inline script: 'sha256-<base64>' (without the quotes). */
export const sha256 = (text: string): string => `sha256-${createHash("sha256").update(text).digest("base64")}`;
