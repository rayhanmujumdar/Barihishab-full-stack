// Period ("YYYY-MM") helpers. A period is stored as the 1st of its month
// (DATE, UTC midnight); "today" is always the Asia/Dhaka calendar date.
import { todayIsoInDhaka } from "@/lib/clock";
import { toBanglaDigits, type Locale } from "@/lib/i18n";

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 86_400_000;

export const isMonthKey = (v: string): boolean => MONTH_KEY.test(v);

/** "2026-10" → 2026-10-01T00:00:00Z */
export function monthDate(key: string): Date {
  return new Date(`${key}-01T00:00:00Z`);
}

/** DATE column value → "2026-10" */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** "2026-12" + 1 → "2027-01" */
export function addMonths(key: string, n: number): string {
  const d = monthDate(key);
  return monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

export function currentMonthKey(at?: Date): string {
  return todayIsoInDhaka(at).slice(0, 7);
}

/** "October 2026" / "অক্টোবর ২০২৬" */
export function monthLabel(locale: Locale, key: string): string {
  const text = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    monthDate(key),
  );
  return locale === "bn" ? toBanglaDigits(text) : text;
}

/** Days between an ISO date and the period month (0 when inside it). */
export function daysFromPeriod(dateIso: string, key: string): number {
  const d = Date.parse(`${dateIso}T00:00:00Z`);
  const first = monthDate(key);
  const last = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0);
  if (d < first.getTime()) return Math.round((first.getTime() - d) / DAY_MS);
  if (d > last) return Math.round((d - last) / DAY_MS);
  return 0;
}
