// Display helpers for the Requests screens (client-safe).
import { toBanglaDigits, translator, type Locale, type MessageKey } from "@/lib/i18n";
import type { RequestType } from "./types";

export const reqNumber = (locale: Locale, n: string) => (locale === "bn" ? toBanglaDigits(n) : n);

export const typeLabel = (locale: Locale, type: RequestType) => translator(locale)(`req.type.${type}` as MessageKey);

/** Builds /{lang}/requests?… keeping only non-empty params. */
export function requestsHref(locale: Locale, q: Record<string, string | number | undefined | null> = {}): string {
  const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)]));
  const qs = sp.toString();
  return `/${locale}/requests${qs ? `?${qs}` : ""}`;
}

/** Default needed-by: 7 days from today (F2). */
export function inDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
