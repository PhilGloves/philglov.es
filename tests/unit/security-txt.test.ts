/**
 * /.well-known/security.txt (RFC 9116; the guide's "Rules for the build", security audit, decision 0030). The contact
 * is the owner's address, site.json `contactEmail`; until it is real (O1) the file carries the site's placeholder and
 * the launch gate fails (tests/e2e/qa/launch.spec.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isRealEmail, securityTxt } from "../../src/lib/security-txt.ts";

const NOW = new Date("2026-11-17T10:00:00Z");
const DAY = 86_400_000;

const fields = (text: string): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z-]+): (.+)$/.exec(line);
    if (m?.[1] && m[2]) map.set(m[1], [...(map.get(m[1]) ?? []), m[2]]);
  }
  return map;
};

test("a real address becomes a mailto: Contact, with Expires under a year ahead and the canonical address", () => {
  const text = securityTxt("phil@philglov.es", NOW);
  const f = fields(text);
  assert.deepEqual(f.get("Contact"), ["mailto:phil@philglov.es"]);
  assert.equal(f.get("Expires")?.length, 1, "exactly one Expires");
  const expires = Date.parse(f.get("Expires")?.[0] ?? "");
  assert.ok(expires > NOW.getTime() + 300 * DAY && expires < NOW.getTime() + 365 * DAY, "under a year, not much less");
  assert.match(f.get("Expires")?.[0] ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
  assert.deepEqual(f.get("Canonical"), ["https://philglov.es/.well-known/security.txt"]);
  assert.deepEqual(f.get("Preferred-Languages"), ["en, it"]);
  assert.ok(text.endsWith("\n"));
});

test("until the owner's address is known the Contact is the site's placeholder, which the launch gate refuses", () => {
  for (const value of ["[contact email]", "", "phil@", "[placeholder]"]) {
    assert.equal(isRealEmail(value), false, value);
    assert.match(securityTxt(value, NOW), /^Contact: \[placeholder: [^\]]+\]$/m);
  }
  assert.equal(isRealEmail("phil@philglov.es"), true);
});

test("the build serves it", { skip: !existsSync(new URL("../../dist/index.html", import.meta.url)) }, () => {
  const text = readFileSync(new URL("../../dist/.well-known/security.txt", import.meta.url), "utf8");
  assert.match(text, /^Contact: /m);
  assert.ok(Date.parse(fields(text).get("Expires")?.[0] ?? "") > Date.now());
  // Served as an asset (the Worker never runs for /.well-known/*), with the headers of dist/_headers' "/*" rule.
  const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /"!\/\.well-known\/\*"/);
});
