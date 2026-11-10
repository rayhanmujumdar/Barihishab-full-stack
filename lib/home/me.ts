// The viewer's own money on Home (Home PRD F2, F3, F4, G3, G14). Every figure
// comes from the rule its detail page uses (Rule 2): the balance from the
// owner ledger, the month figures from the Distribution board row maths.
import { cache } from "react";
import { boardRows, deductionByOwner } from "@/lib/accounting/distribution";
import { balanceLabel, sharePercent, type BalanceLabel } from "@/lib/accounting/owners";
import { entitlementMap } from "@/lib/distribution/month-data";
import { activeLoans } from "@/lib/loans/loan-service";
import { balancesByOwner } from "@/lib/owners/owner-service";
import { monthDate } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { homeMonth, type HomeMonth } from "./month";

export type MeDto = {
  ownerId: string;
  balancePaisa: number;
  balanceLabel: BalanceLabel;
  /** Share % in force for the Home month; null without units. */
  sharePercent: number | null;
  /** The viewer's preview entitlement for an open month; null when closed or no share. */
  entitlementPreviewPaisa: number | null;
  receivedPaisa: number;
  advancesPaisa: number;
  loanOutstandingPaisa: number;
  /** The active loan to mention in the hero (G14). */
  loan: { number: number; outstandingPaisa: number; nextDeductionPaisa: number | null; nextDeductionMonth: string | null } | null;
};

export type MyRequestDto = {
  id: string;
  type: "ADVANCE" | "LOAN" | "GRANT";
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED";
  amountRequestedPaisa: number;
  amountApprovedPaisa: number | null;
  /** A decided request shown once, until the owner opens Requests. */
  once: boolean;
};

/** The owner record linked to this login, if any. */
export const viewerOwnerId = cache(async (propertyId: string, userId: string): Promise<string | null> => {
  const owner = await prisma.owner.findFirst({ where: { propertyId, userId }, select: { id: true } });
  return owner?.id ?? null;
});

export async function meFigures(propertyId: string, userId: string, month?: HomeMonth): Promise<MeDto | null> {
  const ownerId = await viewerOwnerId(propertyId, userId);
  if (!ownerId) return null;
  const [m, balances, loans] = await Promise.all([month ?? homeMonth(propertyId), balancesByOwner(prisma, propertyId, [ownerId]), activeLoans(prisma, propertyId, [ownerId])]);
  const balance = balances.get(ownerId) ?? 0;
  const loanOutstanding = loans.reduce((sum, l) => sum + l.outstandingPaisa, 0);
  const base = { ownerId, balancePaisa: balance, balanceLabel: balanceLabel(balance), loanOutstandingPaisa: loanOutstanding };
  const ctx = m.ctx;
  if (!ctx || !m.month) return { ...base, sharePercent: null, entitlementPreviewPaisa: null, receivedPaisa: 0, advancesPaisa: 0, loan: loanLine(loans, [], null) };

  const open = m.month.open;
  const units = ctx.shares.find((s) => s.ownerId === ownerId)?.units ?? 0;
  const total = ctx.shares.reduce((sum, s) => sum + s.units, 0);
  const [entries, opening] = await Promise.all([
    prisma.ownerLedgerEntry.findMany({ where: { periodId: ctx.period.id, ownerId }, select: { id: true, ownerId: true, type: true, amountPaisa: true, reversesId: true, voidedAt: true } }),
    prisma.ownerLedgerEntry.aggregate({ where: { propertyId, ownerId, period: { month: { lt: monthDate(ctx.period.key) } } }, _sum: { amountPaisa: true } }),
  ]);
  const deductions = open && ctx.live ? ctx.live.deductions : [];
  const { rows } = boardRows({
    status: open ? "OPEN" : "CLOSED",
    owners: [{ ownerId, units, openingPaisa: Number(opening._sum.amountPaisa ?? 0), currentBalancePaisa: balance, loanOutstandingPaisa: loanOutstanding }],
    monthEntries: entries.map((e) => ({ id: e.id, ownerId: e.ownerId, type: e.type, amountPaisa: Number(e.amountPaisa), reversesId: e.reversesId, voided: e.voidedAt !== null })),
    entitlements: entitlementMap(open && ctx.live ? ctx.live.entitlements : []),
    deductions: deductionByOwner(deductions),
  });
  const row = rows[0];
  return {
    ...base,
    sharePercent: units > 0 ? sharePercent(units, total) : null,
    entitlementPreviewPaisa: open && units > 0 ? (row?.entitlementPaisa ?? 0) : null,
    receivedPaisa: row?.receivedPaisa ?? 0,
    advancesPaisa: row?.advancePaisa ?? 0,
    loan: loanLine(loans, deductions, open ? ctx.period.key : null),
  };
}

/** Prefer the loan with an instalment in the open month's preview; else the oldest active loan. */
function loanLine(
  loans: readonly { id: string; number: number; outstandingPaisa: number }[],
  deductions: readonly { loanId: string; amountPaisa: number }[],
  month: string | null,
): MeDto["loan"] {
  if (!loans.length) return null;
  const byLoan = new Map(deductions.map((d) => [d.loanId, d.amountPaisa]));
  const loan = loans.find((l) => byLoan.has(l.id)) ?? loans[0];
  const next = byLoan.get(loan.id) ?? null;
  return { number: loan.number, outstandingPaisa: loan.outstandingPaisa, nextDeductionPaisa: next, nextDeductionMonth: next === null ? null : month };
}

const toRequestDto = (r: { id: string; type: MyRequestDto["type"]; status: string; amountRequestedPaisa: bigint; amountApprovedPaisa: bigint | null }, once: boolean): MyRequestDto => ({
  id: r.id,
  type: r.type,
  status: r.status as MyRequestDto["status"],
  amountRequestedPaisa: Number(r.amountRequestedPaisa),
  amountApprovedPaisa: r.amountApprovedPaisa === null ? null : Number(r.amountApprovedPaisa),
  once,
});

const REQUEST_SELECT = { id: true, type: true, status: true, amountRequestedPaisa: true, amountApprovedPaisa: true } as const;

/** Newest PENDING/APPROVED request, else an unseen REJECTED/DISBURSED decision shown once (F4). */
export async function myRequest(propertyId: string, ownerId: string): Promise<MyRequestDto | null> {
  const open = await prisma.moneyRequest.findFirst({ where: { propertyId, ownerId, status: { in: ["PENDING", "APPROVED"] } }, orderBy: { createdAt: "desc" }, select: REQUEST_SELECT });
  if (open) return toRequestDto(open, false);
  const decided = await prisma.moneyRequest.findFirst({
    where: { propertyId, ownerId, status: { in: ["REJECTED", "DISBURSED"] }, decisionUnseen: true },
    orderBy: { updatedAt: "desc" },
    select: REQUEST_SELECT,
  });
  return decided ? toRequestDto(decided, true) : null;
}
