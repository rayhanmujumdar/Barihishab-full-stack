// Display helpers for the Distribution screen (client-safe).
import { translator, type Locale, type MessageKey } from "@/lib/i18n";

/** "/en/distribution?month=2026-10" */
export const distributionHref = (locale: Locale, month?: string | null) => `/${locale}/distribution${month ? `?month=${month}` : ""}`;

export const entriesHref = (locale: Locale, month: string, type: "INCOME" | "EXPENSE") => `/${locale}/entries?period=${month}&type=${type}`;

const LINE_LABEL: Record<string, MessageKey> = {
  incomePaisa: "dist.income",
  expensePaisa: "dist.expense",
  reservePaisa: "dist.reserve",
  previousDeficitPaisa: "dist.prevDeficit",
  distributablePaisa: "dist.distributable",
  deficitCarriedPaisa: "dist.deficitCarried",
};

/** Label of a staircase line in the before → after table. */
export const lineLabel = (locale: Locale, key: string) => translator(locale)(LINE_LABEL[key] ?? "dist.distributable");

/** "2 Nov 2026" / "২ নভে, ২০২৬" — a date (or timestamp) shown as a Dhaka calendar date. */
export function formatDay(locale: Locale, iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" }).format(d);
}
