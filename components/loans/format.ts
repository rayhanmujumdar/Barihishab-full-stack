// Display helpers for the Advances & loans screens (client-safe).
import { toBanglaDigits, translator, type Locale, type MessageKey } from "@/lib/i18n";
import type { HistoryRow } from "./types";

export const loanLabel = (locale: Locale, n: number) => translator(locale)("al.loanNo", { n });

/** 50 → "0.5×", 150 → "1.5×" (bn digits in বাংলা). */
export function multiplierText(locale: Locale, pct: number): string {
  const text = `${pct / 100}×`;
  return locale === "bn" ? toBanglaDigits(text) : text;
}

export const pctText = (locale: Locale, pct: number) => (locale === "bn" ? toBanglaDigits(`${pct}%`) : `${pct}%`);

/** "Repaid in cash", "Instalment skipped — no entitlement in September 2026." … */
export function movementText(locale: Locale, m: Pick<HistoryRow, "kind" | "month">, monthLabelText: string): string {
  const tr = translator(locale);
  return m.kind === "SKIPPED" ? tr("al.mv.SKIPPED", { month: monthLabelText }) : tr(`al.mv.${m.kind}` as MessageKey);
}

/** "2026-10-12" → "12 Oct 2026" / "১২ অক্টো, ২০২৬". */
export function shortDate(locale: Locale, isoDate: string): string {
  const text = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
  return locale === "bn" ? toBanglaDigits(text) : text;
}

/** Builds /{lang}/advances?… keeping only non-empty params. */
export function advancesHref(locale: Locale, q: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)]));
  const qs = sp.toString();
  return `/${locale}/advances${qs ? `?${qs}` : ""}`;
}
