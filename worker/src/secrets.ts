/**
 * Secrets are set with `wrangler secret put` and may be missing on a Worker
 * (docs/setup.md, steps 9 and 10). Callers check first and answer 503 or 403;
 * this is the guard behind that check, so an unset secret can never become an
 * empty HMAC key or signing key.
 */
export function required(value: string | undefined): string {
  if (!value) throw new Error("A required secret is not set");
  return value;
}
