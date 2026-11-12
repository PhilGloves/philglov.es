/**
 * `pnpm preview`: the built site through the real Worker on http://127.0.0.1:8787.
 *
 * 1. Writes .dev.vars (gitignored) with fresh random values for the form key
 *    and IP salt the first time, so the forms work locally. These are local
 *    only: deployed Workers read real secrets set with `wrangler secret put`.
 * 2. Applies the D1 migrations to the local database.
 * 3. Starts `wrangler dev`. /admin answers 403 locally: there is no Access
 *    token here, and the Worker never skips the check.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const devVars = new URL("../.dev.vars", import.meta.url);
if (!existsSync(devVars)) {
  const random = () => randomBytes(32).toString("base64");
  writeFileSync(
    devVars,
    [
      "# Local only, written by scripts/preview.ts. Never used by a deployed Worker.",
      `FORM_HMAC_KEY=${random()}`,
      `IP_SALT=${random()}`,
      "GITHUB_APP_ID=",
      "GITHUB_APP_INSTALLATION_ID=",
      "GITHUB_APP_PRIVATE_KEY=",
      "NOTIFY_TO=",
      "",
    ].join("\n"),
  );
  console.log("preview: wrote .dev.vars with random local values");
}

// wrangler's own entry run by this Node, so no shell is involved on any platform.
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const migrate = spawnSync(process.execPath, [wrangler, "d1", "migrations", "apply", "DB", "--local"], {
  stdio: "inherit",
  env: { ...process.env, CI: "1" },
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const dev = spawn(
  process.execPath,
  [wrangler, "dev", "--port", "8787", "--ip", "127.0.0.1", ...process.argv.slice(2)],
  {
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => dev.kill(signal));
dev.on("exit", (code) => process.exit(code ?? 0));
