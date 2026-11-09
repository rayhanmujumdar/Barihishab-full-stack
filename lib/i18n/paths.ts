// URL helpers for the /[lang]/… routing. Safe for client and server.
import { LOCALES, type Locale } from "./locales";

const PREFIX = new RegExp(`^/(${LOCALES.join("|")})(?=/|$)`);

/** "/admin/users" + "en" → "/en/admin/users"; "/" + "bn" → "/bn". */
export function localePath(locale: Locale, path: string): string {
  const clean = stripLocale(path);
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Removes a leading /bn or /en segment ("/en/me?x=1" → "/me?x=1"). */
export function stripLocale(path: string): string {
  const stripped = path.replace(PREFIX, "");
  return stripped === "" ? "/" : stripped.startsWith("/") ? stripped : `/${stripped}`;
}

/** The locale in the first path segment, if any. */
export function localeFromPath(path: string | null | undefined): Locale | null {
  const m = path?.match(PREFIX);
  return m ? (m[1] as Locale) : null;
}
