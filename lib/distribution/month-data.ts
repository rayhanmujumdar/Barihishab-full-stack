// Loads one month's Distribution inputs and computes its figures with the
// pure module (design D3–D5). Used by the read model (preview or snapshot)
// and, inside the close transaction, to compute what gets posted — so the
// preview and the posted numbers come from the same code.
import {
  allocate,
  deductionByOwner,
  loanDeductions,
  staircase,
  type Allocation,
  type LoanDeduction,
  type Staircase,
} from "@/lib/accounting/distribution";
import { setInForce, totalUnits, unitsIn } from "@/lib/accounting/owners";
import { toPeriodTotals, type PeriodTotals } from "@/lib/accounting/totals";
import type { Prisma } from "@/lib/generated/prisma/client";
import { activeLoans, type LoanDto } from "@/lib/loans/loan-service";
import { loadShareSets } from "@/lib/owners/share-service";
import { monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { loadReserveSettings, ruleOf, type ReserveSettings } from "./reserve-service";
import { readSnapshot, type Snapshot } from "./snapshot";

export type Db = Prisma.TransactionClient | typeof prisma;

export type PeriodRow = {
  id: string;
  key: string;
  status: "OPEN" | "CLOSED";
  closedAt: Date | null;
  closedById: string | null;
  reopenCount: number;
  snapshot: Snapshot | null;
  overridePaisa: number | null;
  overrideReason: string | null;
};

/** Every period of the property, oldest first (a handful per year). */
export async function loadPeriods(db: Db, propertyId: string): Promise<PeriodRow[]> {
  const rows = await db.period.findMany({ where: { propertyId }, orderBy: { month: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    key: monthKey(p.month),
    status: p.status,
    closedAt: p.closedAt,
    closedById: p.closedById,
    reopenCount: p.reopenCount,
    snapshot: p.status === "CLOSED" ? readSnapshot(p.snapshot) : null,
    overridePaisa: p.reserveOverridePaisa === null ? null : Number(p.reserveOverridePaisa),
    overrideReason: p.reserveOverrideReason,
  }));
}

/** Income / expense / reserve-paid totals of one month (voided excluded). */
export async function periodTotals(db: Db, periodId: string): Promise<PeriodTotals> {
  const groups = await db.houseTransaction.groupBy({ by: ["kind", "fromReserve"], where: { periodId, voidedAt: null }, _sum: { amountPaisa: true }, _count: true });
  return toPeriodTotals(groups.map((g) => ({ kind: g.kind, fromReserve: g.fromReserve, sum: Number(g._sum.amountPaisa ?? 0), count: g._count })));
}

/**
 * Deficit carried into periods[index] (design D4): start from the nearest
 * month with a snapshot, then walk the months after it live.
 */
export async function previousDeficit(db: Db, periods: readonly PeriodRow[], index: number, settings: ReserveSettings): Promise<{ deficitPaisa: number; month: string | null }> {
  if (index === 0) return { deficitPaisa: 0, month: null };
  let start = index - 1;
  while (start >= 0 && !periods[start].snapshot) start--;
  let deficit = start >= 0 ? periods[start].snapshot!.deficitCarriedPaisa : 0;
  for (let i = start + 1; i < index; i++) {
    const t = await periodTotals(db, periods[i].id);
    deficit = staircase({ ...t, previousDeficitPaisa: deficit, rule: ruleOf(settings), overridePaisa: periods[i].overridePaisa }).deficitCarriedPaisa;
  }
  return { deficitPaisa: deficit, month: periods[index - 1].key };
}

export type OwnerLite = { id: string; userId: string | null; displayName: string; initials: string; avatarAttachmentId: string | null };

export async function loadOwners(db: Db, propertyId: string): Promise<OwnerLite[]> {
  const rows = await db.owner.findMany({
    where: { propertyId },
    select: { id: true, userId: true, displayName: true, initials: true, user: { select: { avatarAttachmentId: true } } },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
  });
  return rows.map(({ user, ...o }) => ({ ...o, avatarAttachmentId: user?.avatarAttachmentId ?? null }));
}

export type MonthFigures = {
  stair: Staircase;
  totals: PeriodTotals;
  previousDeficitMonth: string | null;
  settings: ReserveSettings;
  /** Units per owner for the month, in display order (0 for owners without units). */
  shares: { ownerId: string; name: string; units: number }[];
  totalUnits: number;
  entitlements: Allocation[];
  loans: LoanDto[];
  deductions: LoanDeduction[];
  skipped: { loanId: string; ownerId: string }[];
};

/** Live figures of a month: staircase, shares in force, entitlements and loan instalments. */
export async function computeMonth(db: Db, propertyId: string, periods: readonly PeriodRow[], index: number, owners: readonly OwnerLite[]): Promise<MonthFigures> {
  const period = periods[index];
  // Sequential on purpose: `db` may be a transaction client (one connection).
  const settings = await loadReserveSettings(db, propertyId);
  const totals = await periodTotals(db, period.id);
  const prev = await previousDeficit(db, periods, index, settings);
  const sets = await loadShareSets(db, propertyId);
  const loans = await activeLoans(db, propertyId);
  const stair = staircase({ ...totals, previousDeficitPaisa: prev.deficitPaisa, rule: ruleOf(settings), overridePaisa: period.overridePaisa });
  const set = setInForce(sets, period.key);
  const shares = owners.map((o) => ({ ownerId: o.id, name: o.displayName, units: unitsIn(set, o.id) }));
  const entitlements = allocate(stair.distributablePaisa, shares);
  const { deductions, skipped } = loanDeductions(entitlements, loans, period.key);
  return { stair, totals, previousDeficitMonth: prev.month, settings, shares, totalUnits: totalUnits(set), entitlements, loans, deductions, skipped };
}

/** The snapshot saved on close (design D1). */
export function buildSnapshot(f: MonthFigures, overrideReason: string | null): Snapshot {
  return {
    v: 1,
    incomePaisa: f.stair.incomePaisa,
    expensePaisa: f.stair.expensePaisa,
    reserveSpentPaisa: f.stair.reserveSpentPaisa,
    reservePaisa: f.stair.reservePaisa,
    reserveSource: f.stair.reserveSource,
    reserveRule: ruleOf(f.settings),
    overrideReason: f.stair.reserveSource === "OVERRIDE" ? overrideReason : null,
    previousDeficitPaisa: f.stair.previousDeficitPaisa,
    previousDeficitMonth: f.previousDeficitMonth,
    distributablePaisa: f.stair.distributablePaisa,
    deficitCarriedPaisa: f.stair.deficitCarriedPaisa,
    shares: f.shares.filter((s) => s.units > 0),
    entitlements: f.entitlements.filter((e) => e.amountPaisa > 0),
    loanDeductions: f.deductions.map((d) => ({ ownerId: d.ownerId, loanId: d.loanId, amountPaisa: d.amountPaisa })),
    skippedLoans: f.skipped,
  };
}

export const entitlementMap = (list: readonly Allocation[]) => new Map(list.map((e) => [e.ownerId, e.amountPaisa]));
export { deductionByOwner };
