import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { json } from "../../helpers/http";
import { balanceOf, data, fundBalance, loansWorld, repay, type LoansWorld } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const cash = (w: LoansWorld, amountPaisa: number, extra: Record<string, unknown> = {}) => ({ mode: "CASH", amountPaisa, date: "2026-10-15", fundAccountId: w.house.id, method: "CASH", ...extra });
const deduct = (amountPaisa: number) => ({ mode: "DEDUCTION", amountPaisa, date: "2026-10-15" });

describe("POST /api/v1/loans/:id/repayments (F5, G1, G2)", () => {
  it("cash goes into the fund, leaves the balance alone and is audited", async () => {
    const w = await loansWorld();
    const [bal, fund] = [await balanceOf(w.owners.tanvir.id), await fundBalance(w, w.house.id)];
    const res = await repay(w.adminLogin, w.loan.id, cash(w, 1000000));
    expect(res.status).toBe(201);
    const d = await data(res);
    expect(d.loan).toMatchObject({ outstandingPaisa: 2500000, status: "ACTIVE" });
    expect(d.movement).toMatchObject({ kind: "CASH_REPAYMENT", amountPaisa: 1000000, date: "2026-10-15" });
    expect(d.balancePaisa).toBe(bal);
    expect(await fundBalance(w, w.house.id)).toBe(fund + 1000000);
    expect(await prisma.auditLog.count({ where: { action: "loan.repaid_cash", entityId: d.movement.id } })).toBe(1);
  });

  it("the repayment that reaches 0 makes the loan REPAID", async () => {
    const w = await loansWorld();
    await repay(w.adminLogin, w.loan.id, cash(w, 1500000));
    const d = await data(await repay(w.adminLogin, w.loan.id, cash(w, 2000000)));
    expect(d.loan).toMatchObject({ outstandingPaisa: 0, status: "REPAID" });
    const again = await repay(w.adminLogin, w.loan.id, cash(w, 1));
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("LOAN_NOT_ACTIVE");
  });

  it("refuses more than the outstanding with the PRD message and the outstanding (G1)", async () => {
    const w = await loansWorld();
    const res = await repay(w.adminLogin, w.loan.id, cash(w, 3500001));
    expect(res.status).toBe(422);
    const { error } = await json(res);
    expect(error.details.fields.amountPaisa).toBe("Only ৳35,000 is outstanding on L1.");
    expect(error.details.outstandingPaisa).toBe(3500000);
    expect(await prisma.loanMovement.count()).toBe(0);
  });

  it("a deduction lowers the balance, moves no cash and is capped by the positive balance (G2)", async () => {
    const w = await loansWorld();
    const fund = await fundBalance(w, w.house.id);
    const d = await data(await repay(w.adminLogin, w.loan.id, deduct(500000)));
    expect(d).toMatchObject({ balancePaisa: 305585, loan: { outstandingPaisa: 3000000 }, movement: { kind: "DEDUCTION", amountPaisa: 500000 } });
    expect(await fundBalance(w, w.house.id)).toBe(fund);
    const entry = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: d.movement.id } });
    expect(entry).toMatchObject({ type: "LOAN_DEDUCTION", origin: "DIRECT", loanId: w.loan.id, fundAccountId: null, amountPaisa: BigInt(-500000) });
    expect(await prisma.auditLog.count({ where: { action: "loan.repaid_deduction", entityId: d.movement.id } })).toBe(1);

    const over = await repay(w.adminLogin, w.loan.id, deduct(305586));
    expect(over.status).toBe(422);
    expect((await json(over)).error.details.fields.amountPaisa).toBe("Tanvir Ahmed's balance is ৳3,055.85 — you can deduct up to that. Use cash for the rest.");
    expect((await repay(w.adminLogin, w.loan.id, deduct(1))).status).toBe(201);
  });

  it("an owner in advance can't repay by deduction", async () => {
    const w = await loansWorld();
    await prisma.loan.update({ where: { id: w.loan.id }, data: { ownerId: w.owners.nasrin.id } });
    const res = await repay(w.adminLogin, w.loan.id, deduct(100));
    expect((await json(res)).error.details.fields.amountPaisa).toBe("Nasrin Ahmed's balance is ৳0 — you can deduct up to that. Use cash for the rest.");
  });

  it("cash needs an active fund, a method and a reference except for Cash; dates can't be in the future", async () => {
    const w = await loansWorld();
    const fields = async (body: unknown) => Object.keys((await json(await repay(w.adminLogin, w.loan.id, body))).error.details.fields);
    expect(await fields(cash(w, 100, { fundAccountId: undefined }))).toContain("fundAccountId");
    expect(await fields(cash(w, 100, { method: undefined }))).toContain("method");
    expect(await fields(cash(w, 100, { method: "BKASH" }))).toContain("referenceNo");
    expect(await fields(cash(w, 0))).toContain("amountPaisa");
    expect(await fields(cash(w, 100, { date: "2026-12-01" }))).toContain("date");
    expect(await fields({ mode: "OTHER", amountPaisa: 100, date: "2026-10-15" })).toContain("mode");
    expect((await repay(w.adminLogin, w.loan.id, cash(w, 100, { method: "BKASH", referenceNo: "8FJ2K1" }))).status).toBe(201);
  });

  it("needs an open month, refuses Owners and replays a retry", async () => {
    const w = await loansWorld();
    expect((await repay(w.ownerLogin, w.loan.id, cash(w, 100))).status).toBe(403);
    const a = await data(await repay(w.adminLogin, w.loan.id, cash(w, 100), "repay-key-1"));
    const b = await data(await repay(w.adminLogin, w.loan.id, cash(w, 100), "repay-key-1"));
    expect(b.movement.id).toBe(a.movement.id);
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    expect((await json(await repay(w.adminLogin, w.loan.id, cash(w, 100)))).error.code).toBe("NO_OPEN_PERIOD");
  });

  it("concurrent repayments never take more than the outstanding", async () => {
    const w = await loansWorld();
    const results = await Promise.all([repay(w.adminLogin, w.loan.id, cash(w, 2000000)), repay(w.adminLogin, w.loan.id, cash(w, 2000000))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
  });
});
