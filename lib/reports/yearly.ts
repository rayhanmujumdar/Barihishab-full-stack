// Yearly report (Reports PRD F3; RPT-02). Closed months come from their
// snapshots, open months are computed live; owner figures sum the ledger.
import { balanceLabel, setInForce, sharePercent, totalUnits, unitsIn } from "@/lib/accounting/owners";
import { categoryRows, ownerYearFigures, shareBp, shareChanges, yearTotals, type CategoryGroup } from "@/lib/accounting/reports";
import { loadOwners } from "@/lib/distribution/month-data";
import { loanOutstandingByOwner } from "@/lib/loans/loan-service";
import { balancesByOwner } from "@/lib/owners/owner-service";
import { loadShareSets } from "@/lib/owners/share-service";
import { currentMonthKey, monthDate } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { taka, toCsv, type CsvValue } from "./csv";
import type { OwnerYearRow, YearlyReportDto, YearMonthColumn } from "./dto";
import { defaultMonth, loadHouse, loadPeriods, monthFigures, yearsOf } from "./month-figures";

export const yearMonths = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

async function topCategories(periodIds: string[]): Promise<YearlyReportDto["topExpenseCategories"]> {
  if (!periodIds.length) return [];
  const groups = await prisma.houseTransaction.groupBy({ by: ["categoryId"], where: { periodId: { in: periodIds }, kind: "EXPENSE", voidedAt: null }, _sum: { amountPaisa: true }, _count: true });
  const cats = await prisma.category.findMany({ where: { id: { in: groups.map((g) => g.categoryId) } } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const rows: CategoryGroup[] = groups.map((g) => {
    const c = byId.get(g.categoryId)!;
    return { categoryId: c.id, code: c.code, nameEn: c.nameEn, nameBn: c.nameBn, sortOrder: c.sortOrder, amountPaisa: Number(g._sum.amountPaisa ?? 0), count: g._count };
  });
  const total = rows.reduce((s, r) => s + r.amountPaisa, 0);
  return categoryRows(rows, "EXPENSE")
    .slice(0, 5)
    .map((r) => ({ categoryId: r.categoryId, code: r.code, nameEn: r.nameEn, nameBn: r.nameBn, amountPaisa: r.amountPaisa, shareBp: shareBp(r.amountPaisa, total) }));
}

async function ownerTable(propertyId: string, year: number, periodIds: string[]): Promise<YearlyReportDto["owners"]> {
  const [owners, sets, balances, loans, before, entries] = await Promise.all([
    loadOwners(prisma, propertyId),
    loadShareSets(prisma, propertyId),
    balancesByOwner(prisma, propertyId),
    loanOutstandingByOwner(prisma, propertyId),
    prisma.ownerLedgerEntry.groupBy({ by: ["ownerId"], where: { propertyId, period: { month: { lt: monthDate(`${year}-01`) } } }, _sum: { amountPaisa: true } }),
    periodIds.length
      ? prisma.ownerLedgerEntry.findMany({ where: { propertyId, periodId: { in: periodIds } }, select: { ownerId: true, type: true, amountPaisa: true, reverses: { select: { type: true } } } })
      : Promise.resolve([]),
  ]);
  const figures = ownerYearFigures(
    owners.map((o) => o.id),
    new Map(before.map((g) => [g.ownerId, Number(g._sum.amountPaisa ?? 0)])),
    entries.map((e) => ({ ownerId: e.ownerId, type: e.type, amountPaisa: Number(e.amountPaisa), reversedType: e.reverses?.type ?? null })),
  );
  const now = setInForce(sets, currentMonthKey());
  const total = totalUnits(now);
  const rows: OwnerYearRow[] = owners.map((o) => {
    const f = figures.get(o.id)!;
    const units = unitsIn(now, o.id);
    const balanceNowPaisa = balances.get(o.id) ?? 0;
    return {
      ownerId: o.id,
      displayName: o.displayName,
      unitsNow: units,
      sharePercentNow: units > 0 ? sharePercent(units, total) : null,
      shareChanges: shareChanges(sets, year, o.id),
      openingPaisa: f.openingPaisa,
      entitlementPaisa: f.entitlementPaisa,
      paidOutPaisa: f.paidOutPaisa,
      advancesPaisa: f.advancesPaisa,
      loanDeductionPaisa: f.loanDeductionPaisa,
      otherPaisa: f.otherPaisa,
      balanceNowPaisa,
      balanceLabel: balanceLabel(balanceNowPaisa),
      loanOutstandingPaisa: loans.get(o.id) ?? 0,
    };
  });
  const sum = (k: keyof YearlyReportDto["owners"]["totals"]) => rows.reduce((s, r) => s + r[k], 0);
  return {
    rows,
    totals: {
      openingPaisa: sum("openingPaisa"),
      entitlementPaisa: sum("entitlementPaisa"),
      paidOutPaisa: sum("paidOutPaisa"),
      advancesPaisa: sum("advancesPaisa"),
      loanDeductionPaisa: sum("loanDeductionPaisa"),
      otherPaisa: sum("otherPaisa"),
      balanceNowPaisa: sum("balanceNowPaisa"),
      loanOutstandingPaisa: sum("loanOutstandingPaisa"),
    },
  };
}

/** `year` null → the year of the latest closed month, else of the latest month, else this year. */
export async function yearlyReport(propertyId: string, year: number | null): Promise<YearlyReportDto> {
  const periods = await loadPeriods(prisma, propertyId);
  const y = year ?? Number((defaultMonth(periods) ?? currentMonthKey()).slice(0, 4));
  const keys = yearMonths(y);
  const inYear = periods.filter((p) => p.key.startsWith(`${y}-`));
  const ids = inYear.map((p) => p.id);
  const [figures, top, owners, house] = await Promise.all([monthFigures(propertyId, periods, keys), topCategories(ids), ownerTable(propertyId, y, ids), loadHouse(propertyId)]);
  const months: YearMonthColumn[] = keys.map((k) => {
    const f = figures.get(k);
    return f ? { month: k, status: f.status, figure: f.figure } : { month: k, status: "NONE", figure: null };
  });
  return { house, year: y, years: yearsOf(periods), empty: inYear.length === 0, months, totals: yearTotals(months), topExpenseCategories: top, owners };
}

// ─── CSV (F7) ───

export const yearlyFileName = (r: Pick<YearlyReportDto, "year">, ext: "csv" | "pdf") => `BariHisab-Yearly-${r.year}.${ext}`;

const pct = (n: number | null) => (n === null ? "" : n.toFixed(2));

/** Month table (+ closed-months total), a blank line, then the owner year table. */
export function yearlyCsv(r: YearlyReportDto): string {
  const STATUS = { FINAL: "Final", DRAFT: "Draft", NONE: "None" } as const;
  const rows: CsvValue[][] = [["Month", "Status", "Income", "Expenses (all)", "From reserve", "Reserve kept", "Deficit carried", "Distributable"]];
  for (const c of r.months) {
    const f = c.figure;
    rows.push(f ? [c.month, STATUS[c.status], taka(f.incomePaisa), taka(f.expensesAllPaisa), taka(f.fromReservePaisa), taka(f.reservePaisa), taka(f.deficitCarriedPaisa), taka(f.distributablePaisa)] : [c.month, STATUS[c.status], "", "", "", "", "", ""]);
  }
  const t = r.totals.closed;
  rows.push(["Total (closed months)", "", taka(t.incomePaisa), taka(t.expensesAllPaisa), taka(t.fromReservePaisa), taka(t.reservePaisa), "", taka(t.distributablePaisa)]);
  rows.push([]);
  rows.push(["Owner", "Units now", "Share now %", "Opening", "Entitlement", "Paid out", "Advances", "Loan deductions", "Other", "Balance now", "Loan outstanding"]);
  const money = (o: { openingPaisa: number; entitlementPaisa: number; paidOutPaisa: number; advancesPaisa: number; loanDeductionPaisa: number; otherPaisa: number; balanceNowPaisa: number; loanOutstandingPaisa: number }) =>
    [o.openingPaisa, o.entitlementPaisa, o.paidOutPaisa, o.advancesPaisa, o.loanDeductionPaisa, o.otherPaisa, o.balanceNowPaisa, o.loanOutstandingPaisa].map(taka);
  for (const o of r.owners.rows) rows.push([o.displayName, o.unitsNow, pct(o.sharePercentNow), ...money(o)]);
  rows.push(["Total", "", "", ...money(r.owners.totals)]);
  return toCsv(rows);
}
