// Loan ledger (PRD §5.5): disbursed from a payout split, repaid by monthly
// instalments deducted on month close (Distribution PRD F11). Deductions are
// LOAN_DEDUCTION owner-ledger rows linked by loan_id; their reversals carry
// the same loan_id, so outstanding = principal + Σ linked ledger amounts.
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type LoanStatus = "ACTIVE" | "REPAID" | "WRITTEN_OFF";
export type LoanDto = {
  id: string;
  ownerId: string;
  principalPaisa: number;
  disbursedOn: string;
  status: LoanStatus;
  reason: string;
  installmentPaisa: number | null;
  outstandingPaisa: number;
};

type LoanRow = { id: string; ownerId: string; principalPaisa: bigint; disbursedOn: Date; status: LoanStatus; reason: string; installmentPaisa: bigint | null };

const toDto = (l: LoanRow, deducted: number): LoanDto => ({
  id: l.id,
  ownerId: l.ownerId,
  principalPaisa: Number(l.principalPaisa),
  disbursedOn: l.disbursedOn.toISOString().slice(0, 10),
  status: l.status,
  reason: l.reason,
  installmentPaisa: l.installmentPaisa === null ? null : Number(l.installmentPaisa),
  outstandingPaisa: Number(l.principalPaisa) + deducted,
});

/** Σ signed ledger amount per loan (deductions −, their reversals +). */
async function deductedByLoan(db: Db, loanIds: string[]): Promise<Map<string, number>> {
  if (loanIds.length === 0) return new Map();
  const groups = await db.ownerLedgerEntry.groupBy({ by: ["loanId"], where: { loanId: { in: loanIds } }, _sum: { amountPaisa: true } });
  return new Map(groups.map((g) => [g.loanId!, Number(g._sum.amountPaisa ?? 0)]));
}

/** ACTIVE loans with their outstanding, oldest first (optionally for some owners). */
export async function activeLoans(db: Db, propertyId: string, ownerIds?: string[]): Promise<LoanDto[]> {
  const rows = await db.loan.findMany({
    where: { propertyId, status: "ACTIVE", ...(ownerIds ? { ownerId: { in: ownerIds } } : {}) },
    orderBy: [{ disbursedOn: "asc" }, { id: "asc" }],
  });
  const deducted = await deductedByLoan(db, rows.map((r) => r.id));
  return rows.map((r) => toDto(r, deducted.get(r.id) ?? 0));
}

/** Σ outstanding of ACTIVE loans per owner. */
export async function loanOutstandingByOwner(db: Db, propertyId: string, ownerIds?: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const l of await activeLoans(db, propertyId, ownerIds)) out.set(l.ownerId, (out.get(l.ownerId) ?? 0) + l.outstandingPaisa);
  return out;
}

/** Disburses a loan inside the caller's transaction (payout split, PAY-03) and audits `loan.created`. */
export async function createLoanInTx(
  tx: Prisma.TransactionClient,
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
  },
  actor: Actor,
): Promise<LoanDto> {
  const { installmentPaisa, ...rest } = data;
  const row = await tx.loan.create({
    data: { ...rest, principalPaisa: BigInt(data.principalPaisa), installmentPaisa: installmentPaisa ? BigInt(installmentPaisa) : null, createdById: actor.id },
  });
  const dto = toDto(row, 0);
  await audit(tx, { actorId: actor.id, action: "loan.created", entityType: "loan", entityId: row.id, after: dto, reason: data.reason, ip: actor.ip, userAgent: actor.userAgent });
  return dto;
}

/** Sets or clears the monthly instalment of an ACTIVE loan (Distribution PRD F11; ADV-02). */
export async function setLoanInstallment(propertyId: string, id: string, installmentPaisa: number | null, actor: Actor): Promise<Result<{ loan: LoanDto }>> {
  return inTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM loans WHERE id = ${id}::uuid AND property_id = ${propertyId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new Abort(failWith("NOT_FOUND"));
    const row = await tx.loan.findUniqueOrThrow({ where: { id } });
    if (row.status !== "ACTIVE") throw new Abort(failWith("LOAN_NOT_ACTIVE"));
    const before = toDto(row, (await deductedByLoan(tx, [id])).get(id) ?? 0);
    if (installmentPaisa !== null && installmentPaisa > before.outstandingPaisa) {
      throw new Abort(fieldFail("installmentPaisa", "The instalment can't be more than the loan outstanding."));
    }
    const updated = await tx.loan.update({ where: { id }, data: { installmentPaisa: installmentPaisa === null ? null : BigInt(installmentPaisa) } });
    const loan = toDto(updated, before.outstandingPaisa - before.principalPaisa);
    await audit(tx, {
      actorId: actor.id,
      action: "loan.updated",
      entityType: "loan",
      entityId: id,
      before: { installmentPaisa: before.installmentPaisa },
      after: { installmentPaisa: loan.installmentPaisa },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { loan };
  });
}
