/**
 * The launch copy of the photo originals from the staging bucket to production's (decision 0031, docs/setup.md step
 * 12b), against the local R2 stand-in (tests/unit/r2-stand-in.ts), which checks signatures and each token's buckets
 * as R2 does. Two tokens, as the owner makes them: one reads staging, one reads and writes production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyOriginals } from "../../scripts/lib/copy-originals.ts";
import { contentKeys } from "../../scripts/lib/photo-keys.ts";
import { listKeys, type R2Config } from "../../scripts/lib/r2.ts";
import { r2StandIn } from "./r2-stand-in.ts";

const STAGING = "philglov-originals-staging";
const PRODUCTION = "philglov-originals";
const READ = { id: "READ-STAGING", secret: "secret-of-the-staging-read-token" };
const WRITE = { id: "WRITE-PRODUCTION", secret: "secret-of-the-production-write-token" };
const READ_ONLY_PRODUCTION = { id: "READ-PRODUCTION", secret: "secret-of-the-production-read-token" };

const jpeg = (text: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(text)]);
const png = (text: string) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(text)]);

const USED = ["alps/lake-ab12.jpg", "alps/ridge-cd34.png", "photos/lisbon/tram.jpg", "photos/lisbon/tram-crop.jpg"];

async function setUp() {
  const r2 = await r2StandIn([STAGING, PRODUCTION], {
    [READ.id]: { secret: READ.secret, buckets: { [STAGING]: "read" } },
    [WRITE.id]: { secret: WRITE.secret, buckets: { [PRODUCTION]: "write" } },
    [READ_ONLY_PRODUCTION.id]: { secret: READ_ONLY_PRODUCTION.secret, buckets: { [PRODUCTION]: "read" } },
  });
  r2.seed(STAGING, "alps/lake-ab12.jpg", jpeg("lake"));
  r2.seed(STAGING, "alps/ridge-cd34.png", png("ridge"), "image/png");
  r2.seed(STAGING, "photos/lisbon/tram.jpg", jpeg("tram"));
  r2.seed(STAGING, "photos/lisbon/tram-crop.jpg", jpeg("tram, cropped"));
  // A draft's photo and a test upload: in staging, used by no entry.
  r2.seed(STAGING, "draft/boat-ef56.jpg", jpeg("boat"));
  r2.seed(STAGING, "zz-probe/probe-gh78.jpg", jpeg("probe"));
  const cfg = (bucket: string, token: { id: string; secret: string }): R2Config => ({
    accountId: "test-account",
    accessKeyId: token.id,
    secretAccessKey: token.secret,
    bucket,
    endpoint: r2.endpoint,
  });
  return { r2, from: cfg(STAGING, READ), to: cfg(PRODUCTION, WRITE), cfg };
}

test("copies every original the content uses, same bytes and type, and names what it leaves in staging", async () => {
  const { r2, from, to } = await setUp();
  try {
    const said: string[] = [];
    const report = await copyOriginals(USED, from, to, (line) => said.push(line));
    assert.deepEqual(report.copied, USED);
    assert.deepEqual([report.already, report.missing, report.different, report.failed], [[], [], [], []]);
    for (const key of USED) {
      const copy = r2.buckets.get(PRODUCTION)?.get(key);
      const original = r2.buckets.get(STAGING)?.get(key);
      assert.ok(copy && original, key);
      assert.deepEqual(copy.body, original.body, key);
      assert.equal(copy.type, original.type, key);
    }
    // Listed over several pages (two keys a page in the stand-in).
    assert.deepEqual(report.unused, ["draft/boat-ef56.jpg", "zz-probe/probe-gh78.jpg"]);
    assert.equal(r2.buckets.get(PRODUCTION)?.has("draft/boat-ef56.jpg"), false);

    // Least access: the staging token only read staging, the production token only touched production.
    const byToken = (id: string) => r2.calls.filter((c) => c.token === id);
    assert.ok(byToken(READ.id).every((c) => c.bucket === STAGING && c.method !== "PUT"));
    assert.ok(byToken(WRITE.id).every((c) => c.bucket === PRODUCTION));
    assert.equal(r2.calls.filter((c) => c.status === 403).length, 0);
    // No secret in anything it says.
    const out = JSON.stringify({ said, report });
    for (const secret of [READ.secret, WRITE.secret]) assert.equal(out.includes(secret), false);
  } finally {
    await r2.close();
  }
});

test("run twice, the second run copies nothing and finds everything there", async () => {
  const { r2, from, to } = await setUp();
  try {
    await copyOriginals(USED, from, to);
    const before = r2.calls.length;
    const again = await copyOriginals(USED, from, to);
    assert.deepEqual(again.copied, []);
    assert.deepEqual(again.already, USED);
    assert.equal(r2.calls.slice(before).filter((c) => c.method === "PUT").length, 0);
  } finally {
    await r2.close();
  }
});

test("an original the content uses but staging lacks is listed as missing; the rest are still copied", async () => {
  const { r2, from, to } = await setUp();
  try {
    const report = await copyOriginals([...USED, "alps/gone-ij90.jpg"], from, to);
    assert.deepEqual(report.missing, ["alps/gone-ij90.jpg"]);
    assert.deepEqual(report.copied, USED);
  } finally {
    await r2.close();
  }
});

test("an object production already has with other bytes is never written over", async () => {
  const { r2, from, to } = await setUp();
  try {
    r2.seed(PRODUCTION, "alps/lake-ab12.jpg", jpeg("a different lake"));
    r2.seed(PRODUCTION, "photos/lisbon/tram.jpg", jpeg("tran")); // same length, other bytes
    const report = await copyOriginals(USED, from, to);
    assert.deepEqual(report.different, ["alps/lake-ab12.jpg", "photos/lisbon/tram.jpg"]);
    assert.deepEqual(r2.buckets.get(PRODUCTION)?.get("alps/lake-ab12.jpg")?.body, jpeg("a different lake"));
    assert.deepEqual(r2.buckets.get(PRODUCTION)?.get("photos/lisbon/tram.jpg")?.body, jpeg("tran"));
    assert.deepEqual(report.copied, ["alps/ridge-cd34.png", "photos/lisbon/tram-crop.jpg"]);
  } finally {
    await r2.close();
  }
});

test("an original whose staging ETag is not an MD5 is copied, and a second run compares the bytes themselves", async () => {
  const { r2, from, to } = await setUp();
  try {
    r2.seed(STAGING, "alps/lake-ab12.jpg", jpeg("lake"), "image/jpeg", "0123abcd-1");
    assert.deepEqual((await copyOriginals(USED, from, to)).copied, USED);
    const again = await copyOriginals(USED, from, to);
    assert.deepEqual([again.already, again.different], [USED, []]);
  } finally {
    await r2.close();
  }
});

test("a production token that cannot write fails each copy with R2's answer, and nothing is stored", async () => {
  const { r2, from, cfg } = await setUp();
  try {
    const report = await copyOriginals(USED, from, cfg(PRODUCTION, READ_ONLY_PRODUCTION));
    assert.equal(report.failed.length, USED.length);
    assert.match(report.failed[0] ?? "", /R2 403/);
    assert.equal(r2.buckets.get(PRODUCTION)?.size, 0);
  } finally {
    await r2.close();
  }
});

test("the stand-in refuses a request signed with the wrong secret, so the signatures above were checked", async () => {
  const { r2, from } = await setUp();
  try {
    await assert.rejects(listKeys({ ...from, secretAccessKey: "wrong" }, ""), /R2 403/);
  } finally {
    await r2.close();
  }
});

test("the copy takes its list from the content: every original the entries and series of this checkout use", () => {
  const keys = contentKeys(new URL("../../src/", import.meta.url));
  assert.deepEqual(keys, [...new Set(keys)].sort());
  assert.ok(keys.length > 0);
  assert.ok(
    keys.every((k) => /^[a-z0-9-]+\/[^/]+$|^photos\/[a-z0-9-]+\/[^/]+$/.test(k)),
    keys.join(", "),
  );
});

test("the command refuses to start without its five variables, names them, and reads no file for them", () => {
  const script = fileURLToPath(new URL("../../scripts/copy-originals.ts", import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("R2_")));
  const result = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  assert.equal(result.status, 2);
  for (const name of [
    "R2_ACCOUNT_ID",
    "R2_FROM_ACCESS_KEY_ID",
    "R2_FROM_SECRET_ACCESS_KEY",
    "R2_TO_ACCESS_KEY_ID",
    "R2_TO_SECRET_ACCESS_KEY",
  ])
    assert.match(result.stderr, new RegExp(name));
});
