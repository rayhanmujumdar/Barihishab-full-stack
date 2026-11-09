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

export function appendAuthCookies(
  headers: Headers,
  t: { accessToken: string; refreshToken: string; csrfToken: string; remember: boolean },
): void {
  const longLived = t.remember ? REMEMBER_TTL_SECONDS : undefined;
  headers.append("Set-Cookie", serialize(COOKIE.access, t.accessToken, { maxAge: ACCESS_TOKEN_TTL_SECONDS, httpOnly: true }));
  headers.append("Set-Cookie", serialize(COOKIE.refresh, t.refreshToken, { maxAge: longLived, httpOnly: true }));
  // Readable by JS so the client can echo it in X-CSRF-Token (double submit).
  headers.append("Set-Cookie", serialize(COOKIE.csrf, t.csrfToken, { maxAge: longLived }));
}

export function appendClearedAuthCookies(headers: Headers): void {
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

/** Remembers the UI language (not sensitive; readable by JS for the toggle). */
export function appendLocaleCookie(headers: Headers, locale: "bn" | "en"): void {
  headers.append("Set-Cookie", serialize(COOKIE.locale, locale, { maxAge: 365 * 24 * 60 * 60 }));
}
