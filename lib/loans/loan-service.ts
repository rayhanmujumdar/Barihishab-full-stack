// Loan ledger (PRD §5.5; Advances & Loans PRD). Deductions are LOAN_DEDUCTION
// owner-ledger rows linked by loan_id; cash repayments, cancellations and
// write-offs are loan_movements (design D1). Outstanding = principal + Σ both,
// computed on read by lib/accounting/loans.ts.
import type { Prisma } from "@/lib/generated/prisma/client";
import { expectedFinish, loanFigures, type EntryOrigin, type LoanFigures, type LoanStatus } from "@/lib/accounting/loans";
import { audit } from "@/lib/audit";
import { failWith, fieldFail, isFail, type Actor, type Result } from "@/lib/api/result";
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { prisma } from "@/lib/prisma";
import { earliestOpenMonth } from "./loan-read";
import type { SaveIdempotent } from "@/lib/api/idempotency";
import { linkAttachments } from "@/lib/attachments/attachment-service";
import { REQUEST_REF_SELECT, requestRef, type RequestRef } from "@/lib/requests/ref";
import { averageEntitlement, cashWarnings, checkCashOut, latestOpenPeriod, lockOwner, type CashOut, type LedgerWarning } from "@/lib/owners/ledger-service";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type { LoanStatus };
export type LoanDto = {
  id: string;
  number: number;
  ownerId: string;
  principalPaisa: number;
  disbursedOn: string;
  status: LoanStatus;
  reason: string;
  installmentPaisa: number | null;
  outstandingPaisa: number;
  origin: EntryOrigin;
  isSelf: boolean;
  flagged: boolean;
  /** The money request this loan pays out (Requests PRD F7). */
  request: RequestRef;
};

type LoanRow = {
  id: string;
  number: number;
  ownerId: string;
  principalPaisa: bigint;
  disbursedOn: Date;
  status: LoanStatus;
  reason: string;
  installmentPaisa: bigint | null;
  origin: EntryOrigin;
  isSelf: boolean;
  flagged: boolean;
  request?: { id: string; year: number; number: number } | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function toLoanDto(l: LoanRow, outstandingPaisa: number): LoanDto {
  return {
    id: l.id,
    number: l.number,
    ownerId: l.ownerId,
    principalPaisa: Number(l.principalPaisa),
    disbursedOn: iso(l.disbursedOn),
    status: l.status,
    reason: l.reason,
    installmentPaisa: l.installmentPaisa === null ? null : Number(l.installmentPaisa),
    outstandingPaisa,
    origin: l.origin,
    isSelf: l.isSelf,
    flagged: l.flagged,
    request: requestRef(l.request),
  };
}

/** Figures per loan from its linked ledger rows and movements. */
export async function figuresByLoan(db: Db, loans: readonly { id: string; principalPaisa: bigint }[]): Promise<Map<string, LoanFigures>> {
  if (loans.length === 0) return new Map();
  const ids = loans.map((l) => l.id);
  // Sequential on purpose: `db` may be a transaction client (one connection).
  const ledger = await db.ownerLedgerEntry.findMany({ where: { loanId: { in: ids } }, select: { loanId: true, type: true, amountPaisa: true, voidedAt: true } });
  const moves = await db.loanMovement.findMany({ where: { loanId: { in: ids } }, select: { loanId: true, type: true, amountPaisa: true, voidedAt: true } });
  const out = new Map<string, LoanFigures>();
  for (const l of loans) {
    const led = ledger
      .filter((r) => r.loanId === l.id)
      .map((r) => ({ type: r.type as "LOAN_DEDUCTION" | "REVERSAL", amountPaisa: Number(r.amountPaisa), voided: r.voidedAt !== null }));
    const mov = moves.filter((r) => r.loanId === l.id).map((r) => ({ type: r.type, amountPaisa: Number(r.amountPaisa), voided: r.voidedAt !== null }));
    out.set(l.id, loanFigures(Number(l.principalPaisa), led, mov));
  }
  return out;
}

export async function outstandingOf(db: Db, loan: { id: string; principalPaisa: bigint }): Promise<number> {
  return (await figuresByLoan(db, [loan])).get(loan.id)!.outstandingPaisa;
}

/** ACTIVE loans with their outstanding, oldest first (optionally for some owners). */
export async function activeLoans(db: Db, propertyId: string, ownerIds?: string[]): Promise<LoanDto[]> {
  const rows = await db.loan.findMany({
    where: { propertyId, status: "ACTIVE", ...(ownerIds ? { ownerId: { in: ownerIds } } : {}) },
    include: { request: REQUEST_REF_SELECT },
    orderBy: [{ disbursedOn: "asc" }, { number: "asc" }],
  });
  const figures = await figuresByLoan(db, rows);
  return rows.map((r) => toLoanDto(r, figures.get(r.id)!.outstandingPaisa));
}

/** Σ outstanding of ACTIVE loans per owner. */
export async function loanOutstandingByOwner(db: Db, propertyId: string, ownerIds?: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const l of await activeLoans(db, propertyId, ownerIds)) out.set(l.ownerId, (out.get(l.ownerId) ?? 0) + l.outstandingPaisa);
  return out;
}

/** Row lock on a loan of this property; every loan write takes it (design D4). */
export async function lockLoan(tx: Tx, propertyId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM loans WHERE id = ${id}::uuid AND property_id = ${propertyId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new Abort(failWith("NOT_FOUND"));
  return tx.loan.findUniqueOrThrow({ where: { id } });
}

/** Next loan number of the property; never reused (Rule 9, design D3). */
async function nextLoanNumber(tx: Tx, propertyId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`loan_number:${propertyId}`}))`;
  const max = await tx.loan.aggregate({ where: { propertyId }, _max: { number: true } });
  return (max._max.number ?? 0) + 1;
}

/** ACTIVE ↔ REPAID follows the outstanding after every write (design D4). */
export async function syncRepaidStatus(tx: Tx, loanId: string, status: LoanStatus, outstandingPaisa: number): Promise<LoanStatus> {
  const next: LoanStatus = status === "ACTIVE" && outstandingPaisa <= 0 ? "REPAID" : status === "REPAID" && outstandingPaisa > 0 ? "ACTIVE" : status;
  if (next !== status) await tx.loan.update({ where: { id: loanId }, data: { status: next } });
  return next;
}

/** Disburses a loan inside the caller's transaction (payout split or direct) and audits `loan.created`. */
export async function createLoanInTx(
  tx: Tx,
  data: {
    propertyId: string;
    ownerId: string;
    principalPaisa: number;
    disbursedOn: Date;
    fundAccountId: string;
    method: "CASH" | "BANK" | "BKASH" | "NAGAD";
    referenceNo: string | null;
    reason: string;
    payoutEntryId: string | null;
    installmentPaisa?: number | null;
    origin?: "DIRECT" | "PAYOUT_SPLIT" | "REQUEST";
    isSelf?: boolean;
    flagged?: boolean;
    /** The money request this loan pays out (Requests PRD F7). */
    requestId?: string | null;
  },
  actor: Actor,
): Promise<LoanDto> {
  const { installmentPaisa, ...rest } = data;
  const row = await tx.loan.create({
    data: {
      ...rest,
      number: await nextLoanNumber(tx, data.propertyId),
      origin: data.origin ?? "PAYOUT_SPLIT",
      principalPaisa: BigInt(data.principalPaisa),
      installmentPaisa: installmentPaisa ? BigInt(installmentPaisa) : null,
      createdById: actor.id,
    },
    include: { request: REQUEST_REF_SELECT },
  });
  const dto = toLoanDto(row, data.principalPaisa);
  await audit(tx, { actorId: actor.id, action: "loan.created", entityType: "loan", entityId: row.id, after: dto, reason: data.reason, ip: actor.ip, userAgent: actor.userAgent });
  return dto;
}

/** F7: sets or clears ("Manual") the monthly instalment of an ACTIVE loan, with a reason. */
export async function setLoanInstallment(
  propertyId: string,
  id: string,
  input: { installmentPaisa: number | null; reason: string },
  actor: Actor,
): Promise<Result<{ loan: LoanDto; expectedFinishMonth: string | null }>> {
  return inTransaction(async (tx) => {
    const row = await lockLoan(tx, propertyId, id);
    if (row.status !== "ACTIVE") throw new Abort(failWith("LOAN_NOT_ACTIVE"));
    const outstanding = await outstandingOf(tx, row);
    if (input.installmentPaisa !== null && input.installmentPaisa > outstanding) {
      throw new Abort(fieldFail("installmentPaisa", "The instalment can't be more than the loan outstanding."));
    }
    const before = row.installmentPaisa === null ? null : Number(row.installmentPaisa);
    const updated = await tx.loan.update({ where: { id }, data: { installmentPaisa: input.installmentPaisa === null ? null : BigInt(input.installmentPaisa) } });
    const loan = toLoanDto(updated, outstanding);
    await audit(tx, {
      actorId: actor.id,
      action: "loan.updated",
      entityType: "loan",
      entityId: id,
      before: { installmentPaisa: before },
      after: { installmentPaisa: loan.installmentPaisa },
      reason: input.reason,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    const schedule = expectedFinish({ ...loan, earliestOpenMonth: await earliestOpenMonth(tx, propertyId) });
    return { loan, expectedFinishMonth: schedule?.finishMonth ?? null };
  });
}

// ─── F4 New loan ───

export type LoanWarning =
  | LedgerWarning
  | { code: "OWNER_HAS_LOAN"; loanNumber: number; outstandingPaisa: number }
  | { code: "INSTALMENT_ABOVE_SHARE"; averageSharePaisa: number };
export type CreateLoanInput = CashOut & { reason: string; installmentPaisa?: number | null };

const dateOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

/** Direct loan by the Super Admin: House Fund down, owner balance unchanged; warnings never block (G9, G15). */
export async function createLoan(propertyId: string, input: CreateLoanInput, actor: Actor, save?: SaveIdempotent): Promise<Result<{ loan: LoanDto; warnings: LoanWarning[] }>> {
  const uploads = await checkCashOut(propertyId, input);
  if (isFail(uploads)) return uploads;
  if ((input.installmentPaisa ?? 0) > input.amountPaisa) return fieldFail("installmentPaisa", "The instalment can't be more than the loan.");
  return inTransaction(async (tx) => {
    const owner = await lockOwner(tx, propertyId, input.ownerId);
    await latestOpenPeriod(tx, propertyId);
    const existing = await activeLoans(tx, propertyId, [input.ownerId]);
    const loan = await createLoanInTx(
      tx,
      {
        propertyId,
        ownerId: input.ownerId,
        principalPaisa: input.amountPaisa,
        disbursedOn: dateOf(input.date),
        fundAccountId: input.fundAccountId,
        method: input.method,
        referenceNo: input.referenceNo || null,
        reason: input.reason,
        payoutEntryId: null,
        installmentPaisa: input.installmentPaisa ?? null,
        origin: "DIRECT",
        isSelf: owner!.user_id === actor.id,
        flagged: existing.length > 0,
      },
      actor,
    );
    await linkAttachments(tx, propertyId, loan.id, uploads, actor, "loan");
    const warnings: LoanWarning[] = [];
    const latest = existing.at(-1);
    if (latest) warnings.push({ code: "OWNER_HAS_LOAN", loanNumber: latest.number, outstandingPaisa: latest.outstandingPaisa });
    const average = await averageEntitlement(tx, propertyId, input.ownerId);
    if (input.installmentPaisa && average !== null && input.installmentPaisa > average) warnings.push({ code: "INSTALMENT_ABOVE_SHARE", averageSharePaisa: average });
    warnings.push(...(await cashWarnings(tx, propertyId, input.fundAccountId, input.amountPaisa)));
    const data = { loan, warnings };
    await save?.(tx, data);
    return data;
  });
}
