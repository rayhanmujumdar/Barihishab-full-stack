// Report query parameters (Reports PRD F1, F7, F10, F11), shared by the API
// routes and the pages so both accept exactly the same values.
import { z } from "zod";
import { MonthKeySchema } from "@/lib/api/money-schemas";
import { addMonths } from "@/lib/periods/month";

/** Longest Expense-analysis range (F10). */
export const MAX_RANGE_MONTHS = 36;

export const YearSchema = z
  .string()
  .regex(/^(20\d\d|2100)$/, "Use a year from 2000 to 2100")
  .meta({ example: "2026" });

const Format = z.enum(["json", "csv"]).optional().meta({ description: "`csv` downloads the report as CSV (F7); default JSON" });

export const MonthlyQuerySchema = z.object({
  month: MonthKeySchema.optional().meta({ description: "Default: the latest closed month, else the latest month" }),
  format: Format,
});

export const YearlyQuerySchema = z.object({
  year: YearSchema.optional().meta({ description: "Default: the year of the latest closed month, else of the latest month" }),
  format: Format,
});

export const RentRollQuerySchema = z.object({ year: YearSchema.optional().meta({ description: "Default: as Yearly" }) });

/** Months from `from` to `to`, inclusive. */
export function monthSpan(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5)) + 1;
}

export function monthsBetween(from: string, to: string): string[] {
  return Array.from({ length: Math.max(0, monthSpan(from, to)) }, (_, i) => addMonths(from, i));
}

export const ExpensesQuerySchema = z
  .object({
    from: MonthKeySchema,
    to: MonthKeySchema,
    categoryId: z.array(z.uuid()).max(50).default([]).meta({ description: "Repeat or comma-separate to filter by expense categories" }),
  })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "'To' must be on or after 'From'." })
  .refine((q) => q.from > q.to || monthSpan(q.from, q.to) <= MAX_RANGE_MONTHS, { path: ["to"], message: `Choose ${MAX_RANGE_MONTHS} months or fewer.` });

export const FundsQuerySchema = z
  .object({ month: MonthKeySchema.optional(), year: YearSchema.optional() })
  .refine((q) => (q.month === undefined) !== (q.year === undefined), { path: ["month"], message: "Give either a month or a year." });

/** Query string → object; `multi` keys collect every value (repeated or comma-separated). */
export function queryObject(url: string | URL, multi: readonly string[] = []): Record<string, string | string[]> {
  const sp = new URL(url).searchParams;
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of sp.entries()) if (!multi.includes(k)) out[k] = v;
  for (const k of multi) {
    const all = sp.getAll(k).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    if (all.length) out[k] = all;
  }
  return out;
}
