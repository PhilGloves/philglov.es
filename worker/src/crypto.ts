/** Small WebCrypto helpers. No dependency: HMAC and SHA-256 are built into the runtime. */

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** HMAC-SHA-256 key for a secret, imported once per isolate. */
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    keys.set(secret, key);
  }
  return key;
}

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  return base64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message)));
}

/** Constant-time check (crypto.subtle.verify compares in constant time). */
export async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
  const bytes = fromBase64url(signature);
  if (!bytes || bytes.length !== 32) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), bytes, encoder.encode(message));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The visitor's address as a salted hash; the raw IP is never stored or logged. */
export function ipHash(request: Request, salt: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return sha256Hex(`${salt}:${ip}`);
}

export function randomId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/** UTF-8 text to standard base64 (GitHub's contents API) and back. */
export function utf8ToBase64(text: string): string {
  let binary = "";
  for (const b of encoder.encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToUtf8(text: string): string {
  const binary = atob(text.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
