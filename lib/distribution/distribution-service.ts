// Distribution read model (Distribution PRD F1–F4, F7, F8, F15; DST-01, DST-05).
// Open month → live preview; closed month → its snapshot only (Rule 6).
import { openComplaintCountForMonth } from "@/lib/complaints/questioned";
import { attachmentFileUrl } from "@/lib/attachments/file-url";
import {
  boardRows,
  closeChecks,
  diffSnapshots,
  unpaidUnits,
  type BoardTotals,
  type MustPassCode,
  type SnapshotFigures,
  type Staircase,
  type WarningCode,
} from "@/lib/accounting/distribution";
import { balanceLabel, sharePercent, type BalanceLabel } from "@/lib/accounting/owners";
import { activeLoans } from "@/lib/loans/loan-service";
import { balancesByOwner } from "@/lib/owners/owner-service";
import { addMonths, currentMonthKey, monthDate } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { computeMonth, deductionByOwner, entitlementMap, loadOwners, loadPeriods, type MonthFigures, type OwnerLite, type PeriodRow } from "./month-data";
import { reserveBalance, type ReserveSettings } from "./reserve-service";
import { readSnapshot, type Snapshot } from "./snapshot";

const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;
const firstName = (n: string) => n.split(/\s+/)[0] ?? n;

export type BoardRowDto = {
  ownerId: string;
  displayName: string;
  initials: string;
  /** Linked login's profile photo (same-origin URL), or null → show initials. */
  avatarUrl: string | null;
  isViewer: boolean;
  units: number;
  sharePercent: number | null;
  openingPaisa: number;
  entitlementPaisa: number;
  receivedPaisa: number;
  advancePaisa: number;
  loanDeductionPaisa: number;
  otherPaisa: number;
  balancePaisa: number;
  balanceLabel: BalanceLabel;
  afterClosePaisa: number | null;
  loanOutstandingPaisa: number;
};

export type ChangesDto = {
  lines: { key: string; beforePaisa: number; afterPaisa: number; diffPaisa: number }[];
  owners: { ownerId: string; displayName: string; beforePaisa: number; afterPaisa: number; diffPaisa: number }[];
};

export type DistributionDto = {
  month: {
    key: string;
    status: "OPEN" | "CLOSED";
    closedBy: string | null;
    closedAt: string | null;
    reopenCount: number;
    isLatestClosed: boolean;
    mustCloseFirst: string | null;
    firstMonth: boolean;
  };
  months: { key: string; status: "OPEN" | "CLOSED" }[];
  staircase: Omit<Staircase, "netPaisa" | "reserveSource"> & { reserveSource: "RULE" | "OVERRIDE"; previousDeficitMonth: string | null };
  reserve: { rule: ReserveSettings | Snapshot["reserveRule"]; overridePaisa: number | null; overrideReason: string | null; balancePaisa: number };
  rows: BoardRowDto[];
  totals: BoardTotals;
  footer: { sumEntitlementsPaisa: number; distributablePaisa: number; balanced: boolean; shares: { name: string; units: number }[]; rounding: "largest-remainder" };
  skippedLoans: { ownerId: string; displayName: string }[];
  reopens: { at: string; by: string; reason: string }[];
  changes: ChangesDto | null;
  paidAfterClose: { items: { ownerId: string; displayName: string; type: "PAYOUT" | "ADVANCE"; amountPaisa: number; date: string }[]; totalPaisa: number } | null;
};

export type DistributionResult = DistributionDto | { month: null };

/** The month to show without `?month=`: the oldest open month (it must close next, F1). */
function defaultIndex(periods: readonly PeriodRow[]): number {
  const open = periods.findIndex((p) => p.status === "OPEN");
  return open === -1 ? periods.length - 1 : open;
}

const snapshotFigures = (s: Snapshot): SnapshotFigures => s;
const previewFigures = (f: MonthFigures): SnapshotFigures => ({ ...f.stair, entitlements: f.entitlements.filter((e) => e.amountPaisa > 0) });

function changesDto(before: Snapshot | null, after: SnapshotFigures, names: Map<string, string>): ChangesDto | null {
  if (!before) return null;
  const d = diffSnapshots(snapshotFigures(before), after);
  return { lines: d.lines, owners: d.owners.map((o) => ({ ...o, displayName: names.get(o.ownerId) ?? "" })) };
}

type Loaded = { periods: PeriodRow[]; index: number; owners: OwnerLite[]; names: Map<string, string> };

async function load(propertyId: string, month: string | null): Promise<Loaded | null> {
  const [periods, owners] = await Promise.all([loadPeriods(prisma, propertyId), loadOwners(prisma, propertyId)]);
  if (periods.length === 0) return null;
  const index = month === null ? defaultIndex(periods) : periods.findIndex((p) => p.key === month);
  if (index === -1) return null;
  return { periods, index, owners, names: new Map(owners.map((o) => [o.id, o.displayName])) };
}

/** Where a month's figures come from: its snapshot when closed, else live (also for months closed before Distribution). */
type Source = { period: PeriodRow; closed: boolean; snap: Snapshot | null; live: MonthFigures | null };

const sharesOf = (src: Source) => (src.snap ? src.snap.shares : src.live!.shares);

/** Owner board rows and totals (F3, §7.3). */
async function boardFor(propertyId: string, src: Source, owners: OwnerLite[], viewerId: string | null): Promise<{ rows: BoardRowDto[]; totals: BoardTotals }> {
  const { period, closed, live } = src;
  const [monthEntries, openings, balances, loans] = await Promise.all([
    prisma.ownerLedgerEntry.findMany({ where: { periodId: period.id }, select: { id: true, ownerId: true, type: true, amountPaisa: true, reversesId: true, voidedAt: true } }),
    prisma.ownerLedgerEntry.groupBy({ by: ["ownerId"], where: { propertyId, period: { month: { lt: monthDate(period.key) } } }, _sum: { amountPaisa: true } }),
    balancesByOwner(prisma, propertyId),
    live ? live.loans : activeLoans(prisma, propertyId),
  ]);
  const loanByOwner = new Map<string, number>();
  for (const loan of loans) loanByOwner.set(loan.ownerId, (loanByOwner.get(loan.ownerId) ?? 0) + loan.outstandingPaisa);
  const opening = new Map(openings.map((g) => [g.ownerId, Number(g._sum.amountPaisa ?? 0)]));
  const shares = sharesOf(src);
  const unitsBy = new Map(shares.map((x) => [x.ownerId, x.units]));
  const total = shares.reduce((sum, x) => sum + x.units, 0);
  const board = boardRows({
    status: closed ? "CLOSED" : "OPEN",
    owners: owners.map((o) => ({
      ownerId: o.id,
      units: unitsBy.get(o.id) ?? 0,
      openingPaisa: opening.get(o.id) ?? 0,
      currentBalancePaisa: balances.get(o.id) ?? 0,
      loanOutstandingPaisa: loanByOwner.get(o.id) ?? 0,
    })),
    monthEntries: monthEntries.map((e) => ({ id: e.id, ownerId: e.ownerId, type: e.type, amountPaisa: Number(e.amountPaisa), reversesId: e.reversesId, voided: e.voidedAt !== null })),
    entitlements: entitlementMap(live?.entitlements ?? []),
    deductions: deductionByOwner(live?.deductions ?? []),
  });
  const byId = new Map(owners.map((o) => [o.id, o]));
  const rows = board.rows.map((r) => {
    const o = byId.get(r.ownerId)!;
    return {
      ...r,
      displayName: o.displayName,
      initials: o.initials,
      avatarUrl: o.avatarAttachmentId ? attachmentFileUrl(o.avatarAttachmentId) : null,
      isViewer: viewerId !== null && o.userId === viewerId,
      sharePercent: r.units > 0 ? sharePercent(r.units, total) : null,
      balanceLabel: balanceLabel(r.balancePaisa),
    };
  });
  return { rows, totals: board.totals };
}

function staircaseDto(src: Source): DistributionDto["staircase"] {
  const s = src.snap ?? src.live!.stair;
  return {
    incomePaisa: s.incomePaisa,
    expensePaisa: s.expensePaisa,
    reserveSpentPaisa: s.reserveSpentPaisa,
    surplusPaisa: s.incomePaisa - s.expensePaisa,
    reservePaisa: s.reservePaisa,
    reserveSource: s.reserveSource,
    previousDeficitPaisa: s.previousDeficitPaisa,
    previousDeficitMonth: src.snap ? src.snap.previousDeficitMonth : src.live!.previousDeficitMonth,
    distributablePaisa: s.distributablePaisa,
    deficitCarriedPaisa: s.deficitCarriedPaisa,
  };
}

function reserveDto(src: Source, balancePaisa: number): DistributionDto["reserve"] {
  const { snap, period } = src;
  if (snap) return { rule: snap.reserveRule, overridePaisa: snap.reserveSource === "OVERRIDE" ? snap.reservePaisa : null, overrideReason: snap.overrideReason, balancePaisa };
  return { rule: src.live!.settings, overridePaisa: period.overridePaisa, overrideReason: period.overrideReason, balancePaisa };
}

function footerDto(src: Source, totals: BoardTotals): DistributionDto["footer"] {
  const distributablePaisa = (src.snap ?? src.live!.stair).distributablePaisa;
  // Closed: what was actually posted; open: the preview split.
  const sumEntitlementsPaisa = src.closed ? totals.entitlementPaisa : src.live!.entitlements.reduce((sum, e) => sum + e.amountPaisa, 0);
  return {
    sumEntitlementsPaisa,
    distributablePaisa,
    balanced: sumEntitlementsPaisa === distributablePaisa,
    shares: sharesOf(src)
      .filter((x) => x.units > 0)
      .map((x) => ({ name: firstName(x.name), units: x.units })),
    rounding: "largest-remainder",
  };
}

/** Instalments skipped: from the snapshot, or the preview for an open month — never invented for a month closed without one. */
function skippedOf(src: Source): { ownerId: string; loanId: string }[] {
  if (src.snap) return src.snap.skippedLoans;
  return src.closed ? [] : src.live!.skipped;
}

/** `undefined` = unknown month, `{ month: null }` = no months at all. */
export async function getDistribution(propertyId: string, month: string | null, viewerId: string | null): Promise<DistributionResult | undefined> {
  const l = await load(propertyId, month);
  if (!l) return month === null ? { month: null } : undefined;
  const { periods, index, owners, names } = l;
  const period = periods[index];
  const closed = period.status === "CLOSED";
  const snap = period.snapshot;
  const src: Source = { period, closed, snap, live: closed && snap ? null : await computeMonth(prisma, propertyId, periods, index, owners) };
  const laterClosed = periods.slice(index + 1).some((p) => p.status === "CLOSED");

  const [board, closer, reopens, reserveBal, paid] = await Promise.all([
    boardFor(propertyId, src, owners, viewerId),
    closed && period.closedById ? prisma.user.findUnique({ where: { id: period.closedById }, ...NAME }) : null,
    prisma.periodReopen.findMany({ where: { periodId: period.id }, orderBy: { reopenedAt: "desc" }, include: { reopenedBy: NAME } }),
    reserveBalance(prisma, propertyId),
    closed && !laterClosed && period.closedAt ? paidAfterClose(propertyId, period.closedAt, names) : null,
  ]);
  const lastReopen = reopens[0];

  return {
    month: {
      key: period.key,
      status: period.status,
      closedBy: closer ? displayName(closer) : null,
      closedAt: closed ? (period.closedAt?.toISOString() ?? null) : null,
      reopenCount: period.reopenCount,
      isLatestClosed: closed && !laterClosed,
      mustCloseFirst: closed ? null : (periods.slice(0, index).find((p) => p.status === "OPEN")?.key ?? null),
      firstMonth: index === 0,
    },
    months: [...periods].reverse().map((p) => ({ key: p.key, status: p.status })),
    staircase: staircaseDto(src),
    reserve: reserveDto(src, reserveBal),
    rows: board.rows,
    totals: board.totals,
    footer: footerDto(src, board.totals),
    skippedLoans: skippedOf(src).map((x) => ({ ownerId: x.ownerId, displayName: names.get(x.ownerId) ?? "" })),
    reopens: reopens.map((r) => ({ at: r.reopenedAt.toISOString(), by: displayName(r.reopenedBy), reason: r.reason })),
    changes:
      period.reopenCount > 0 && lastReopen
        ? changesDto(readSnapshot(lastReopen.snapshotBefore), snap ? snapshotFigures(snap) : previewFigures(src.live!), names)
        : null,
    paidAfterClose: paid,
  };
}

async function paidAfterClose(propertyId: string, closedAt: Date, names: Map<string, string>) {
  const rows = await prisma.ownerLedgerEntry.findMany({
    where: { propertyId, type: { in: ["PAYOUT", "ADVANCE"] }, voidedAt: null, createdAt: { gt: closedAt } },
    orderBy: { createdAt: "asc" },
    select: { ownerId: true, type: true, amountPaisa: true, entryDate: true },
  });
  const items = rows.map((r) => ({
    ownerId: r.ownerId,
    displayName: names.get(r.ownerId) ?? "",
    type: r.type as "PAYOUT" | "ADVANCE",
    amountPaisa: -Number(r.amountPaisa),
    date: r.entryDate.toISOString().slice(0, 10),
  }));
  return { items, totalPaisa: items.reduce((s, i) => s + i.amountPaisa, 0) };
}

// ─── Close preview (F5, G1, G2) ───

export type ClosePreviewDto = {
  month: string;
  reopenCount: number;
  canClose: boolean;
  mustPass: { code: MustPassCode; ok: boolean; month?: string | null }[];
  warnings: { code: WarningCode; units?: { name: string; tenantName: string | null }[]; count?: number; nextMonth?: string; reserveAfterClosePaisa?: number }[];
  whatHappens: {
    entitlementCount: number;
    entitlementTotalPaisa: number;
    ownerCount: number;
    deductions: { ownerId: string; displayName: string; amountPaisa: number }[];
    skipped: { ownerId: string; displayName: string }[];
    nextMonthOpens: string | null;
  };
  changes: ChangesDto | null;
};

type UnitRef = { name: string; tenantName: string | null };

/** Active units with rent but no income entry in the period (F5 warning, F14 reminder). */
export async function unpaidUnitsIn(propertyId: string, periodId: string): Promise<UnitRef[]> {
  const [units, paid] = await Promise.all([
    prisma.unit.findMany({ where: { propertyId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.houseTransaction.findMany({ where: { periodId, kind: "INCOME", voidedAt: null, unitId: { not: null } }, select: { unitId: true } }),
  ]);
  return unpaidUnits(
    units.map((u) => ({ ...u, rentPaisa: Number(u.rentPaisa) })),
    new Set(paid.map((p) => p.unitId!)),
  ).map((u) => ({ name: u.name, tenantName: u.tenantName }));
}

/** Non-voided expenses of the period with no live attachment. */
async function expensesWithoutBill(periodId: string): Promise<number> {
  const expenses = await prisma.houseTransaction.findMany({ where: { periodId, kind: "EXPENSE", voidedAt: null }, select: { id: true } });
  if (!expenses.length) return 0;
  const billed = await prisma.attachment.groupBy({ by: ["entityId"], where: { entityType: "house_transaction", entityId: { in: expenses.map((e) => e.id) }, removedAt: null } });
  return expenses.length - billed.length;
}

/** Checklist, warnings and "What happens" for an open month; `undefined` for an unknown month. */
export async function getClosePreview(propertyId: string, month: string): Promise<ClosePreviewDto | undefined> {
  const l = await load(propertyId, month);
  if (!l) return undefined;
  const { periods, index, owners, names } = l;
  const period = periods[index];
  const f = await computeMonth(prisma, propertyId, periods, index, owners);
  const [unpaid, missingBills, reserveBal, lastReopen, openComplaints] = await Promise.all([
    unpaidUnitsIn(propertyId, period.id),
    expensesWithoutBill(period.id),
    reserveBalance(prisma, propertyId),
    prisma.periodReopen.findFirst({ where: { periodId: period.id }, orderBy: { reopenedAt: "desc" } }),
    // Every visibility: the closer is the Super Admin (period.close).
    openComplaintCountForMonth(propertyId, { userId: "", viewAll: true }, period.key),
  ]);
  const reserveAfterClose = reserveBal + f.stair.reservePaisa;
  const sumEntitlements = f.entitlements.reduce((sum, e) => sum + e.amountPaisa, 0);
  const ownerCount = f.shares.filter((x) => x.units > 0).length;
  const prevOpen = periods.slice(0, index).find((p) => p.status === "OPEN")?.key ?? null;
  const next = addMonths(period.key, 1);
  const checks = closeChecks({
    totalUnits: f.totalUnits,
    ownersWithUnits: ownerCount,
    previousOpenMonth: prevOpen,
    sumEntitlementsPaisa: sumEntitlements,
    distributablePaisa: f.stair.distributablePaisa,
    isOpen: period.status === "OPEN",
    incomeCount: f.totals.incomeCount,
    unpaidUnitCount: unpaid.length,
    expensesWithoutBill: missingBills,
    monthOver: currentMonthKey() > period.key,
    reserveAfterClosePaisa: reserveAfterClose,
    openComplaints,
  });
  const detail: Partial<Record<WarningCode, Omit<ClosePreviewDto["warnings"][number], "code">>> = {
    UNPAID_RENT: { units: unpaid },
    MISSING_BILLS: { count: missingBills },
    MONTH_NOT_OVER: { nextMonth: next },
    RESERVE_NEGATIVE: { reserveAfterClosePaisa: reserveAfterClose },
    OPEN_COMPLAINTS: { count: openComplaints },
  };
  return {
    month: period.key,
    reopenCount: period.reopenCount,
    canClose: checks.canClose,
    mustPass: checks.mustPass.map((c) => (c.code === "PREVIOUS_CLOSED" ? { ...c, month: prevOpen ?? (index > 0 ? periods[index - 1].key : null) } : c)),
    warnings: checks.warnings.map((code) => ({ code, ...detail[code] })),
    whatHappens: {
      entitlementCount: f.entitlements.filter((e) => e.amountPaisa > 0).length,
      entitlementTotalPaisa: sumEntitlements,
      ownerCount,
      deductions: f.deductions.map((d) => ({ ownerId: d.ownerId, displayName: names.get(d.ownerId) ?? "", amountPaisa: d.amountPaisa })),
      skipped: f.skipped.map((x) => ({ ownerId: x.ownerId, displayName: names.get(x.ownerId) ?? "" })),
      nextMonthOpens: periods.some((p) => p.key === next) ? null : next,
    },
    changes: period.reopenCount > 0 && lastReopen ? changesDto(readSnapshot(lastReopen.snapshotBefore), previewFigures(f), names) : null,
  };
}

// ─── Home close reminder (F14 P1) ───

export type CloseReminder = { month: string; unpaid: UnitRef[] };

/** The oldest open month earlier than the current Dhaka month, with its unpaid units; null when none. */
export async function closeReminder(propertyId: string): Promise<CloseReminder | null> {
  const period = await prisma.period.findFirst({ where: { propertyId, status: "OPEN", month: { lt: monthDate(currentMonthKey()) } }, orderBy: { month: "asc" } });
  if (!period) return null;
  return { month: period.month.toISOString().slice(0, 7), unpaid: await unpaidUnitsIn(propertyId, period.id) };
}
