/**
 * Final review, T1B-01 (FINAL-REVIEW.md): with R2 credentials, a photo the content uses that cannot be fetched stops
 * the build. It used to be a warning, so a missing portrait or series photo shipped as a grey placeholder frame (and
 * the Person data lost its image) with every check green, on CI and in the production deploy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOriginals, fetchSummary } from "../../scripts/lib/fetch-originals.ts";
import type { R2Config } from "../../scripts/lib/r2.ts";
import { r2StandIn } from "./r2-stand-in.ts";

const BUCKET = "philglov-originals";
const TOKEN = { id: "READ", secret: "secret-of-the-read-token" };
const jpeg = (text: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(text)]);

async function setUp() {
  const r2 = await r2StandIn([BUCKET], { [TOKEN.id]: { secret: TOKEN.secret, buckets: { [BUCKET]: "read" } } });
  r2.seed(BUCKET, "portrait/finisterre.jpg", jpeg("portrait"));
  const cfg: R2Config = {
    accountId: "test-account",
    accessKeyId: TOKEN.id,
    secretAccessKey: TOKEN.secret,
    bucket: BUCKET,
    endpoint: r2.endpoint,
  };
  return { r2, cfg };
}

test("every original in the bucket is downloaded once, and the build goes on", async () => {
  const { r2, cfg } = await setUp();
  try {
    const saved = new Map<string, Uint8Array>();
    const report = await fetchOriginals(
      cfg,
      ["portrait/finisterre.jpg"],
      () => false,
      (k, b) => saved.set(k, b),
    );
    assert.deepEqual(report, { downloaded: ["portrait/finisterre.jpg"], cached: [], failed: [] });
    assert.deepEqual(Buffer.from(saved.get("portrait/finisterre.jpg") ?? []), jpeg("portrait"));
    const { lines, code } = fetchSummary(report, BUCKET);
    assert.equal(code, 0);
    assert.deepEqual(lines, ["fetch-originals: 1 needed, 1 downloaded, 0 cached"]);
    const again = await fetchOriginals(
      cfg,
      ["portrait/finisterre.jpg"],
      () => true,
      () => assert.fail("no download"),
    );
    assert.deepEqual(again, { downloaded: [], cached: ["portrait/finisterre.jpg"], failed: [] });
  } finally {
    await r2.close();
  }
});

test("a photo the content uses but the bucket lacks stops the build, naming the photo and the bucket", async () => {
  const { r2, cfg } = await setUp();
  try {
    const keys = ["portrait/finisterre.jpg", "photos/malta/harbour.jpg"];
    const report = await fetchOriginals(
      cfg,
      keys,
      () => false,
      () => {},
    );
    assert.deepEqual(report.downloaded, ["portrait/finisterre.jpg"]);
    assert.equal(report.failed.length, 1);
    assert.match(report.failed[0] ?? "", /^photos\/malta\/harbour\.jpg: /);
    const { lines, code } = fetchSummary(report, BUCKET);
    assert.equal(code, 1);
    assert.equal(lines[0], "fetch-originals: 2 needed, 1 downloaded, 0 cached");
    assert.match(lines.join("\n"), /could not fetch 1 from philglov-originals:\n {2}photos\/malta\/harbour\.jpg/);
  } finally {
    await r2.close();
  }
});

test("a token that cannot read the bucket stops the build too, and no secret is printed", async () => {
  const { r2, cfg } = await setUp();
  try {
    const report = await fetchOriginals(
      { ...cfg, secretAccessKey: "wrong" },
      ["portrait/finisterre.jpg"],
      () => false,
      () => {},
    );
    const { lines, code } = fetchSummary(report, BUCKET);
    assert.equal(code, 1);
    assert.doesNotMatch(lines.join("\n"), /secret-of-the-read-token|wrong/);
  } finally {
    await r2.close();
  }
});

test("many originals download six at a time, each once, and the report lists them in order (0040)", async () => {
  const { r2, cfg } = await setUp();
  try {
    const keys = Array.from({ length: 14 }, (_, i) => `photos/malta/p${String(i).padStart(2, "0")}.jpg`);
    for (const key of keys) r2.seed(BUCKET, key, jpeg(key));
    const saved = new Map<string, Uint8Array>();
    const report = await fetchOriginals(
      cfg,
      ["portrait/finisterre.jpg", ...keys],
      (k) => k.startsWith("portrait/"),
      (k, b) => {
        assert.ok(!saved.has(k), `${k} saved twice`);
        saved.set(k, b);
      },
    );
    assert.deepEqual(report, { downloaded: keys, cached: ["portrait/finisterre.jpg"], failed: [] });
    for (const key of keys) assert.deepEqual(Buffer.from(saved.get(key) ?? []), jpeg(key));
  } finally {
    await r2.close();
  }
});
