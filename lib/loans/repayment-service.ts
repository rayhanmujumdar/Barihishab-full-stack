// Loan repayments and corrections (Advances & Loans PRD F5, F8–F10). Lock
// order matches close: owner → open period (FOR SHARE) → loan, so a close
// (period FOR UPDATE → loans) can't deadlock with a repayment.
import type { Prisma } from "@/lib/generated/prisma/client";
import { repaymentCap } from "@/lib/accounting/loans";
import type { SaveIdempotent } from "@/lib/api/idempotency";
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import { now, todayIsoInDhaka } from "@/lib/clock";
import { formatMoney } from "@/lib/money";
import { insertEntry, latestOpenPeriod, lockOwner, ownerBalance, type PayMethod } from "@/lib/owners/ledger-service";
import { prisma } from "@/lib/prisma";
import { isAfterTomorrow } from "@/lib/transactions/rules";
import { lockLoan, outstandingOf, syncRepaidStatus, toLoanDto, type LoanDto } from "./loan-service";

type Tx = Prisma.TransactionClient;

const dateOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);
const label = (n: number) => `L${n}`;
const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

async function ownerOfLoan(propertyId: string, id: string) {
  return prisma.loan.findFirst({ where: { id, propertyId }, select: { ownerId: true, owner: { select: { displayName: true } } } });
}

async function loanDto(tx: Tx, id: string): Promise<LoanDto> {
  const row = await tx.loan.findUniqueOrThrow({ where: { id } });
  return toLoanDto(row, await outstandingOf(tx, row));
}

// ─── F5 Record repayment ───

export type RepaymentInput = { mode: "CASH" | "DEDUCTION"; amountPaisa: number; date: string; fundAccountId?: string | null; method?: PayMethod | null; referenceNo?: string | null };
export type RepaymentResult = { loan: LoanDto; movement: { id: string; kind: "CASH_REPAYMENT" | "DEDUCTION"; amountPaisa: number; date: string }; balancePaisa: number };

export async function recordRepayment(propertyId: string, id: string, input: RepaymentInput, actor: Actor, save?: SaveIdempotent): Promise<Result<RepaymentResult>> {
  const found = await ownerOfLoan(propertyId, id);
  if (!found) return failWith("NOT_FOUND");
  if (isAfterTomorrow(input.date, todayIsoInDhaka())) return fieldFail("date", "Date can't be in the future.");
  if (input.mode === "CASH") {
    const fund = input.fundAccountId ? await prisma.fundAccount.findFirst({ where: { id: input.fundAccountId, propertyId, isActive: true }, select: { id: true } }) : null;
    if (!fund) return fieldFail("fundAccountId", "Pick an active fund account.");
  }
  return inTransaction(async (tx) => {
    await lockOwner(tx, propertyId, found.ownerId);
    const period = await latestOpenPeriod(tx, propertyId);
    const loan = await lockLoan(tx, propertyId, id);
    if (loan.status !== "ACTIVE") throw new Abort(failWith("LOAN_NOT_ACTIVE"));
    const outstanding = await outstandingOf(tx, loan);
    const balance = await ownerBalance(tx, loan.ownerId);
    if (input.amountPaisa > outstanding) {
      throw new Abort(failWith("VALIDATION_FAILED", { amountPaisa: `Only ${formatMoney("en", outstanding)} is outstanding on ${label(loan.number)}.` }, { outstandingPaisa: outstanding }));
    }
    if (input.amountPaisa > repaymentCap(input.mode, outstanding, balance)) {
      const max = Math.max(0, balance);
      throw new Abort(
        failWith(
          "VALIDATION_FAILED",
          { amountPaisa: `${found.owner.displayName}'s balance is ${formatMoney("en", max)} — you can deduct up to that. Use cash for the rest.` },
          { balancePaisa: balance, maxPaisa: max },
        ),
      );
    }
    let movement: RepaymentResult["movement"];
    if (input.mode === "CASH") {
      const row = await tx.loanMovement.create({
        data: {
          propertyId,
          loanId: id,
          periodId: period.id,
          type: "CASH_REPAYMENT",
          amountPaisa: BigInt(-input.amountPaisa),
          movementDate: dateOf(input.date),
          fundAccountId: input.fundAccountId!,
          method: input.method ?? null,
          referenceNo: input.referenceNo || null,
          createdById: actor.id,
        },
      });
      await audit(tx, {
        actorId: actor.id,
        action: "loan.repaid_cash",
        entityType: "loan_movement",
        entityId: row.id,
        after: { loanId: id, amountPaisa: input.amountPaisa, fundAccountId: input.fundAccountId },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      movement = { id: row.id, kind: "CASH_REPAYMENT", amountPaisa: input.amountPaisa, date: input.date };
    } else {
      const row = await insertEntry(tx, propertyId, loan.ownerId, period.id, { type: "LOAN_DEDUCTION", amountPaisa: -input.amountPaisa, date: input.date, loanId: id }, actor, "loan.repaid_deduction");
      movement = { id: row.id, kind: "DEDUCTION", amountPaisa: input.amountPaisa, date: input.date };
    }
    await syncRepaidStatus(tx, id, loan.status, outstanding - input.amountPaisa);
    const data: RepaymentResult = { loan: await loanDto(tx, id), movement, balancePaisa: await ownerBalance(tx, loan.ownerId) };
    await save?.(tx, data);
    return data;
  });
}

// ─── F8 Void a repayment ───

export async function voidRepayment(
  propertyId: string,
  id: string,
  repaymentId: string,
  reason: string,
  actor: Actor,
): Promise<Result<{ loan: LoanDto; reversalId: string; balancePaisa: number }>> {
  const found = await ownerOfLoan(propertyId, id);
  if (!found) return failWith("NOT_FOUND");
  try {
    return await inTransaction(async (tx) => {
      await lockOwner(tx, propertyId, found.ownerId);
      const period = await latestOpenPeriod(tx, propertyId);
      const loan = await lockLoan(tx, propertyId, id);
      // Re-read under the locks: a racing void has committed by now.
      const cash = await tx.loanMovement.findFirst({ where: { id: repaymentId, loanId: id } });
      const ded = cash ? null : await tx.ownerLedgerEntry.findFirst({ where: { id: repaymentId, loanId: id, type: "LOAN_DEDUCTION" } });
      if ((!cash || cash.type !== "CASH_REPAYMENT") && !ded) throw new Abort(failWith("NOT_FOUND"));
      if (ded?.origin === "CLOSE") throw new Abort({ ...failWith("NOT_VOIDABLE"), message: "Instalments taken at close change only by reopening that month." });
      if (loan.status !== "ACTIVE" && loan.status !== "REPAID") throw new Abort(failWith("LOAN_NOT_ACTIVE"));
      if ((cash ?? ded)!.voidedAt) throw new Abort(failWith("ALREADY_VOIDED"));
      const voidFields = { voidedAt: now(), voidedById: actor.id, voidReason: reason };
      const today = dateOf(todayIsoInDhaka());
      let reversalId: string;
      let amount: number;
      if (cash) {
        amount = -Number(cash.amountPaisa);
        await tx.loanMovement.update({ where: { id: cash.id }, data: voidFields });
        const rev = await tx.loanMovement.create({
          data: { propertyId, loanId: id, periodId: period.id, type: "REVERSAL", amountPaisa: -cash.amountPaisa, movementDate: today, fundAccountId: cash.fundAccountId, method: cash.method, referenceNo: cash.referenceNo, note: reason, reversesId: cash.id, createdById: actor.id },
        });
        reversalId = rev.id;
      } else {
        amount = -Number(ded!.amountPaisa);
        await tx.ownerLedgerEntry.update({ where: { id: ded!.id }, data: voidFields });
        const rev = await tx.ownerLedgerEntry.create({
          data: { propertyId, ownerId: loan.ownerId, periodId: period.id, type: "REVERSAL", amountPaisa: -ded!.amountPaisa, entryDate: today, loanId: id, note: reason, reversesId: ded!.id, createdById: actor.id },
        });
        reversalId = rev.id;
      }
      const outstanding = await outstandingOf(tx, loan);
      await syncRepaidStatus(tx, id, loan.status, outstanding);
      await audit(tx, {
        actorId: actor.id,
        action: "loan.repayment_voided",
        entityType: "loan",
        entityId: id,
        before: { repaymentId, voided: false },
        after: { repaymentId, voided: true, reversalId, amountPaisa: amount, mode: cash ? "CASH" : "DEDUCTION" },
        reason,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { loan: await loanDto(tx, id), reversalId, balancePaisa: await ownerBalance(tx, loan.ownerId) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return failWith("ALREADY_VOIDED");
    throw err;
  }
}

// ─── F9 Cancel / F10 Write off ───

async function closeLoan(
  propertyId: string,
  id: string,
  reason: string,
  actor: Actor,
  kind: "CANCELLATION" | "WRITE_OFF",
): Promise<Result<{ loan: LoanDto; transactionId: string | null }>> {
  return inTransaction(async (tx) => {
    const period = await latestOpenPeriod(tx, propertyId);
    const loan = await lockLoan(tx, propertyId, id);
    if (loan.status !== "ACTIVE") throw new Abort(failWith("LOAN_NOT_ACTIVE"));
    if (kind === "CANCELLATION") {
      const repayments =
        (await tx.loanMovement.count({ where: { loanId: id, type: "CASH_REPAYMENT", voidedAt: null } })) +
        (await tx.ownerLedgerEntry.count({ where: { loanId: id, type: "LOAN_DEDUCTION", voidedAt: null } }));
      if (repayments > 0) throw new Abort(failWith("LOAN_HAS_REPAYMENTS"));
    }
    const outstanding = await outstandingOf(tx, loan);
    const today = todayIsoInDhaka();
    // The movement returns the cash (cancel) or offsets the write-off expense on the same fund (design D1, D6).
    await tx.loanMovement.create({
      data: { propertyId, loanId: id, periodId: period.id, type: kind, amountPaisa: BigInt(-outstanding), movementDate: dateOf(today), fundAccountId: loan.fundAccountId, note: reason, createdById: actor.id },
    });
    let transactionId: string | null = null;
    if (kind === "WRITE_OFF") {
      const category = await tx.category.findUniqueOrThrow({ where: { propertyId_code: { propertyId, code: "LOAN_WRITTEN_OFF" } } });
      const txn = await tx.houseTransaction.create({
        data: {
          propertyId,
          periodId: period.id,
          kind: "EXPENSE",
          categoryId: category.id,
          amountPaisa: BigInt(outstanding),
          txnDate: dateOf(today),
          fundAccountId: loan.fundAccountId,
          description: `${label(loan.number)} written off · ${reason}`,
          source: "LOAN_WRITE_OFF",
          createdById: actor.id,
        },
      });
      transactionId = txn.id;
    }
    const status = kind === "CANCELLATION" ? "CANCELLED" : "WRITTEN_OFF";
    await tx.loan.update({ where: { id }, data: { status } });
    await audit(tx, {
      actorId: actor.id,
      action: kind === "CANCELLATION" ? "loan.cancelled" : "loan.written_off",
      entityType: "loan",
      entityId: id,
      before: { status: loan.status, outstandingPaisa: outstanding },
      after: { status, outstandingPaisa: 0, ...(transactionId ? { transactionId } : {}) },
      reason,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { loan: await loanDto(tx, id), transactionId };
  });
}

export const cancelLoan = (propertyId: string, id: string, reason: string, actor: Actor) => closeLoan(propertyId, id, reason, actor, "CANCELLATION");
export const writeOffLoan = (propertyId: string, id: string, reason: string, actor: Actor) => closeLoan(propertyId, id, reason, actor, "WRITE_OFF");
