/**
 * Run by the staging and preview deploys (.github/workflows/ci.yml). The build's artifact leaves the CV out, because
 * anyone signed in to GitHub can download a public repository's artifacts, so it is fetched from R2 again here
 * (decision 0046). Does nothing when the build made no /cv page. Same R2_* variables as fetch-originals.ts.
 */
import { existsSync } from "node:fs";
import { cvKey, putCvInDist } from "./lib/cv.ts";

const dist = new URL("../dist/", import.meta.url);
if (!cvKey || !existsSync(new URL("cv.html", dist))) {
  console.log("publish-cv: this build has no /cv page");
  process.exit(0);
}
const env = process.env;
const [accountId, accessKeyId, secretAccessKey, bucket] = [
  env["R2_ACCOUNT_ID"],
  env["R2_ACCESS_KEY_ID"],
  env["R2_SECRET_ACCESS_KEY"],
  env["R2_BUCKET"],
];
if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("publish-cv: dist/cv.html offers the CV, but the R2_* variables are not set");
  process.exit(1);
}
await putCvInDist({ accountId, accessKeyId, secretAccessKey, bucket }, cvKey, dist);
console.log("publish-cv: the CV is in dist/cv/");
