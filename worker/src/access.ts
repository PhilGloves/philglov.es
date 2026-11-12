/**
 * Cloudflare Access check for /admin (B4). Access sits in front, and the
 * Worker verifies its JWT on every request anyway, so a misconfigured Access
 * application cannot expose the admin pages: no valid token, no admin.
 * Team domain and audience (AUD tag) are per-environment vars.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface Identity {
  sub: string;
  email: string | undefined;
}

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

/** Placeholder or empty config means "not set up": every request is refused. */
const configured = (value: string | undefined): value is string =>
  typeof value === "string" && value !== "" && !value.startsWith("REPLACE_");

export function accessConfig(env: Env): { team: string; aud: string } | null {
  const team = String(env.ACCESS_TEAM_DOMAIN);
  const aud = String(env.ACCESS_AUD);
  if (!configured(team) || !configured(aud) || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) return null;
  return { team, aud };
}

function remoteKeys(team: string): JWTVerifyGetKey {
  let keys = jwksByTeam.get(team);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, keys);
  }
  return keys;
}

/**
 * The verified identity, or null. `keys` is injectable for tests; in
 * production it is the team's published JWKS, fetched and cached by jose.
 */
export async function verifyAccess(request: Request, env: Env, keys?: JWTVerifyGetKey): Promise<Identity | null> {
  const config = accessConfig(env);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!config || !token) return null;
  try {
    const { payload } = await jwtVerify(token, keys ?? remoteKeys(config.team), {
      issuer: `https://${config.team}`,
      audience: config.aud,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub === "") return null;
    return { sub: payload.sub, email: typeof payload["email"] === "string" ? payload["email"] : undefined };
  } catch {
    return null;
  }
}
