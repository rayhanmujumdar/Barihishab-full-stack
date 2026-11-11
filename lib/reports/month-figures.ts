// Month figures for reports: a closed month's snapshot, else the same live
// staircase Distribution computes (Reports PRD Rules 1–2).
import { staircase } from "@/lib/accounting/distribution";
import { monthFigure, type MonthFigure } from "@/lib/accounting/reports";
import { loadPeriods, periodTotals, previousDeficit, type PeriodRow } from "@/lib/distribution/month-data";
import { loadReserveSettings, ruleOf, type ReserveSettings } from "@/lib/distribution/reserve-service";
import { prisma } from "@/lib/prisma";
import type { House, ReportStatus } from "./dto";

export { loadPeriods, type PeriodRow };

export const statusOf = (p: PeriodRow): ReportStatus => (p.status === "CLOSED" ? "FINAL" : "DRAFT");

/** Latest closed month, else the latest month (Reports F1 default). */
export function defaultMonth(periods: readonly PeriodRow[]): string | null {
  return periods.findLast((p) => p.status === "CLOSED")?.key ?? periods.at(-1)?.key ?? null;
}

export const yearsOf = (periods: readonly PeriodRow[]): number[] => [...new Set(periods.map((p) => Number(p.key.slice(0, 4))))].sort((a, b) => b - a);

/**
 * Figures of the given months that have a period, keyed by month. Live months
 * reuse the previous month's deficit when it was just computed, so a run of
 * open months costs one totals query each instead of re-walking the chain.
 */
export async function monthFigures(propertyId: string, periods: readonly PeriodRow[], keys: readonly string[]): Promise<Map<string, { status: ReportStatus; figure: MonthFigure }>> {
  const out = new Map<string, { status: ReportStatus; figure: MonthFigure }>();
  const carried = new Map<number, number>();
  let settings: ReserveSettings | null = null;
  const indexes = keys.map((k) => periods.findIndex((p) => p.key === k)).filter((i) => i !== -1).sort((a, b) => a - b);
  for (const index of indexes) {
    const p = periods[index];
    if (p.snapshot) {
      out.set(p.key, { status: statusOf(p), figure: monthFigure(p.snapshot) });
      carried.set(index, p.snapshot.deficitCarriedPaisa);
      continue;
    }
    settings ??= await loadReserveSettings(prisma, propertyId);
    const totals = await periodTotals(prisma, p.id);
    const prevDeficit = carried.has(index - 1) ? carried.get(index - 1)! : (await previousDeficit(prisma, periods, index, settings)).deficitPaisa;
    const s = staircase({ ...totals, previousDeficitPaisa: prevDeficit, rule: ruleOf(settings), overridePaisa: p.overridePaisa });
    out.set(p.key, { status: statusOf(p), figure: monthFigure(s) });
    carried.set(index, s.deficitCarriedPaisa);
  }
  return out;
}

export async function loadHouse(propertyId: string): Promise<House> {
  const p = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true, settings: true } });
  const address = (p.settings as { address?: unknown } | null)?.address;
  return { name: p.name, address: typeof address === "string" && address.trim() ? address : null };
}
