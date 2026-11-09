// Display helpers for the Owners screens (client-safe).
import { toBanglaDigits, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { BalanceLabel, LedgerType } from "./types";

/** 40 → "40%", 33.333 → "33.3%" (Rule 2: display only; money uses units). */
export function percent(locale: Locale, value: number): string {
  const text = `${Number(value.toFixed(1))}%`;
  return locale === "bn" ? toBanglaDigits(text) : text;
}

export const num = (locale: Locale, n: number) => (locale === "bn" ? toBanglaDigits(String(n)) : String(n));

/** Colour is always paired with a word (Rule 22). */
export function balanceText(locale: Locale, label: BalanceLabel, paisa: number): { word: string; amount: string } {
  const tr = translator(locale);
  return { word: tr(`owners.balance.${label}` as MessageKey), amount: label === "SETTLED" ? "" : formatMoney(locale, Math.abs(paisa)) };
}

export const balanceTone = (paisa: number) => (paisa > 0 ? "pos" : paisa < 0 ? "neg" : "zero");

export const typeLabel = (locale: Locale, type: LedgerType) => translator(locale)(`st.type.${type}` as MessageKey);

/** Signed money with an explicit + for credits ("+৳34,777.60", "−৳5,000"). */
export const signedMoney = (locale: Locale, paisa: number) => (paisa > 0 ? `+${formatMoney(locale, paisa)}` : formatMoney(locale, paisa));

export const ownerHref = (locale: Locale, id: string, q: Record<string, string | number | undefined> = {}) => {
  const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  const qs = sp.toString();
  return `/${locale}/owners/${id}${qs ? `?${qs}` : ""}`;
};
