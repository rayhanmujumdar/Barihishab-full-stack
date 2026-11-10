import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry } from "../../helpers/factory";
import { json } from "../../helpers/http";
import { balanceOf, cancelLoan, createLoanApi, data, fundBalance, getLoan, loansWorld, repay, voidRepayment, writeOff, type LoansWorld } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const cash = (w: LoansWorld, amountPaisa: number) => ({ mode: "CASH", amountPaisa, date: "2026-10-15", fundAccountId: w.house.id, method: "CASH" });
const newLoan = async (w: LoansWorld, amountPaisa = 2000000) =>
  (await data(await createLoanApi(w.adminLogin, { ownerId: w.owners.farzana.id, amountPaisa, date: "2026-10-12", fundAccountId: w.house.id, method: "CASH", reason: "Laptop for work" }))).loan;

describe("POST /api/v1/loans/:id/repayments/:repaymentId/void (F8, G4)", () => {
  it("voiding a cash repayment restores outstanding, fund, balance and ACTIVE status", async () => {
    const w = await loansWorld();
    const [bal, fund] = [await balanceOf(w.owners.tanvir.id), await fundBalance(w, w.house.id)];
    const paid = await data(await repay(w.adminLogin, w.loan.id, cash(w, 3500000)));
    expect(paid.loan.status).toBe("REPAID");
    const res = await voidRepayment(w.adminLogin, w.loan.id, paid.movement.id);
    expect(res.status).toBe(200);
    expect((await data(res)).loan).toMatchObject({ outstandingPaisa: 3500000, status: "ACTIVE" });
    expect(await fundBalance(w, w.house.id)).toBe(fund);
    expect(await balanceOf(w.owners.tanvir.id)).toBe(bal);
    const detail = await data(await getLoan(w.ownerLogin, w.loan.id));
    expect(detail.movements.map((m: { kind: string; voided: boolean; voidReason: string | null }) => [m.kind, m.voided, m.voidReason])).toEqual([
      ["DISBURSED", false, null],
      ["CASH_REPAYMENT", true, "Recorded on the wrong loan"],
      ["REVERSAL", false, null],
    ]);
    expect(detail.changes.map((c: { action: string }) => c.action)).toEqual(["loan.repayment_voided"]);
    expect(await prisma.auditLog.count({ where: { action: "loan.repayment_voided", entityId: w.loan.id, reason: "Recorded on the wrong loan" } })).toBe(1);
  });

  it("voiding a manual deduction gives the balance back", async () => {
    const w = await loansWorld();
    const bal = await balanceOf(w.owners.tanvir.id);
    const d = await data(await repay(w.adminLogin, w.loan.id, { mode: "DEDUCTION", amountPaisa: 300000, date: "2026-10-15" }));
    expect((await data(await voidRepayment(w.adminLogin, w.loan.id, d.movement.id))).balancePaisa).toBe(bal);
    const reversal = await prisma.ownerLedgerEntry.findFirstOrThrow({ where: { reversesId: d.movement.id } });
    expect(reversal).toMatchObject({ type: "REVERSAL", loanId: w.loan.id, amountPaisa: BigInt(300000) });
  });

  it("refuses close instalments, a second void, foreign ids, blank reasons and Owners", async () => {
    const w = await loansWorld();
    const close = await createLedgerEntry({ propertyId: w.property.id, ownerId: w.owners.tanvir.id, periodId: w.oct.id, createdById: w.admin.id, type: "LOAN_DEDUCTION", amountPaisa: -500000, loanId: w.loan.id });
    const closeRes = await voidRepayment(w.adminLogin, w.loan.id, close.id);
    expect(closeRes.status).toBe(409);
    expect((await json(closeRes)).error).toMatchObject({ code: "NOT_VOIDABLE", message: "Instalments taken at close change only by reopening that month." });
    const paid = await data(await repay(w.adminLogin, w.loan.id, cash(w, 100000)));
    expect((await voidRepayment(w.adminLogin, w.loan.id, paid.movement.id, " ")).status).toBe(422);
    expect((await voidRepayment(w.ownerLogin, w.loan.id, paid.movement.id)).status).toBe(403);
    const other = await newLoan(w);
    expect((await voidRepayment(w.adminLogin, other.id, paid.movement.id)).status).toBe(404);
    expect((await voidRepayment(w.adminLogin, w.loan.id, randomUUID())).status).toBe(404);
    expect((await voidRepayment(w.adminLogin, w.loan.id, paid.movement.id)).status).toBe(200);
    expect((await json(await voidRepayment(w.adminLogin, w.loan.id, paid.movement.id))).error.code).toBe("ALREADY_VOIDED");
  });

  it("concurrent voids post exactly one reversal", async () => {
    const w = await loansWorld();
    const paid = await data(await repay(w.adminLogin, w.loan.id, cash(w, 100000)));
    const results = await Promise.all([voidRepayment(w.adminLogin, w.loan.id, paid.movement.id), voidRepayment(w.adminLogin, w.loan.id, paid.movement.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.loanMovement.count({ where: { type: "REVERSAL" } })).toBe(1);
  });
});

describe("POST /api/v1/loans/:id/cancel (F9)", () => {
  it("cancels a loan without repayments: fund back, CANCELLED, number kept, out of the owner's outstanding", async () => {
    const w = await loansWorld();
    const fund = await fundBalance(w, w.house.id);
    const loan = await newLoan(w);
    const res = await cancelLoan(w.adminLogin, loan.id);
    expect(res.status).toBe(200);
    expect((await data(res)).loan).toMatchObject({ number: 2, status: "CANCELLED", outstandingPaisa: 0 });
    expect(await fundBalance(w, w.house.id)).toBe(fund);
    const list = await data(await (await import("../../helpers/loans")).listLoans(w.adminLogin));
    expect(list.summary).toEqual({ loansOutstandingPaisa: 3500000, activeLoans: 1 });
    expect(await prisma.auditLog.count({ where: { action: "loan.cancelled", entityId: loan.id, reason: "Recorded for the wrong owner" } })).toBe(1);
    expect((await json(await cancelLoan(w.adminLogin, loan.id))).error.code).toBe("LOAN_NOT_ACTIVE");
  });

  it("refuses a loan with repayments, but allows it once they are voided", async () => {
    const w = await loansWorld();
    const paid = await data(await repay(w.adminLogin, w.loan.id, cash(w, 100000)));
    const res = await cancelLoan(w.adminLogin, w.loan.id);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("LOAN_HAS_REPAYMENTS");
    await voidRepayment(w.adminLogin, w.loan.id, paid.movement.id);
    expect((await cancelLoan(w.adminLogin, w.loan.id)).status).toBe(200);
    expect((await cancelLoan(w.ownerLogin, w.loan.id)).status).toBe(403);
    expect((await cancelLoan(w.adminLogin, w.loan.id, "")).status).toBe(422);
  });
});

describe("POST /api/v1/loans/:id/write-off (F10)", () => {
  it("writes off the outstanding as a locked shared expense without moving cash", async () => {
    const w = await loansWorld();
    await repay(w.adminLogin, w.loan.id, { mode: "DEDUCTION", amountPaisa: 500000, date: "2026-10-15" });
    const fund = await fundBalance(w, w.cash.id);
    const res = await writeOff(w.adminLogin, w.loan.id);
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d.loan).toMatchObject({ status: "WRITTEN_OFF", outstandingPaisa: 0 });
    const txn = await prisma.houseTransaction.findUniqueOrThrow({ where: { id: d.transactionId }, include: { category: true } });
    expect(txn).toMatchObject({ kind: "EXPENSE", amountPaisa: BigInt(3000000), periodId: w.oct.id, source: "LOAN_WRITE_OFF", fundAccountId: w.cash.id, description: "L1 written off · Hardship agreed by the family" });
    expect(txn.category.code).toBe("LOAN_WRITTEN_OFF");
    expect(await fundBalance(w, w.cash.id)).toBe(fund);
    expect(await prisma.auditLog.count({ where: { action: "loan.written_off", entityId: w.loan.id } })).toBe(1);
    expect((await json(await writeOff(w.adminLogin, w.loan.id))).error.code).toBe("LOAN_NOT_ACTIVE");
  });

  it("refuses Owners, blank reasons and closed loans", async () => {
    const w = await loansWorld();
    expect((await writeOff(w.ownerLogin, w.loan.id)).status).toBe(403);
    expect((await writeOff(w.adminLogin, w.loan.id, " ")).status).toBe(422);
    await prisma.loan.update({ where: { id: w.loan.id }, data: { status: "REPAID" } });
    expect((await writeOff(w.adminLogin, w.loan.id)).status).toBe(409);
  });
});
