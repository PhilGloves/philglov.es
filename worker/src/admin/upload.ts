/**
 * PUT /admin/upload?slug=<slug>&name=<file name> (B8): one photo per request,
 * the raw file as the body, from the /admin/write script (progress, retry).
 * JPEG and PNG only, recognised by their first bytes, never by name or type;
 * at most 25 MB; streamed to R2 without buffering: the first chunk is checked,
 * then it and the rest flow through a FixedLengthStream, so R2 receives the
 * exact length the browser declared or the upload fails.
 * Stored as philglov-originals/<slug>/<name>-<4 random>.jpg|png. The Worker picks the random end and never writes
 * over a stored object: the name comes from the request, and replacing a photo a published entry shows would change
 * the site on its next build with no pull request (security audit, decision 0030).
 * Only where PHOTO_UPLOADS is "on": from launch the builds read production's bucket, so staging and preview turn it
 * "off" and say where photos go instead of storing one no build would find (decision 0031).
 */
import { photoName, SLUG } from "../entry-file.ts";
import { log } from "../log.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Four random lowercase letters or digits. */
function randomEnd(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** A key in the slug's folder that no stored object has yet, or null after a few tries. */
async function freshKey(bucket: R2Bucket, slug: string, name: string, ext: "jpg" | "png"): Promise<string | null> {
  const base = photoName(name, ext).slice(0, -(ext.length + 1));
  for (let i = 0; i < 5; i++) {
    const key = `${slug}/${base}-${randomEnd()}.${ext}`;
    if (!(await bucket.head(key))) return key;
  }
  return null;
}

export const MAX_PHOTO = 25 * 1024 * 1024;

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The type a file really is, from its first bytes. */
export function sniff(bytes: Uint8Array): "jpg" | "png" | null {
  if (JPEG.every((b, i) => bytes[i] === b)) return "jpg";
  if (PNG.every((b, i) => bytes[i] === b)) return "png";
  return null;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const UPLOADS_OFF =
  "This copy of the site no longer stores photos. Since launch, entries with photos are written on " +
  "philglov.es/admin/write.";

export async function upload(request: Request, env: Env): Promise<Response> {
  if (String(env.PHOTO_UPLOADS) !== "on") {
    await request.body?.cancel();
    log("photo rejected");
    return json(403, { error: UPLOADS_OFF });
  }
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  if (!SLUG.test(slug) || slug.length > 60) return json(400, { error: "Set a valid slug before adding photos." });
  const size = Number(request.headers.get("Content-Length") ?? "NaN");
  if (!Number.isSafeInteger(size) || size <= 0) return json(411, { error: "The upload has no length." });
  if (size > MAX_PHOTO) return json(413, { error: "Photos can be at most 25 MB." });
  if (!request.body) return json(400, { error: "Empty upload." });

  const reader = request.body.getReader();
  let head = new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  // Read just enough to see the signature (usually the first chunk).
  while (head.length < PNG.length) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    const joined = new Uint8Array(head.length + value.length);
    joined.set(head);
    joined.set(value, head.length);
    head = joined;
  }
  const ext = sniff(head);
  if (!ext) {
    await reader.cancel();
    log("photo rejected");
    return json(415, { error: "Only JPEG and PNG photos." });
  }

  const key = await freshKey(env.ORIGINALS, slug, url.searchParams.get("name") ?? "", ext);
  if (!key) {
    await reader.cancel();
    log("photo rejected");
    return json(409, { error: "Could not find a free name for this photo. Try again." });
  }
  const { readable, writable } = new FixedLengthStream(size);
  const pump = (async () => {
    const writer = writable.getWriter();
    try {
      for (const chunk of chunks) await writer.write(chunk);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
      throw error;
    }
  })();
  try {
    await Promise.all([
      env.ORIGINALS.put(key, readable, { httpMetadata: { contentType: ext === "jpg" ? "image/jpeg" : "image/png" } }),
      pump,
    ]);
  } catch (error) {
    log("photo rejected", error);
    return json(400, { error: "The upload broke off. It will be retried." });
  }
  log("photo stored");
  return json(200, { key });
}
