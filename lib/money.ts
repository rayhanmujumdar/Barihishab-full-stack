// Money is integer paisa everywhere (Income & Expenses PRD §3.8, §8).
// Pure and client-safe: used by API validation and the entry form alike.
import { toBanglaDigits, type Locale } from "@/lib/i18n";

/** ৳1 crore — the largest single entry allowed. */
export const MAX_AMOUNT_PAISA = 1_000_000_000;

const BN_ZERO = "০".charCodeAt(0);

/**
 * "৳১৮,০০০.৫০" → 1800050. Strips ৳, spaces and commas, maps Bangla digits,
 * allows ≤ 2 decimals and converts with integer math. Null when invalid,
 * not positive, or above MAX_AMOUNT_PAISA.
 */
export function parseAmount(input: string): number | null {
  const s = input
    .replace(/[৳,\s]/g, "")
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BN_ZERO));
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paisa = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return paisa > 0 && paisa <= MAX_AMOUNT_PAISA ? paisa : null;
}

/** 14500000 → "1,45,000" (last three digits, then pairs). */
function lakhGroup(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${head},${digits.slice(-3)}`;
}

/** "৳1,45,000" / "৳১,৪৫,০০০"; paisa shown only when non-zero; "−৳2,300" when negative. */
export function formatMoney(locale: Locale, paisa: number): string {
  const abs = Math.abs(paisa);
  const rest = abs % 100;
  const text = `৳${lakhGroup(String(Math.floor(abs / 100)))}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
  const signed = paisa < 0 ? `−${text}` : text;
  return locale === "bn" ? toBanglaDigits(signed) : signed;
}

/** 630050 → "6300.50" for prefilling an amount input. */
export function paisaToInput(paisa: number): string {
  const rest = paisa % 100;
  return `${Math.floor(paisa / 100)}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}
