// Advance history and per-owner standing (Advances & Loans PRD F11, F13, F14;
// §7.5, §7.6). Statuses and limits are computed on read from the owner ledger.
import { advanceStatuses, type AdvanceStatus, type EntryOrigin } from "@/lib/accounting/loans";
import { advanceLimit } from "@/lib/accounting/owners";
import { todayIsoInDhaka } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { activeLoans } from "./loan-service";
import { loadAdvanceLimit } from "./settings-service";

export type AdvanceRowDto = {
  id: string;
  ownerId: string;
  ownerName: string;
  date: string;
  month: string;
  amountPaisa: number;
  reason: string | null;
  origin: EntryOrigin;
  isSelf: boolean;
  flagged: boolean;
  status: AdvanceStatus["status"];
  recoveredMonth: string | null;
  voidReason: string | null;
  ownerBalancePaisa: number;
};

export type AdvanceListDto = {
  advances: AdvanceRowDto[];
  summary: { advancesOutstandingPaisa: number; paidInYearPaisa: number; year: number; years: number[] };
  limit: { multiplierPct: number };
};

export type StandingDto = {
  ownerId: string;
  displayName: string;
  loanOutstandingPaisa: number;
  activeLoans: number;
  balancePaisa: number;
  advanceOutstandingPaisa: number;
  averageEntitlementPaisa: number | null;
  limitPaisa: number | null;
  limitUsedPct: number | null;
  lastAdvanceDate: string | null;
  /** Newest ACTIVE loan, for the "already has L{n}" hint (G9). */
  latestActiveLoan: { id: string; number: number; outstandingPaisa: number } | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Every ledger entry in posting month, then recording order. Recording order
 * (not the entry date) decides recovery: a payout can't exceed the balance when
 * it is recorded, so a back-dated advance entered after a full payout is still
 * money beyond what was owed (§7.6). Rows written in one transaction share a
 * timestamp (a payout split's PAYOUT + ADVANCE, a close's entitlement +
 * deduction): credits go first, other debits next, advances last.
 */
async function ledgerInOrder(propertyId: string) {
  const rows = await prisma.ownerLedgerEntry.findMany({
    where: { propertyId },
    select: { id: true, ownerId: true, type: true, amountPaisa: true, entryDate: true, createdAt: true, note: true, origin: true, isSelf: true, flagged: true, voidedAt: true, voidReason: true, period: { select: { month: true } } },
  });
  const rank = (e: (typeof rows)[number]) => (e.amountPaisa > BigInt(0) ? 0 : e.type === "ADVANCE" ? 2 : 1);
  return rows.sort(
    (a, b) =>
      a.period.month.getTime() - b.period.month.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || rank(a) - rank(b) || a.id.localeCompare(b.id),
  );
}

/** Non-voided entitlement totals per owner in the last 3 closed months (newest first). */
async function recentEntitlementsByOwner(propertyId: string): Promise<Map<string, number[]>> {
  const closed = await prisma.period.findMany({ where: { propertyId, status: "CLOSED" }, orderBy: { month: "desc" }, take: 3, select: { id: true } });
  const sums = closed.length
    ? await prisma.ownerLedgerEntry.groupBy({ by: ["ownerId", "periodId"], where: { propertyId, type: "ENTITLEMENT", voidedAt: null, periodId: { in: closed.map((p) => p.id) } }, _sum: { amountPaisa: true } })
    : [];
  const owners = await prisma.owner.findMany({ where: { propertyId }, select: { id: true } });
  return new Map(
    owners.map((o) => [o.id, closed.map((p) => Number(sums.find((s) => s.ownerId === o.id && s.periodId === p.id)?._sum.amountPaisa ?? 0))]),
  );
}

/** F11: advances newest first with Outstanding / Recovered in / Void; totals exclude voids (G5). */
export async function listAdvances(propertyId: string, filters: { ownerId?: string; year?: number } = {}): Promise<AdvanceListDto> {
  const year = filters.year ?? Number(todayIsoInDhaka().slice(0, 4));
  const [entries, owners, limit] = [await ledgerInOrder(propertyId), await prisma.owner.findMany({ where: { propertyId }, select: { id: true, displayName: true } }), await loadAdvanceLimit(prisma, propertyId)];
  const names = new Map(owners.map((o) => [o.id, o.displayName]));
  const balances = new Map<string, number>();
  const statuses = new Map<string, AdvanceStatus>();
  for (const o of owners) {
    const mine = entries.filter((e) => e.ownerId === o.id);
    balances.set(o.id, mine.reduce((s, e) => s + Number(e.amountPaisa), 0));
    const s = advanceStatuses(mine.map((e) => ({ id: e.id, type: e.type, amountPaisa: Number(e.amountPaisa), month: iso(e.period.month).slice(0, 7), voided: e.voidedAt !== null })));
    for (const [id, st] of s) statuses.set(id, st);
  }
  const all = entries.filter((e) => e.type === "ADVANCE");
  const yearOf = (e: (typeof all)[number]) => e.entryDate.getUTCFullYear();
  const advances = all
    .filter((e) => (!filters.ownerId || e.ownerId === filters.ownerId) && yearOf(e) === year)
    .reverse()
    // Listed newest date first (ties: last recorded first).
    .sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())
    .map((e): AdvanceRowDto => {
      const st = statuses.get(e.id) ?? { status: "OUTSTANDING", recoveredMonth: null };
      return {
        id: e.id,
        ownerId: e.ownerId,
        ownerName: names.get(e.ownerId) ?? "",
        date: iso(e.entryDate),
        month: iso(e.period.month).slice(0, 7),
        amountPaisa: -Number(e.amountPaisa),
        reason: e.note,
        origin: e.origin,
        isSelf: e.isSelf,
        flagged: e.flagged,
        status: st.status,
        recoveredMonth: st.recoveredMonth,
        voidReason: e.voidReason,
        ownerBalancePaisa: balances.get(e.ownerId) ?? 0,
      };
    });
  return {
    advances,
    summary: {
      advancesOutstandingPaisa: [...balances.values()].reduce((s, b) => s + Math.max(0, -b), 0),
      paidInYearPaisa: all.filter((e) => !e.voidedAt && yearOf(e) === year).reduce((s, e) => s - Number(e.amountPaisa), 0),
      year,
      years: [...new Set(all.map(yearOf))].sort((a, b) => b - a),
    },
    limit,
  };
}

/** F13: each owner's loans, advance outstanding and advance limit use. */
export async function standingByOwner(propertyId: string): Promise<{ owners: StandingDto[]; multiplierPct: number }> {
  const owners = await prisma.owner.findMany({ where: { propertyId }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }], select: { id: true, displayName: true } });
  const { multiplierPct } = await loadAdvanceLimit(prisma, propertyId);
  const balances = await prisma.ownerLedgerEntry.groupBy({ by: ["ownerId"], where: { propertyId }, _sum: { amountPaisa: true } });
  const lastAdvance = await prisma.ownerLedgerEntry.groupBy({ by: ["ownerId"], where: { propertyId, type: "ADVANCE", voidedAt: null }, _max: { entryDate: true } });
  const loans = await activeLoans(prisma, propertyId);
  const recent = await recentEntitlementsByOwner(propertyId);
  return {
    multiplierPct,
    owners: owners.map((o) => {
      const balance = Number(balances.find((b) => b.ownerId === o.id)?._sum.amountPaisa ?? 0);
      const months = recent.get(o.id) ?? [];
      const mine = loans.filter((l) => l.ownerId === o.id);
      const limit = advanceLimit(months, multiplierPct);
      const advanceOutstanding = Math.max(0, -balance);
      const last = lastAdvance.find((l) => l.ownerId === o.id)?._max.entryDate;
      return {
        ownerId: o.id,
        displayName: o.displayName,
        loanOutstandingPaisa: mine.reduce((sum, l) => sum + l.outstandingPaisa, 0),
        activeLoans: mine.length,
        balancePaisa: balance,
        advanceOutstandingPaisa: advanceOutstanding,
        averageEntitlementPaisa: advanceLimit(months),
        limitPaisa: limit,
        limitUsedPct: limit ? Math.round((advanceOutstanding * 100) / limit) : null,
        lastAdvanceDate: last ? iso(last) : null,
        latestActiveLoan: mine.length ? { id: mine.at(-1)!.id, number: mine.at(-1)!.number, outstandingPaisa: mine.at(-1)!.outstandingPaisa } : null,
      };
    }),
  };
}
