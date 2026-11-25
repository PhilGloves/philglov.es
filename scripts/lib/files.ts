import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function filesUnder(dir: URL, name: RegExp): URL[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && name.test(entry.name))
    .map((entry) => pathToFileURL(join(entry.parentPath, entry.name)));
}
