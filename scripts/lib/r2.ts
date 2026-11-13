/**
 * A minimal S3-compatible client for the private R2 originals bucket: AWS
 * Signature V4 over node:crypto and fetch, so the photo pipeline needs no SDK
 * dependency (brief: fewer than 10 direct dependencies). It only reads: list
 * and get. The EU-jurisdiction endpoint is <account>.eu.r2.cloudflarestorage.com.
 */
import { createHash, createHmac } from "node:crypto";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Override for tests. */
  endpoint?: string;
}

const hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data).digest();
const encode = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignInput {
  method: string;
  /** Path, already URI-encoded per segment. */
  path: string;
  query?: Record<string, string>;
  headers: Record<string, string>;
  payloadHash?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** "20130524T000000Z" */
  amzDate: string;
}

/** Returns the Authorization header value. `headers` must already include host and x-amz-date. */
export function authorization(input: SignInput): string {
  const payloadHash = input.payloadHash ?? hex("");
  const headers = Object.fromEntries(
    Object.entries({ ...input.headers, "x-amz-content-sha256": payloadHash }).map(([k, v]) => [
      k.toLowerCase(),
      v.trim().replace(/\s+/g, " "),
    ]),
  );
  const names = Object.keys(headers).sort();
  const canonicalQuery = Object.entries(input.query ?? {})
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical =
    `${input.method}
${input.path}
${canonicalQuery}
` +
    `${names
      .map(
        (n) => `${n}:${headers[n]}
`,
      )
      .join("")}
${names.join(";")}
${payloadHash}`;
  const day = input.amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, hex(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

async function request(cfg: R2Config, path: string, query: Record<string, string> = {}): Promise<Response> {
  const endpoint = cfg.endpoint ?? `https://${cfg.accountId}.eu.r2.cloudflarestorage.com`;
  const url = new URL(endpoint);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const fullPath = `/${encode(cfg.bucket)}${path}`;
  const auth = authorization({
    method: "GET",
    path: fullPath,
    query,
    headers: { host: url.host, "x-amz-date": amzDate },
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: "auto",
    service: "s3",
    amzDate,
  });
  const search = new URLSearchParams(query).toString();
  const res = await fetch(`${endpoint}${fullPath}${search ? `?${search.replace(/\+/g, "%20")}` : ""}`, {
    headers: { "x-amz-date": amzDate, "x-amz-content-sha256": hex(""), authorization: auth },
  });
  if (!res.ok) throw new Error(`R2 ${res.status} for ${path}`);
  return res;
}

/** The object key as a path: each segment encoded, slashes kept. */
const keyPath = (key: string): string => `/${key.split("/").map(encode).join("/")}`;

export async function listKeys(cfg: R2Config, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const query: Record<string, string> = { "list-type": "2", prefix };
    if (token) query["continuation-token"] = token;
    const xml = await (await request(cfg, "/", query)).text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push((m[1] ?? "").replaceAll("&amp;", "&"));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token);
  return keys;
}

export async function getObject(cfg: R2Config, key: string): Promise<Uint8Array> {
  return new Uint8Array(await (await request(cfg, keyPath(key))).arrayBuffer());
}
