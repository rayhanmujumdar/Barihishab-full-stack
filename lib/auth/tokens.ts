// Token primitives (design D2). No database access here, so proxy.ts can use
// verifyAccessToken without pulling Prisma into the proxy bundle.
//
// - Access token: HS256 JWT, 15 min, claims { sub, sid, ver, roles }.
// - Opaque tokens (refresh, invite, reset): 32 random bytes, base64url; only
//   the SHA-256 hex digest is ever stored.
// - CSRF token: HMAC(secret, sid) — verifiable without a DB round-trip.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ROLES, type Role } from "@/lib/permissions";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = "barihisab";
const AUDIENCE = "barihisab-web";

export type AccessClaims = {
  sub: string; // user id
  sid: string; // refresh-session id (links to `sessions` row)
  ver: number; // users.token_version at issue time
  roles: Role[];
};
export type VerifiedAccess = AccessClaims & { iat: number; exp: number };

function secret(): Uint8Array {
  const value = process.env.AUTH_JWT_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_JWT_SECRET must be set (≥ 32 chars)");
  return new TextEncoder().encode(value);
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: claims.sid, ver: claims.ver, roles: claims.roles })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secret());
}

/** Returns verified claims, or null for anything expired, forged or malformed. */
export async function verifyAccessToken(token: string | null | undefined): Promise<VerifiedAccess | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: new Date(),
    });
    const { sub, sid, ver, roles, iat, exp } = payload as Record<string, unknown>;
    if (
      typeof sub !== "string" ||
      typeof sid !== "string" ||
      typeof ver !== "number" ||
      !Array.isArray(roles) ||
      !roles.every((r) => (ROLES as readonly string[]).includes(r as string)) ||
      typeof iat !== "number" ||
      typeof exp !== "number"
    ) {
      return null;
    }
    return { sub, sid, ver, roles: roles as Role[], iat, exp };
  } catch {
    return null;
  }
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab); // keep the work roughly constant
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function deriveCsrfToken(sessionId: string): string {
  return createHmac("sha256", secret()).update(`csrf:${sessionId}`).digest("base64url");
}

export function verifyCsrfToken(sessionId: string, presented: string | null | undefined): boolean {
  if (!presented) return false;
  return safeEqual(deriveCsrfToken(sessionId), presented);
}
