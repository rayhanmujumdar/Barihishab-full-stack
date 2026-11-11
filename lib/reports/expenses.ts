// Expense analysis over a month range (Reports PRD F10, G12). Sums, groups and
// the top list are computed by the database; only small grouped rows come back.
import { categoryRows, shareBp, type CategoryGroup } from "@/lib/accounting/reports";
import type { Prisma } from "@/lib/generated/prisma/client";
import { monthDate, monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import type { ExpenseAnalysisDto } from "./dto";
import { loadHouse } from "./month-figures";
import { monthsBetween } from "./params";

const TOP = 10;
const paisa = (v: bigint | null | undefined) => Number(v ?? 0);

export async function expenseAnalysis(propertyId: string, from: string, to: string, categoryIds: readonly string[]): Promise<ExpenseAnalysisDto> {
  const where: Prisma.HouseTransactionWhereInput = {
    propertyId,
    kind: "EXPENSE",
    voidedAt: null,
    period: { month: { gte: monthDate(from), lte: monthDate(to) } },
    ...(categoryIds.length ? { categoryId: { in: [...categoryIds] } } : {}),
  };
  const [all, reserve, byCat, byVendor, byPeriod, top, categories, periods, house] = await Promise.all([
    prisma.houseTransaction.aggregate({ where, _sum: { amountPaisa: true }, _count: true }),
    prisma.houseTransaction.aggregate({ where: { ...where, fromReserve: true }, _sum: { amountPaisa: true } }),
    prisma.houseTransaction.groupBy({ by: ["categoryId"], where, _sum: { amountPaisa: true }, _count: true }),
    prisma.houseTransaction.groupBy({ by: ["vendor"], where, _sum: { amountPaisa: true }, _count: true }),
    prisma.houseTransaction.groupBy({ by: categoryIds.length ? ["periodId", "categoryId"] : ["periodId"], where, _sum: { amountPaisa: true } }),
    prisma.houseTransaction.findMany({
      where,
      orderBy: [{ amountPaisa: "desc" }, { txnDate: "desc" }],
      take: TOP,
      select: { id: true, amountPaisa: true, txnDate: true, description: true, vendor: true, period: { select: { month: true } }, category: { select: { nameEn: true, nameBn: true } } },
    }),
    prisma.category.findMany({ where: { propertyId, kind: "EXPENSE" }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, code: true, nameEn: true, nameBn: true, sortOrder: true } }),
    prisma.period.findMany({ where: { propertyId, month: { gte: monthDate(from), lte: monthDate(to) } }, select: { id: true, month: true } }),
    loadHouse(propertyId),
  ]);
  const totalPaisa = paisa(all._sum.amountPaisa);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const groups: CategoryGroup[] = byCat.map((g) => {
    const c = catById.get(g.categoryId)!;
    return { categoryId: c.id, code: c.code, nameEn: c.nameEn, nameBn: c.nameBn, sortOrder: c.sortOrder, amountPaisa: paisa(g._sum.amountPaisa), count: g._count };
  });

  // Same vendor typed with different case or spaces is one vendor; blank = no vendor.
  const vendors = new Map<string, { vendor: string | null; amountPaisa: number; count: number }>();
  for (const g of byVendor) {
    const name = g.vendor?.trim() || null;
    const key = name?.toLocaleLowerCase() ?? "";
    const v = vendors.get(key) ?? { vendor: name, amountPaisa: 0, count: 0 };
    v.amountPaisa += paisa(g._sum.amountPaisa);
    v.count += g._count;
    vendors.set(key, v);
  }

  const monthOf = new Map(periods.map((p) => [p.id, monthKey(p.month)]));
  const trend = new Map(monthsBetween(from, to).map((m) => [m, { month: m, amounts: {} as Record<string, number>, totalPaisa: 0 }]));
  for (const g of byPeriod as { periodId: string; categoryId?: string; _sum: { amountPaisa: bigint | null } }[]) {
    const t = trend.get(monthOf.get(g.periodId) ?? "");
    if (!t) continue;
    const amount = paisa(g._sum.amountPaisa);
    t.totalPaisa += amount;
    if (g.categoryId) t.amounts[g.categoryId] = (t.amounts[g.categoryId] ?? 0) + amount;
  }

  return {
    house,
    from,
    to,
    categoryIds: [...categoryIds],
    totalPaisa,
    fromReservePaisa: paisa(reserve._sum.amountPaisa),
    count: all._count,
    byCategory: categoryRows(groups, "EXPENSE").map(({ sortOrder: _s, ...r }) => ({ ...r, shareBp: shareBp(r.amountPaisa, totalPaisa) })),
    topVendors: [...vendors.values()].sort((a, b) => b.amountPaisa - a.amountPaisa || b.count - a.count).slice(0, TOP),
    trend: [...trend.values()],
    topExpenses: top.map((i) => ({
      id: i.id,
      date: i.txnDate.toISOString().slice(0, 10),
      month: monthKey(i.period.month),
      categoryNameEn: i.category.nameEn,
      categoryNameBn: i.category.nameBn,
      description: i.description,
      vendor: i.vendor,
      amountPaisa: paisa(i.amountPaisa),
    })),
    categories: categories.map(({ sortOrder: _s, ...c }) => c),
  };
}
