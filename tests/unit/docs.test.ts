/**
 * The owner copies commands from these documents and runs them, so every code block must be whole (fourth opinion,
 * A-03 and A-05). setup.md step 8b once had a block cut in the middle of a curl command: a "\n" in `-w` had become a
 * real line break, and the rest of the page was fenced wrongly from there on.
 *
 * - every fence is three backticks, and every block that opens closes;
 * - every `bash` block parses (`bash -n`), so a quote or a line cut in two fails here, not in the owner's terminal;
 * - no `powershell` block chains commands with && or ||, which Windows PowerShell 5.1 cannot parse.
 *
 * Needs bash on PATH (Git for Windows on a laptop: README, "On Windows").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DOCS = [
  "README.md",
  "docs/setup.md",
  "docs/owner-playbook.md",
  "docs/publishing-from-the-phone.md",
  // The launch day list (final review, 2026-11-21).
  "LAUNCH-RUNBOOK.md",
];
const root = new URL("../../", import.meta.url);

interface Block {
  file: string;
  line: number;
  lang: string;
  code: string;
}

/** The fenced blocks of a Markdown file, or the problems that stop it from being read as such. */
function blocks(file: string): { found: Block[]; problems: string[] } {
  const lines = readFileSync(new URL(file, root), "utf8").split(/\r?\n/);
  const found: Block[] = [];
  const problems: string[] = [];
  let open: { line: number; indent: string; lang: string; body: string[] } | null = null;
  lines.forEach((text, i) => {
    const fence = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)\s*$/.exec(text);
    if (!fence) {
      if (open) open.body.push(text.startsWith(open.indent) ? text.slice(open.indent.length) : text.trimStart());
      return;
    }
    const [, indent = "", marks = "", lang = ""] = fence;
    if (marks !== "```") problems.push(`${file}:${i + 1}: a fence of "${marks}"; use three backticks`);
    if (!open) open = { line: i + 1, indent, lang, body: [] };
    else if (lang) problems.push(`${file}:${i + 1}: a block opens inside the block from line ${open.line}`);
    else {
      found.push({ file, line: open.line, lang: open.lang, code: open.body.join("\n") });
      open = null;
    }
  });
  if (open) problems.push(`${file}:${(open as { line: number }).line}: this block never closes`);
  return { found, problems };
}

const all = DOCS.map(blocks);

test("every code block in the owner's documents is fenced with three backticks and closes", () => {
  assert.deepEqual(
    all.flatMap((d) => d.problems),
    [],
  );
});

test("every bash block parses as a whole (bash -n)", () => {
  const probe = spawnSync("bash", ["-c", "true"]);
  assert.equal(probe.status, 0, "bash is not on PATH: on Windows install Git for Windows (README, On Windows)");
  const failures: string[] = [];
  for (const block of all.flatMap((d) => d.found).filter((b) => b.lang === "bash")) {
    const result = spawnSync("bash", ["-n"], { input: `${block.code}\n`, encoding: "utf8" });
    if (result.status !== 0) failures.push(`${block.file}:${block.line}: ${result.stderr.trim()}`);
  }
  assert.deepEqual(failures, []);
});

test("no PowerShell block chains commands with && or || (Windows PowerShell 5.1 cannot parse them)", () => {
  const failures = all
    .flatMap((d) => d.found)
    .filter((b) => b.lang === "powershell" && /&&|\|\|/.test(b.code))
    .map((b) => `${b.file}:${b.line}`);
  assert.deepEqual(failures, []);
});
