// Minimal loan ledger (PRD §5.5): disbursement from a payout split only.
// Outstanding = Σ principal of ACTIVE loans until repayments exist.
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/api/result";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type LoanDto = { id: string; ownerId: string; principalPaisa: number; disbursedOn: string; status: "ACTIVE" | "REPAID" | "WRITTEN_OFF"; reason: string };

/** Σ principal of ACTIVE loans per owner (repayments arrive with the Loans section). */
export async function loanOutstandingByOwner(db: Db, propertyId: string, ownerIds?: string[]): Promise<Map<string, number>> {
  const groups = await db.loan.groupBy({
    by: ["ownerId"],
    where: { propertyId, status: "ACTIVE", ...(ownerIds ? { ownerId: { in: ownerIds } } : {}) },
    _sum: { principalPaisa: true },
  });
  return new Map(groups.map((g) => [g.ownerId, Number(g._sum.principalPaisa ?? 0)]));
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
  },
  actor: Actor,
): Promise<LoanDto> {
  const row = await tx.loan.create({ data: { ...data, principalPaisa: BigInt(data.principalPaisa), createdById: actor.id } });
  const dto: LoanDto = {
    id: row.id,
    ownerId: row.ownerId,
    principalPaisa: data.principalPaisa,
    disbursedOn: row.disbursedOn.toISOString().slice(0, 10),
    status: row.status,
    reason: row.reason,
  };
  await audit(tx, { actorId: actor.id, action: "loan.created", entityType: "loan", entityId: row.id, after: dto, reason: data.reason, ip: actor.ip, userAgent: actor.userAgent });
  return dto;
}
