// Monthly report (Reports PRD F2, F8; RPT-01, RPT-04). Wraps the Distribution
// read model (design D1) so the staircase and owner table match it by
// construction, then adds categories, entries, notes and comparisons.
import { categoryRows, type CategoryGroup } from "@/lib/accounting/reports";
import { getDistribution, unpaidUnitsIn } from "@/lib/distribution/distribution-service";
import { addMonths } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { toCsv, taka, type CsvValue } from "./csv";
import type { CompareFigure, MonthlyReportDto, MonthlyResult, OwnerRow, OwnerTotals, ReportCategory, ReportEntry } from "./dto";
import { defaultMonth, loadHouse, loadPeriods, monthFigures } from "./month-figures";

type Txn = Awaited<ReturnType<typeof loadEntries>>[number];

function loadEntries(periodId: string) {
  return prisma.houseTransaction.findMany({
    where: { periodId, voidedAt: null },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      amountPaisa: true,
      txnDate: true,
      description: true,
      vendor: true,
      fromReserve: true,
      category: { select: { id: true, code: true, nameEn: true, nameBn: true, sortOrder: true } },
      unit: { select: { name: true } },
      fundAccount: { select: { name: true } },
    },
  });
}

async function billsOf(ids: string[]) {
  if (!ids.length) return new Map<string, ReportEntry["attachments"]>();
  const rows = await prisma.attachment.findMany({
    where: { entityType: "house_transaction", entityId: { in: ids }, removedAt: null, isPrivate: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, entityId: true, fileName: true, mime: true },
  });
  const map = new Map<string, ReportEntry["attachments"]>();
  for (const r of rows) map.set(r.entityId!, [...(map.get(r.entityId!) ?? []), { id: r.id, fileName: r.fileName, mime: r.mime }]);
  return map;
}

function toEntry(t: Txn, bills: Map<string, ReportEntry["attachments"]>): ReportEntry {
  return {
    id: t.id,
    date: t.txnDate.toISOString().slice(0, 10),
    description: t.description,
    vendor: t.vendor,
    unitName: t.unit?.name ?? null,
    fundName: t.fundAccount.name,
    amountPaisa: Number(t.amountPaisa),
    fromReserve: t.fromReserve,
    attachments: bills.get(t.id) ?? [],
  };
}

function categoriesOf(txns: Txn[], kind: "INCOME" | "EXPENSE", bills: Map<string, ReportEntry["attachments"]>, previous: Map<string, number> | null): ReportCategory[] {
  const groups = new Map<string, CategoryGroup & { entries: ReportEntry[] }>();
  for (const t of txns) {
    if (t.kind !== kind) continue;
    const c = t.category;
    const g = groups.get(c.id) ?? { categoryId: c.id, code: c.code, nameEn: c.nameEn, nameBn: c.nameBn, sortOrder: c.sortOrder, amountPaisa: 0, count: 0, entries: [] };
    g.amountPaisa += Number(t.amountPaisa);
    g.count += 1;
    g.entries.push(toEntry(t, bills));
    groups.set(c.id, g);
  }
  return categoryRows([...groups.values()], kind).map(({ sortOrder: _s, ...r }) => ({
    ...r,
    previousPaisa: kind === "EXPENSE" && previous ? (previous.get(r.categoryId) ?? 0) : null,
  }));
}

async function previousExpenseByCategory(periodId: string | undefined): Promise<Map<string, number> | null> {
  if (!periodId) return null;
  const groups = await prisma.houseTransaction.groupBy({ by: ["categoryId"], where: { periodId, kind: "EXPENSE", voidedAt: null }, _sum: { amountPaisa: true } });
  return new Map(groups.map((g) => [g.categoryId, Number(g._sum.amountPaisa ?? 0)]));
}

/** `undefined` = unknown month; `{ month: null }` = no months at all. */
export async function monthlyReport(propertyId: string, month: string | null): Promise<MonthlyResult | undefined> {
  const periods = await loadPeriods(prisma, propertyId);
  const key = month ?? defaultMonth(periods);
  if (key === null) return { month: null };
  const period = periods.find((p) => p.key === key);
  if (!period) return undefined;
  const dist = await getDistribution(propertyId, key, null);
  if (!dist || dist.month === null) return undefined;

  const lastMonthKey = addMonths(key, -1);
  const lastYearKey = addMonths(key, -12);
  const [txns, unpaid, house, figures, previous] = await Promise.all([
    loadEntries(period.id),
    unpaidUnitsIn(propertyId, period.id),
    loadHouse(propertyId),
    monthFigures(propertyId, periods, [lastMonthKey, lastYearKey]),
    previousExpenseByCategory(periods.find((p) => p.key === lastMonthKey)?.id),
  ]);
  const bills = await billsOf(txns.map((t) => t.id));

  const s = dist.staircase;
  const expensesAll = s.expensePaisa + s.reserveSpentPaisa;
  const rows: OwnerRow[] = dist.rows.map((r) => ({
    ownerId: r.ownerId,
    displayName: r.displayName,
    initials: r.initials,
    units: r.units,
    sharePercent: r.sharePercent,
    openingPaisa: r.openingPaisa,
    entitlementPaisa: r.entitlementPaisa,
    receivedPaisa: r.receivedPaisa,
    advancePaisa: r.advancePaisa,
    loanDeductionPaisa: r.loanDeductionPaisa,
    otherPaisa: r.otherPaisa,
    balancePaisa: r.balancePaisa,
    balanceLabel: r.balanceLabel,
    loanOutstandingPaisa: r.loanOutstandingPaisa,
  }));
  const sum = (k: keyof OwnerTotals) => rows.reduce((acc, r) => acc + r[k], 0);
  const totals: OwnerTotals = {
    openingPaisa: sum("openingPaisa"),
    ...dist.totals,
    balancePaisa: sum("balancePaisa"),
    loanOutstandingPaisa: sum("loanOutstandingPaisa"),
  };
  const compare = (k: string): CompareFigure | null => {
    const f = figures.get(k);
    return f ? { key: k, status: f.status, incomePaisa: f.figure.incomePaisa, expensesAllPaisa: f.figure.expensesAllPaisa, distributablePaisa: f.figure.distributablePaisa } : null;
  };
  const lastReopen = dist.reopens[0];

  const report: MonthlyReportDto = {
    house,
    month: { key, status: dist.month.status === "CLOSED" ? "FINAL" : "DRAFT", closedAt: dist.month.closedAt, closedBy: dist.month.closedBy },
    months: dist.months,
    summary: { incomePaisa: s.incomePaisa, expensesAllPaisa: expensesAll, distributablePaisa: s.distributablePaisa, deficitCarriedPaisa: s.deficitCarriedPaisa },
    income: { totalPaisa: s.incomePaisa, count: txns.filter((t) => t.kind === "INCOME").length, categories: categoriesOf(txns, "INCOME", bills, null) },
    expenses: { totalPaisa: expensesAll, fromReservePaisa: s.reserveSpentPaisa, count: txns.filter((t) => t.kind === "EXPENSE").length, categories: categoriesOf(txns, "EXPENSE", bills, previous) },
    staircase: {
      incomePaisa: s.incomePaisa,
      expensesCountedPaisa: s.expensePaisa,
      reserveSpentPaisa: s.reserveSpentPaisa,
      reservePaisa: s.reservePaisa,
      reserveSource: s.reserveSource,
      previousDeficitPaisa: s.previousDeficitPaisa,
      previousDeficitMonth: s.previousDeficitMonth,
      distributablePaisa: s.distributablePaisa,
      deficitCarriedPaisa: s.deficitCarriedPaisa,
    },
    owners: { rows, totals },
    notes: {
      reopen: lastReopen ? { at: lastReopen.at, reason: lastReopen.reason } : null,
      overrideReason: s.reserveSource === "OVERRIDE" ? dist.reserve.overrideReason : null,
      unpaidUnits: unpaid,
      deficit: s.deficitCarriedPaisa > 0 ? { amountPaisa: s.deficitCarriedPaisa, nextMonth: addMonths(key, 1) } : null,
    },
    compare: { lastMonth: compare(lastMonthKey), lastYear: compare(lastYearKey) },
    empty: txns.length === 0,
  };
  return report;
}

// ─── CSV (F7) ───

export const monthlyFileName = (r: Pick<MonthlyReportDto, "month">, ext: "csv" | "pdf") => `BariHisab-Monthly-${r.month.key}${r.month.status === "DRAFT" ? "-DRAFT" : ""}.${ext}`;

/** Every entry of the month, oldest first: one row per entry. */
export function monthlyCsv(r: MonthlyReportDto): string {
  const status = r.month.status === "FINAL" ? "Final" : "Draft";
  const rows: { date: string; cells: CsvValue[] }[] = [];
  for (const [type, side] of [
    ["Income", r.income],
    ["Expense", r.expenses],
  ] as const) {
    for (const c of side.categories) {
      for (const e of c.entries) {
        rows.push({ date: e.date, cells: [e.date, type, c.nameEn, e.description, e.vendor, e.unitName, e.fundName, e.fromReserve ? "Yes" : "No", taka(e.amountPaisa), status] });
      }
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return toCsv([["Date", "Type", "Category", "Description", "Vendor", "Unit", "Fund account", "From reserve", "Amount", "Status"], ...rows.map((x) => x.cells)]);
}
