// Display helpers shared by the entries components (client-safe).
import { toBanglaDigits, type Locale } from "@/lib/i18n";

/** "2026-10-12" → "12 Oct" / "১২ অক্টো" (calendar date, no time zone shift). */
export function shortDate(locale: Locale, iso: string): string {
  const text = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return locale === "bn" ? toBanglaDigits(text) : text;
}

/** "2026-10-12" → "12 October 2026". */
export function longDate(locale: Locale, iso: string): string {
  const text = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return locale === "bn" ? toBanglaDigits(text) : text;
}

export const categoryName = (locale: Locale, c: { nameEn: string; nameBn: string }) => (locale === "bn" ? c.nameBn : c.nameEn);

export const num = (locale: Locale, n: number) => (locale === "bn" ? toBanglaDigits(String(n)) : String(n));

/** URL for the entries screen; `category` resets unless given. */
export function entriesHref(locale: Locale, q: { period: string; type: string; category?: string }) {
  const sp = new URLSearchParams({ period: q.period, type: q.type, category: q.category ?? "ALL" });
  return `/${locale}/entries?${sp}`;
}
