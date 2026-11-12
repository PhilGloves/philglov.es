/** robots.txt and tdmrep.json, both built from the one data file src/data/ai-bots.json (docs/guide.md, "Blocking AI training"). */
import bots from "../data/ai-bots.json" with { type: "json" };

export function robotsTxt(site = "https://philglov.es"): string {
  return [
    "# philglov.es — © Filippo Guanti. All rights reserved.",
    "# Text and data mining, including AI training, is expressly reserved",
    `# (Directive (EU) 2019/790, art. 4(3)). See ${site}/rights`,
    "",
    "User-agent: *",
    `Content-Signal: ${bots.contentSignal}`,
    "Allow: /",
    ...bots.disallowForEveryone.map((path) => `Disallow: ${path}`),
    "",
    "# AI-training crawlers and training opt-out tokens",
    ...bots.trainingBots.map((name) => `User-agent: ${name}`),
    "Disallow: /",
    "",
    `Sitemap: ${site}/sitemap.xml`,
    "",
  ].join("\n");
}

/** TDM Reservation Protocol: a rule reserving the whole site. */
export const tdmrepJson = (): string => `${JSON.stringify([{ location: "/", "tdm-reservation": 1 }], null, 2)}\n`;
