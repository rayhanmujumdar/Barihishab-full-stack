// Chart tokens for Reports (design system §5 Charts): flat bars, no radius, no
// gridlines, income = ink, expense = the one yellow, 2px ink baseline. SVG
// attributes can't read CSS variables, so the token values are mirrored here.
// Print turns the yellow grey (black on white, Reports PRD F5).
import { toBanglaDigits, type Locale } from "@/lib/i18n";

export const INK = "#201e1d";
export const SIGNAL = "#F4C300";
/** Olive edge on yellow marks: the yellow alone is under 3:1 on paper. */
export const SIGNAL_EDGE = "#5a4500";
export const PRINT_GREY = "#bdbdbd";
export const MUTED = "#605d5d";
export const NEUTRAL = "#9b9797";

export type ChartPalette = { income: string; expense: string; expenseEdge: string };
export const palette = (print: boolean): ChartPalette => ({ income: INK, expense: print ? PRINT_GREY : SIGNAL, expenseEdge: print ? "#7d7979" : SIGNAL_EDGE });

/** A4 content width for print; screen charts size to their container. */
export const PRINT_WIDTH = 680;

export const AXIS_TICK = { fill: MUTED, fontSize: 11, fontWeight: 600 } as const;

/** Axis money: ৳1.25L / ৳12K / ৳1.2Cr (lakh/crore, Bangla digits in bn). */
export function compactMoney(locale: Locale, paisa: number): string {
  const taka = Math.abs(paisa) / 100;
  const sign = paisa < 0 ? "−" : "";
  const fmt = (n: number) => String(Number(n.toFixed(n >= 10 ? 0 : 1)));
  const [value, unit] = taka >= 1e7 ? [taka / 1e7, locale === "bn" ? " কো" : "Cr"] : taka >= 1e5 ? [taka / 1e5, locale === "bn" ? " লা" : "L"] : taka >= 1e3 ? [taka / 1e3, locale === "bn" ? " হা" : "K"] : [taka, ""];
  const text = `${sign}৳${fmt(value)}${unit}`;
  return locale === "bn" ? toBanglaDigits(text) : text;
}
