// Open-redirect guard for `?next=` (Auth PRD §8). Only same-origin absolute
// paths are allowed; anything else (protocol-relative, backslash tricks,
// encoded slashes, auth pages) falls back to "/".
import { localePath, stripLocale } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/i18n/locales";

const AUTH_PAGES = ["/login", "/forgot", "/reset", "/invite"];

export function safeNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";

  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return "/";
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\") || /[\u0000-\u001f]/.test(decoded)) return "/";

  // Resolve against a dummy origin: if it escapes, reject.
  const url = new URL(next, "http://app.invalid");
  if (url.origin !== "http://app.invalid") return "/";

  const page = stripLocale(url.pathname);
  if (AUTH_PAGES.some((p) => page === p || page.startsWith(`${p}/`))) return "/";
  // URL normalisation collapses dot-segments ("/..//evil.com" → "//evil.com"),
  // so the final string must be checked again.
  const out = `${url.pathname}${url.search}${url.hash}`;
  if (out.startsWith("//") || out.startsWith("/\\")) return "/";
  return out;
}

/**
 * safeNext, re-anchored to `locale`: the language the user is on now wins over
 * whatever language `next` was captured in (e.g. after toggling on /login).
 */
export function safeLocalNext(next: string | null | undefined, locale: Locale): string {
  return localePath(locale, safeNext(next));
}
