// Cookie names and attributes (design D2). Written as raw Set-Cookie headers
// so route handlers stay plain Request → Response functions (testable without
// a Next request context).
import { ACCESS_TOKEN_TTL_SECONDS } from "./tokens";

export const COOKIE = {
  access: "bh_at",
  refresh: "bh_rt",
  csrf: "bh_csrf",
  locale: "bh_locale",
} as const;

export const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;

type CookieOpts = { maxAge?: number; httpOnly?: boolean };

function serialize(name: string, value: string, opts: CookieOpts): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Paths where a page script could have planted same-name cookies (the Swagger
 * UI at /api/v1/docs writes `in: cookie` API keys to document.cookie, whose
 * default path is /api/v1). Such a cookie is sent BEFORE ours on every
 * /api/v1 request and would shadow the real token, so auth responses delete it.
 */
const SHADOW_PATHS = ["/api/v1"];

function clearShadows(headers: Headers): void {
  for (const path of SHADOW_PATHS) {
    for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.csrf]) {
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      headers.append("Set-Cookie", `${name}=; Path=${path}; Max-Age=0; SameSite=Lax${secure}`);
    }
  }
}

export function appendAuthCookies(
  headers: Headers,
  t: { accessToken: string; refreshToken: string; csrfToken: string; remember: boolean },
): void {
  const longLived = t.remember ? REMEMBER_TTL_SECONDS : undefined;
  clearShadows(headers); // first, so the real cookies are the last word per name
  headers.append("Set-Cookie", serialize(COOKIE.access, t.accessToken, { maxAge: ACCESS_TOKEN_TTL_SECONDS, httpOnly: true }));
  headers.append("Set-Cookie", serialize(COOKIE.refresh, t.refreshToken, { maxAge: longLived, httpOnly: true }));
  // Readable by JS so the client can echo it in X-CSRF-Token (double submit).
  headers.append("Set-Cookie", serialize(COOKIE.csrf, t.csrfToken, { maxAge: longLived }));
}

export function appendClearedAuthCookies(headers: Headers): void {
  clearShadows(headers);
  headers.append("Set-Cookie", serialize(COOKIE.access, "", { maxAge: 0, httpOnly: true }));
  headers.append("Set-Cookie", serialize(COOKIE.refresh, "", { maxAge: 0, httpOnly: true }));
  headers.append("Set-Cookie", serialize(COOKIE.csrf, "", { maxAge: 0 }));
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Every value of a cookie name, in header order (duplicates exist when paths differ). */
export function readCookieValues(req: Request, name: string): string[] {
  const header = req.headers.get("cookie");
  if (!header) return [];
  const out: string[] = [];
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1 || part.slice(0, idx).trim() !== name) continue;
    try {
      out.push(decodeURIComponent(part.slice(idx + 1).trim()));
    } catch {
      // skip malformed values
    }
  }
  return out;
}

const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const REFRESH_SHAPE = /^[\w-]{43}$/;

/** The access-token cookie, skipping any shadow value that isn't even a JWT. */
export function readAccessCookie(req: Request): string | null {
  return readCookieValues(req, COOKIE.access).find((v) => JWT_SHAPE.test(v)) ?? null;
}

/** The refresh-token cookie (32 random bytes, base64url), skipping shadow values. */
export function readRefreshCookie(req: Request): string | null {
  return readCookieValues(req, COOKIE.refresh).find((v) => REFRESH_SHAPE.test(v)) ?? null;
}

/** Remembers the UI language (not sensitive; readable by JS for the toggle). */
export function appendLocaleCookie(headers: Headers, locale: "bn" | "en"): void {
  headers.append("Set-Cookie", serialize(COOKIE.locale, locale, { maxAge: 365 * 24 * 60 * 60 }));
}
