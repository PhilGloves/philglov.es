/** The CV behind /cv (decision 0046): when there is a page, where the deploys get the file, and its size figure. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cvInfo, putCvInDist } from "../../scripts/lib/cv.ts";
import { fetchOriginals } from "../../scripts/lib/fetch-originals.ts";
import { fileSize } from "../../src/lib/cv.ts";
import { r2StandIn } from "./r2-stand-in.ts";

const KEY = "cv/filippo-guanti-cv.pdf";

test("no cv named, or no file fetched: no page; a fetched file gives its size and date", () => {
  const dir = mkdtempSync(join(tmpdir(), "cv-"));
  try {
    assert.equal(cvInfo(dir, KEY), undefined);
    mkdirSync(join(dir, "cv"));
    writeFileSync(join(dir, KEY), "%PDF-1.4");
    const date = new Date("2026-11-01T12:00:00Z");
    utimesSync(join(dir, KEY), date, date);
    assert.equal(cvInfo(dir, ""), undefined, "site.json names no cv");
    assert.deepEqual(cvInfo(dir, KEY), { path: join(dir, KEY), size: 8, modified: date.toISOString() });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the fetch hands on R2's date, and the deploy step writes the same bytes to dist/cv/", async () => {
  const r2 = await r2StandIn(["b"], { READ: { secret: "s", buckets: { b: "read" } } });
  const dir = mkdtempSync(join(tmpdir(), "cv-"));
  try {
    r2.seed("b", KEY, Buffer.from("%PDF-1.4 the file"), "application/pdf");
    const cfg = { accountId: "a", accessKeyId: "READ", secretAccessKey: "s", bucket: "b", endpoint: r2.endpoint };
    let when: Date | undefined;
    await fetchOriginals(
      cfg,
      [KEY],
      () => false,
      (_k, _b, modified) => void (when = modified),
    );
    assert.equal(when?.toISOString(), "2026-11-01T12:00:00.000Z");
    const dist = pathToFileURL(`${dir}/`);
    await putCvInDist(cfg, KEY, dist);
    assert.equal(readFileSync(new URL(KEY, dist), "utf8"), "%PDF-1.4 the file");
  } finally {
    await r2.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file sizes read as KB below a megabyte and MB above", () => {
  assert.equal(fileSize(300), "1 KB");
  assert.equal(fileSize(184_321), "184 KB");
  assert.equal(fileSize(999_700), "1.0 MB");
  assert.equal(fileSize(1_240_000), "1.2 MB");
});
