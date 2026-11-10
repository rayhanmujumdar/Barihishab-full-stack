// Home "Latest activity" (Home PRD F8, Rule 5, Rule 6; design D6): the newest
// six non-voided money events of the house, the same list for every viewer.
import { ACTIVITY_LIMIT, mergeActivity } from "@/lib/accounting/activity";
import type { PayMethod } from "@/lib/generated/prisma/client";
import { monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";

export type ActivityKind = "INCOME" | "EXPENSE" | "PAYOUT" | "ADVANCE" | "LOAN" | "REPAYMENT";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  date: string;
  createdAt: string;
  /** Income/expense category; null for owner events. */
  category: { nameEn: string; nameBn: string } | null;
  /** Owner of a payout, advance, loan or repayment. */
  owner: { id: string; name: string } | null;
  description: string | null;
  method: PayMethod | null;
  reference: string | null;
  /** Signed: + money in, − money out of the fund. */
  amountPaisa: number;
  /** Period month (links to Income & Expenses). */
  month: string;
  /** House transaction id for the entry detail; null for owner events. */
  entryId: string | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const take = ACTIVITY_LIMIT;
const NEWEST = [{ createdAt: "desc" as const }];

export async function latestActivity(propertyId: string): Promise<ActivityItem[]> {
  const [txns, ledger, loans, repayments] = await Promise.all([
    prisma.houseTransaction.findMany({
      where: { propertyId, voidedAt: null },
      orderBy: [{ txnDate: "desc" }, ...NEWEST],
      take,
      select: { id: true, kind: true, txnDate: true, createdAt: true, amountPaisa: true, description: true, vendor: true, category: { select: { nameEn: true, nameBn: true } }, period: { select: { month: true } } },
    }),
    prisma.ownerLedgerEntry.findMany({
      where: { propertyId, voidedAt: null, type: { in: ["PAYOUT", "ADVANCE"] } },
      orderBy: [{ entryDate: "desc" }, ...NEWEST],
      take,
      select: { id: true, type: true, entryDate: true, createdAt: true, amountPaisa: true, method: true, referenceNo: true, owner: { select: { id: true, displayName: true } }, period: { select: { month: true } } },
    }),
    prisma.loan.findMany({
      where: { propertyId, status: { not: "CANCELLED" } },
      orderBy: [{ disbursedOn: "desc" }, ...NEWEST],
      take,
      select: { id: true, disbursedOn: true, createdAt: true, principalPaisa: true, method: true, referenceNo: true, owner: { select: { id: true, displayName: true } } },
    }),
    prisma.loanMovement.findMany({
      where: { propertyId, type: "CASH_REPAYMENT", voidedAt: null },
      orderBy: [{ movementDate: "desc" }, ...NEWEST],
      take,
      select: { id: true, movementDate: true, createdAt: true, amountPaisa: true, method: true, referenceNo: true, loan: { select: { owner: { select: { id: true, displayName: true } } } }, period: { select: { month: true } } },
    }),
  ]);
  const none = { category: null, owner: null, description: null, method: null, reference: null, entryId: null };
  return mergeActivity<ActivityItem>([
    txns.map((t) => ({
      ...none,
      id: t.id,
      kind: t.kind,
      date: day(t.txnDate),
      createdAt: t.createdAt.toISOString(),
      category: t.category,
      description: t.description ?? t.vendor,
      amountPaisa: (t.kind === "INCOME" ? 1 : -1) * Number(t.amountPaisa),
      month: monthKey(t.period.month),
      entryId: t.id,
    })),
    ledger.map((e) => ({
      ...none,
      id: e.id,
      kind: e.type as "PAYOUT" | "ADVANCE",
      date: day(e.entryDate),
      createdAt: e.createdAt.toISOString(),
      owner: { id: e.owner.id, name: e.owner.displayName },
      method: e.method,
      reference: e.referenceNo,
      amountPaisa: Number(e.amountPaisa),
      month: monthKey(e.period.month),
    })),
    loans.map((l) => ({
      ...none,
      id: l.id,
      kind: "LOAN" as const,
      date: day(l.disbursedOn),
      createdAt: l.createdAt.toISOString(),
      owner: { id: l.owner.id, name: l.owner.displayName },
      method: l.method,
      reference: l.referenceNo,
      amountPaisa: -Number(l.principalPaisa),
      month: day(l.disbursedOn).slice(0, 7),
    })),
    repayments.map((m) => ({
      ...none,
      id: m.id,
      kind: "REPAYMENT" as const,
      date: day(m.movementDate),
      createdAt: m.createdAt.toISOString(),
      owner: { id: m.loan.owner.id, name: m.loan.owner.displayName },
      method: m.method,
      reference: m.referenceNo,
      amountPaisa: -Number(m.amountPaisa),
      month: monthKey(m.period.month),
    })),
  ]);
}
