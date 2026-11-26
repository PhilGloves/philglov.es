/**
 * A local stand-in for R2's S3 API, for tests of scripts/lib/r2.ts and the launch copy (decision 0031). Nothing
 * leaves the machine: it listens on 127.0.0.1. Like R2 it checks every request's Signature V4 against the token's
 * secret and the payload hash against the body, and each token reaches only the buckets it was made for, read or read
 * and write. It records every call, so a test can say which token did what where.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { authorization } from "../../scripts/lib/r2.ts";

export interface Token {
  secret: string;
  buckets: Record<string, "read" | "write">;
}

export interface Stored {
  body: Buffer;
  type: string;
  etag: string;
}

export interface Call {
  method: string;
  bucket: string;
  key: string;
  token: string;
  status: number;
}

const md5 = (data: Buffer): string => createHash("md5").update(data).digest("hex");
const sha256 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
const xml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function read(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function r2StandIn(bucketNames: string[], tokens: Record<string, Token>, pageSize = 2) {
  const buckets = new Map(bucketNames.map((name) => [name, new Map<string, Stored>()]));
  const calls: Call[] = [];

  const server = createServer(async (req, res) => {
    const body = await read(req);
    const url = new URL(req.url ?? "/", "http://stand-in");
    const [, bucket = "", ...rest] = url.pathname.split("/");
    const key = rest.map(decodeURIComponent).join("/");
    const method = req.method ?? "GET";
    const auth =
      /^AWS4-HMAC-SHA256 Credential=([^/]+)\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=[0-9a-f]{64}$/.exec(
        String(req.headers.authorization ?? ""),
      );
    const akid = auth?.[1] ?? "";
    const answer = (status: number, headers: Record<string, string> = {}, text = "") => {
      calls.push({ method, bucket, key, token: akid, status });
      res.writeHead(status, headers);
      res.end(method === "HEAD" ? undefined : text);
    };

    const token = tokens[akid];
    if (!auth || !token) return answer(403, {}, "<Error><Code>InvalidAccessKeyId</Code></Error>");
    const payloadHash = String(req.headers["x-amz-content-sha256"] ?? "");
    if (payloadHash !== sha256(body)) return answer(400, {}, "<Error><Code>XAmzContentSHA256Mismatch</Code></Error>");
    const signed = (auth[2] ?? "").split(";").filter((n) => n !== "x-amz-content-sha256");
    const expected = authorization({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(signed.map((n) => [n, String(req.headers[n] ?? "")])),
      payloadHash,
      accessKeyId: akid,
      secretAccessKey: token.secret,
      region: "auto",
      service: "s3",
      amzDate: String(req.headers["x-amz-date"] ?? ""),
    });
    if (expected !== req.headers.authorization)
      return answer(403, {}, "<Error><Code>SignatureDoesNotMatch</Code></Error>");

    const grant = token.buckets[bucket];
    const write = method === "PUT" || method === "DELETE";
    if (!grant || (write && grant !== "write")) return answer(403, {}, "<Error><Code>AccessDenied</Code></Error>");
    const objects = buckets.get(bucket);
    if (!objects) return answer(404, {}, "<Error><Code>NoSuchBucket</Code></Error>");

    if (method === "GET" && !key && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = Number(url.searchParams.get("continuation-token") ?? "0");
      const page = all.slice(start, start + pageSize);
      const more = start + pageSize < all.length;
      return answer(
        200,
        { "content-type": "application/xml" },
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>${more}</IsTruncated>` +
          page.map((k) => `<Contents><Key>${xml(k)}</Key></Contents>`).join("") +
          (more ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : "") +
          "</ListBucketResult>",
      );
    }
    if (method === "PUT") {
      const etag = md5(body);
      objects.set(key, { body, type: String(req.headers["content-type"] ?? "application/octet-stream"), etag });
      return answer(200, { etag: `"${etag}"` });
    }
    const object = objects.get(key);
    if (!object) return answer(404, {}, "<Error><Code>NoSuchKey</Code></Error>");
    if (method === "GET" || method === "HEAD") {
      res.setHeader("content-length", String(object.body.length));
      calls.push({ method, bucket, key, token: akid, status: 200 });
      // A fixed Last-Modified: R2 sends the date the object was stored (decision 0046).
      res.writeHead(200, {
        "content-type": object.type,
        etag: `"${object.etag}"`,
        "last-modified": "Sun, 01 Nov 2026 12:00:00 GMT",
      });
      res.end(method === "HEAD" ? undefined : object.body);
      return;
    }
    return answer(405);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    buckets,
    calls,
    /** Stores an object directly, as a Worker binding would; `etag` stands in for one that is not an MD5. */
    seed(bucket: string, key: string, body: Buffer, type = "image/jpeg", etag = md5(body)) {
      buckets.get(bucket)?.set(key, { body, type, etag });
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
