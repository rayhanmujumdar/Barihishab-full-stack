// Display helpers for the Reports screens and print views (client-safe).
import { changeBp } from "@/lib/accounting/reports";
import { toBanglaDigits, translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export type ReportTab = "monthly" | "yearly" | "rent-roll" | "expenses" | "funds";
export const REPORT_TABS: ReportTab[] = ["monthly", "yearly", "rent-roll", "expenses", "funds"];

type Query = Record<string, string | number | readonly string[] | undefined | null>;

function qs(q: Query): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const reportHref = (locale: Locale, tab: ReportTab, q: Query = {}) => `/${locale}/reports/${tab}${qs(q)}`;
export const printHref = (locale: Locale, tab: "monthly" | "yearly", q: Query = {}) => `/${locale}/reports/${tab}/print${qs(q)}`;
export const csvHref = (tab: "monthly" | "yearly", q: Query) => `/api/v1/reports/${tab}${qs({ ...q, format: "csv" })}`;

/** Basis points → whole percent ("45%" / "৪৫%"). */
export function bpPercent(locale: Locale, bp: number): string {
  // A share that rounds to 0 but isn't zero reads "<1%", never "0%".
  const text = bp > 0 && bp < 50 ? "<1%" : `${Math.round(bp / 100)}%`;
  return locale === "bn" ? toBanglaDigits(text) : text;
}

export const num = (locale: Locale, n: number) => (locale === "bn" ? toBanglaDigits(String(n)) : String(n));

/** "—" for zero so empty cells read as empty (G14). */
export const moneyOrDash = (locale: Locale, paisa: number | null | undefined) => (paisa ? formatMoney(locale, paisa) : "—");

export const entryCount = (locale: Locale, n: number) => {
  const tr = translator(locale);
  return n === 1 ? tr("rpt.entryCountOne") : tr("rpt.entryCount", { n: num(locale, n) });
};

/** "▲ up +৳2,300 (+57.5%)" — arrows and words, never colour alone (F8, Rule 12). */
export function changeText(locale: Locale, now: number, before: number): { arrow: "▲" | "▼" | "="; text: string } {
  const tr = translator(locale);
  const diff = now - before;
  if (diff === 0) return { arrow: "=", text: tr("rpt.same") };
  const bp = changeBp(now, before);
  const arrow = diff > 0 ? "▲" : "▼";
  const pct = bp === null ? "" : ` (${diff > 0 ? "+" : "−"}${(Math.abs(bp) / 100).toFixed(Math.abs(bp) % 100 === 0 ? 0 : 1)}%)`;
  const text = `${arrow} ${tr(diff > 0 ? "rpt.up" : "rpt.down")} ${diff > 0 ? "+" : "−"}${formatMoney(locale, Math.abs(diff))}${pct}`;
  return { arrow, text: locale === "bn" ? toBanglaDigits(text) : text };
}

/** Expense category hint only when the change is above 20% (F8). */
export function bigChange(now: number, before: number | null): number | null {
  if (before === null) return null;
  if (before === 0) return now > 0 ? now : null;
  return Math.abs(now - before) * 5 > before ? now - before : null;
}

/** Month initial for the phone chart ("J", "F" / "জা"). */
export function monthShort(locale: Locale, key: string): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

/** Month initial for phone-width chart labels (Reports F3: "month initials"). */
export function monthNarrow(locale: Locale, key: string): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "narrow", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

export const yearText = (locale: Locale, year: number) => num(locale, year);

/** Document title = the PDF file name Save as PDF proposes (F6): BariHisab-Monthly-2026-10[-DRAFT], BariHisab-Yearly-2026. */
export function reportDocTitle(kind: "monthly", r: { month: { key: string; status: "FINAL" | "DRAFT" } }): string;
export function reportDocTitle(kind: "yearly", r: { year: number }): string;
export function reportDocTitle(kind: "monthly" | "yearly", r: { month?: { key: string; status: "FINAL" | "DRAFT" }; year?: number }): string {
  if (kind === "yearly") return `BariHisab-Yearly-${r.year}`;
  return `BariHisab-Monthly-${r.month!.key}${r.month!.status === "DRAFT" ? "-DRAFT" : ""}`;
}
