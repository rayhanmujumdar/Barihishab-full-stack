// Loan list and detail read models (Advances & Loans PRD F1–F3, F6). Every
// figure is assembled on read from the loan, its linked ledger rows, its
// movements and the closed months' snapshots (design D7, D8).
import type { Prisma } from "@/lib/generated/prisma/client";
import { expectedFinish, loanFigures, loanHistory, type HistoryRow, type LoanFigures, type LoanStatus } from "@/lib/accounting/loans";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { activeLoans, toLoanDto, type LoanDto } from "./loan-service";

type Db = Prisma.TransactionClient | typeof prisma;

export type LoanCardDto = LoanDto &
  Omit<LoanFigures, "outstandingPaisa"> & {
    ownerName: string;
    expectedFinishMonth: string | null;
    monthsLeft: number | null;
    nextDeduction: { amountPaisa: number; month: string } | null;
    recentMovements: HistoryRow[];
  };

export type LoanDetailDto = {
  loan: LoanCardDto & {
    fundAccountId: string;
    fundAccountName: string;
    method: "CASH" | "BANK" | "BKASH" | "NAGAD";
    referenceNo: string | null;
    payoutEntryId: string | null;
    recordedBy: string;
  };
  movements: HistoryRow[];
  changes: { at: string; action: string; by: string | null; before: unknown; after: unknown; reason: string | null }[];
};

export type LoanFilters = { ownerId?: string; status?: LoanStatus };

const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;
const LOAN_INCLUDE = { owner: { select: { displayName: true } }, fundAccount: { select: { name: true } }, createdBy: NAME } as const;
type LoanRow = Prisma.LoanGetPayload<{ include: typeof LOAN_INCLUDE }>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** The month the next close applies to (earliest OPEN). */
export async function earliestOpenMonth(db: Db, propertyId: string): Promise<string | null> {
  const p = await db.period.findFirst({ where: { propertyId, status: "OPEN" }, orderBy: { month: "asc" }, select: { month: true } });
  return p ? p.month.toISOString().slice(0, 7) : null;
}

/** Full history + figures for each loan, in one round of queries. */
async function cards(db: Db, propertyId: string, rows: readonly LoanRow[]): Promise<Map<string, { card: LoanCardDto; history: HistoryRow[] }>> {
  const ids = rows.map((r) => r.id);
  const out = new Map<string, { card: LoanCardDto; history: HistoryRow[] }>();
  if (!ids.length) return out;
  const ledger = await db.ownerLedgerEntry.findMany({ where: { loanId: { in: ids } }, include: { createdBy: NAME } });
  const moves = await db.loanMovement.findMany({ where: { loanId: { in: ids } }, include: { createdBy: NAME } });
  const closed = await db.period.findMany({ where: { propertyId, status: "CLOSED" }, select: { month: true, snapshot: true } });
  const openMonth = await earliestOpenMonth(db, propertyId);
  const at = (d: Date, id: string) => `${d.toISOString()}#${id}`;
  for (const r of rows) {
    const led = ledger
      .filter((l) => l.loanId === r.id)
      .map((l) => ({
        id: l.id,
        type: l.type as "LOAN_DEDUCTION" | "REVERSAL",
        amountPaisa: Number(l.amountPaisa),
        date: iso(l.entryDate),
        at: at(l.createdAt, l.id),
        origin: l.origin,
        voided: l.voidedAt !== null,
        voidReason: l.voidReason,
        reversesId: l.reversesId,
        recordedBy: displayName(l.createdBy),
        note: l.note,
      }));
    const mov = moves
      .filter((m) => m.loanId === r.id)
      .map((m) => ({
        id: m.id,
        type: m.type,
        amountPaisa: Number(m.amountPaisa),
        date: iso(m.movementDate),
        at: at(m.createdAt, m.id),
        voided: m.voidedAt !== null,
        voidReason: m.voidReason,
        reversesId: m.reversesId,
        recordedBy: displayName(m.createdBy),
        note: m.note,
      }));
    const disbursedMonth = iso(r.disbursedOn).slice(0, 7);
    const skippedMonths = closed
      .filter((p) => p.month.toISOString().slice(0, 7) > disbursedMonth)
      .filter((p) => ((p.snapshot as { skippedLoans?: { loanId: string }[] } | null)?.skippedLoans ?? []).some((x) => x.loanId === r.id))
      .map((p) => {
        const month = p.month.toISOString().slice(0, 7);
        return { month, date: lastDay(month) };
      });
    const figures = loanFigures(Number(r.principalPaisa), led, mov);
    const history = loanHistory({
      status: r.status,
      principalPaisa: Number(r.principalPaisa),
      disbursedOn: iso(r.disbursedOn),
      disbursedAt: r.createdAt.toISOString(),
      disbursedBy: displayName(r.createdBy),
      ledger: led,
      movements: mov,
      skippedMonths,
    });
    const base = toLoanDto(r, figures.outstandingPaisa);
    const schedule = expectedFinish({ ...base, earliestOpenMonth: openMonth });
    const { outstandingPaisa: _o, ...rest } = figures;
    out.set(r.id, {
      history,
      card: {
        ...base,
        ...rest,
        ownerName: r.owner.displayName,
        expectedFinishMonth: schedule?.finishMonth ?? null,
        monthsLeft: schedule?.monthsLeft ?? null,
        nextDeduction: schedule?.nextDeduction ?? null,
        recentMovements: history.slice(-3),
      },
    });
  }
  return out;
}

/** F1/F2: loans newest first; the summary is over all loans whatever the filters. */
export async function listLoans(propertyId: string, filters: LoanFilters = {}): Promise<{ loans: LoanCardDto[]; summary: { loansOutstandingPaisa: number; activeLoans: number } }> {
  const rows = await prisma.loan.findMany({
    where: { propertyId, ...(filters.ownerId ? { ownerId: filters.ownerId } : {}), ...(filters.status ? { status: filters.status } : {}) },
    include: LOAN_INCLUDE,
    orderBy: [{ disbursedOn: "desc" }, { number: "desc" }],
  });
  const built = await cards(prisma, propertyId, rows);
  return { loans: rows.map((r) => built.get(r.id)!.card), summary: loanSummary(await activeLoans(prisma, propertyId)) };
}

/** F1 tiles: total outstanding and count of ACTIVE loans. */
export function loanSummary(active: readonly { outstandingPaisa: number }[]): { loansOutstandingPaisa: number; activeLoans: number } {
  return { loansOutstandingPaisa: active.reduce((s, l) => s + l.outstandingPaisa, 0), activeLoans: active.length };
}

const CHANGE_ACTIONS = ["loan.updated", "loan.cancelled", "loan.written_off", "loan.repayment_voided"];

/** F3: the loan, every movement oldest first and its change history (from the audit log, design D7). */
export async function loanDetail(propertyId: string, id: string): Promise<LoanDetailDto | null> {
  const row = await prisma.loan.findFirst({ where: { id, propertyId }, include: LOAN_INCLUDE });
  if (!row) return null;
  const { card, history } = (await cards(prisma, propertyId, [row])).get(id)!;
  const logs = await prisma.auditLog.findMany({ where: { entityType: "loan", entityId: id, action: { in: CHANGE_ACTIONS } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const actorIds = [...new Set(logs.flatMap((l) => (l.actorId ? [l.actorId] : [])))];
  const users = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, ...NAME.select } });
  const names = new Map(users.map((u) => [u.id, displayName(u)]));
  return {
    loan: {
      ...card,
      fundAccountId: row.fundAccountId,
      fundAccountName: row.fundAccount.name,
      method: row.method,
      referenceNo: row.referenceNo,
      payoutEntryId: row.payoutEntryId,
      recordedBy: displayName(row.createdBy),
    },
    movements: history,
    changes: logs.map((l) => ({ at: l.createdAt.toISOString(), action: l.action, by: l.actorId ? (names.get(l.actorId) ?? null) : null, before: l.before, after: l.after, reason: l.reason })),
  };
}
