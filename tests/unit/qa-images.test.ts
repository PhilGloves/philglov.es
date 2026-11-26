/**
 * QA suites 10 and 14 (the files): every image the build wrote carries no GPS position, and every photograph carries
 * the copyright, the creator, the web statement and the Data Mining reservation. Read with exiftool, independently
 * of scripts/photo-rights.ts, which wrote them. Needs a build and exiftool (CI installs it): it runs on the test build
 * with the unit tests and on the site's own build with `pnpm test:site` (decision 0033).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const assets = fileURLToPath(new URL("../../dist/_assets/", import.meta.url));
// Every folder, large/ included: the large versions are the biggest photographs published (audit finding 10).
const images = existsSync(assets)
  ? readdirSync(assets, { recursive: true, encoding: "utf8" }).filter((f) => /\.(avif|webp|jpe?g|png)$/i.test(f))
  : [];
const photographs = images.filter((f) => /\.(avif|webp|jpe?g)$/i.test(f));

function exiftool(files: string[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (let i = 0; i < files.length; i += 200) {
    const chunk = files.slice(i, i + 200).map((f) => `${assets}${f}`);
    const json = execFileSync("exiftool", ["-json", "-a", "-G1", "-n", "-s", ...chunk], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    out.push(...(JSON.parse(json) as Record<string, string>[]));
  }
  return out;
}

// The site's own build may have no photograph yet (decision 0033), so a build is required, not an image.
test("there is a build to check, and exiftool is there to read it", () => {
  assert.ok(existsSync(assets), "dist/_assets does not exist: run `pnpm build` (or `pnpm build:fixtures`) first");
  try {
    execFileSync("exiftool", ["-ver"], { stdio: "ignore" });
  } catch {
    assert.fail("exiftool is not installed: this check cannot run without it (CI installs it)");
  }
});

test("no output image contains GPS data, in any metadata group", () => {
  const bad = exiftool(images)
    .filter((row) => Object.keys(row).some((k) => /GPS/i.test(k)))
    .map((row) => row["SourceFile"]);
  assert.deepEqual(bad, []);
});

test("every photograph carries the copyright, creator, web statement and the Data Mining reservation", () => {
  const problems: string[] = [];
  for (const row of exiftool(photographs)) {
    const name = String(row["SourceFile"]).split("/").pop();
    const get = (re: RegExp) => Object.entries(row).find(([k]) => re.test(k))?.[1];
    if (!/^© \d{4} Filippo Guanti\. All rights reserved\.$/.test(String(get(/Rights$/) ?? "")))
      problems.push(`${name}: copyright is "${String(get(/Rights$/))}"`);
    if (!/Filippo Guanti/.test(String(get(/Creator$/) ?? ""))) problems.push(`${name}: no creator`);
    if (get(/WebStatement$/) !== "https://philglov.es/rights")
      problems.push(`${name}: web statement is ${String(get(/WebStatement$/))}`);
    if (!/DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING$/.test(String(get(/DataMining$/) ?? "")))
      problems.push(`${name}: Data Mining is ${String(get(/DataMining$/))}`);
  }
  assert.deepEqual(problems, []);
});

test("no original leaks into the build: every image is a hashed output with a width and a height", () => {
  const size = (row: Record<string, string>, re: RegExp) =>
    Number(Object.entries(row).find(([k]) => re.test(k))?.[1] ?? 0);
  const problems = exiftool(photographs)
    .filter((row) => !(size(row, /ImageWidth$/) > 0 && size(row, /ImageHeight$/) > 0))
    .map((row) => String(row["SourceFile"]));
  assert.deepEqual(problems, []);
  for (const f of photographs)
    assert.match(f, /\.[A-Za-z0-9_-]{6,}(_[A-Za-z0-9]+)?\.(avif|webp|jpe?g)$/, `${f} is a hashed output`);
});
