// Rent roll (Reports PRD F9, G10): units × months of a year.
import { rentRoll } from "@/lib/accounting/reports";
import { currentMonthKey, monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import type { RentRollDto } from "./dto";
import { defaultMonth, loadHouse, loadPeriods, statusOf, yearsOf } from "./month-figures";
import { yearMonths } from "./yearly";

export async function rentRollReport(propertyId: string, year: number | null): Promise<RentRollDto> {
  const periods = await loadPeriods(prisma, propertyId);
  const y = year ?? Number((defaultMonth(periods) ?? currentMonthKey()).slice(0, 4));
  const keys = yearMonths(y);
  const byKey = new Map(periods.map((p) => [p.key, p]));
  const ids = periods.filter((p) => p.key.startsWith(`${y}-`)).map((p) => p.id);
  const [units, incomes, house] = await Promise.all([
    prisma.unit.findMany({ where: { propertyId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    ids.length
      ? prisma.houseTransaction.findMany({
          // Booked in the year, or paying for one of its months from a later year.
          where: { OR: [{ periodId: { in: ids } }, { referencePeriodId: { in: ids } }], kind: "INCOME", voidedAt: null, unitId: { not: null } },
          orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
          select: { id: true, unitId: true, amountPaisa: true, period: { select: { month: true } }, referencePeriod: { select: { month: true } } },
        })
      : Promise.resolve([]),
    loadHouse(propertyId),
  ]);
  const roll = rentRoll(
    units.map((u) => ({ id: u.id, name: u.name, tenantName: u.tenantName, rentPaisa: Number(u.rentPaisa), isActive: u.isActive, addedIn: currentMonthKey(u.createdAt) })),
    keys.map((key) => ({ key, hasPeriod: byKey.has(key) })),
    incomes.map((i) => ({ id: i.id, unitId: i.unitId!, month: monthKey(i.period.month), referenceMonth: i.referencePeriod ? monthKey(i.referencePeriod.month) : null, amountPaisa: Number(i.amountPaisa) })),
  );
  return {
    house,
    year: y,
    years: yearsOf(periods),
    rows: roll.rows,
    months: roll.months.map((m) => {
      const p = byKey.get(m.key);
      return { ...m, status: p ? statusOf(p) : "NONE" };
    }),
  };
}
