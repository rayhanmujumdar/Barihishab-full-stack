// Home's current month (Home PRD Rule 1, G1, F7, F12): the latest OPEN month,
// else the latest CLOSED one. Memoised per request so the hero, "this month"
// and the staircase blocks share one computation (design D1).
import { cache } from "react";
import { computeMonth, loadOwners, loadPeriods, type MonthFigures, type OwnerLite, type PeriodRow } from "@/lib/distribution/month-data";
import type { Snapshot } from "@/lib/distribution/snapshot";
import { prisma } from "@/lib/prisma";

export type HouseStair = {
  incomePaisa: number;
  expensePaisa: number;
  reservePaisa: number;
  previousDeficitPaisa: number;
  distributablePaisa: number;
};

export type HomeMonthDto = { key: string; open: boolean; firstMonth: boolean };

/** Internal inputs other Home loaders reuse. */
export type MonthContext = {
  period: PeriodRow;
  owners: OwnerLite[];
  /** Live figures (open months, or closed months without a snapshot). */
  live: MonthFigures | null;
  snap: Snapshot | null;
  /** Units per owner for the month. */
  shares: { ownerId: string; units: number }[];
};

export type HomeMonth = { houseName: string; month: HomeMonthDto | null; staircase: HouseStair | null; ctx: MonthContext | null };

function homeIndex(periods: readonly PeriodRow[]): number {
  for (let i = periods.length - 1; i >= 0; i--) if (periods[i].status === "OPEN") return i;
  return periods.length - 1;
}

export const homeMonth = cache(async (propertyId: string): Promise<HomeMonth> => {
  const [property, periods, owners] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true } }),
    loadPeriods(prisma, propertyId),
    loadOwners(prisma, propertyId),
  ]);
  if (periods.length === 0) return { houseName: property.name, month: null, staircase: null, ctx: null };
  const index = homeIndex(periods);
  const period = periods[index];
  const open = period.status === "OPEN";
  const snap = open ? null : period.snapshot;
  const live = snap ? null : await computeMonth(prisma, propertyId, periods, index, owners);
  const s = snap ?? live!.stair;
  return {
    houseName: property.name,
    month: { key: period.key, open, firstMonth: !periods.some((p) => p.status === "CLOSED") },
    staircase: {
      incomePaisa: s.incomePaisa,
      expensePaisa: s.expensePaisa,
      reservePaisa: s.reservePaisa,
      previousDeficitPaisa: s.previousDeficitPaisa,
      distributablePaisa: s.distributablePaisa,
    },
    ctx: { period, owners, live, snap, shares: (snap ? snap.shares : live!.shares).map((x) => ({ ownerId: x.ownerId, units: x.units })) },
  };
});
