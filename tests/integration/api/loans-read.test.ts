import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loansRoute from "@/app/api/v1/loans/route";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createPeriod, setPeriodStatus } from "../../helpers/factory";
import { apiRequest, json, params } from "../../helpers/http";
import { createLoanApi, data, getLoan, listLoans, loansWorld, patchLoan } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

/** Tanvir's L1: ৳50,000 from June, instalment ৳5,000, deducted on the July–August closes; September skipped. */
async function world() {
  const w = await loansWorld();
  await prisma.loan.update({ where: { id: w.loan.id }, data: { principalPaisa: BigInt(5000000), installmentPaisa: BigInt(500000) } });
  for (const month of ["2026-07", "2026-08"]) {
    const p = await createPeriod(w.property.id, month);
    const last = month === "2026-07" ? "31" : "31";
    await createLedgerEntry({ propertyId: w.property.id, ownerId: w.owners.tanvir.id, periodId: p.id, createdById: w.admin.id, type: "LOAN_DEDUCTION", amountPaisa: -500000, loanId: w.loan.id, entryDate: `${month}-${last}` });
    await setPeriodStatus(p.id, "CLOSED");
  }
  await prisma.period.update({ where: { id: w.sep.id }, data: { snapshot: { skippedLoans: [{ ownerId: w.owners.tanvir.id, loanId: w.loan.id }] } } });
  const repaid = await createLoan({ propertyId: w.property.id, ownerId: w.owners.farzana.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 2000000, status: "REPAID", disbursedOn: "2026-02-12" });
  return { ...w, repaid };
}

describe("GET /api/v1/loans (F1, F2, G7)", () => {
  it("lists every loan newest first with figures, schedule and last movements; summary ignores filters", async () => {
    const w = await world();
    const d = await data(await listLoans(w.ownerLogin));
    expect(d.loans.map((l: { number: number }) => l.number)).toEqual([1, 2]);
    expect(d.loans[0]).toMatchObject({
      number: 1,
      ownerName: "Tanvir Ahmed",
      status: "ACTIVE",
      principalPaisa: 5000000,
      repaidPaisa: 1000000,
      outstandingPaisa: 4000000,
      expectedFinishMonth: "2027-05",
      nextDeduction: { amountPaisa: 500000, month: "2026-10" },
    });
    expect(d.loans[0].recentMovements.map((m: { kind: string }) => m.kind)).toEqual(["DEDUCTION", "DEDUCTION", "SKIPPED"]);
    expect(d.loans[1]).toMatchObject({ number: 2, status: "REPAID", expectedFinishMonth: null, nextDeduction: null });
    expect(d.summary).toEqual({ loansOutstandingPaisa: 4000000, activeLoans: 1 });

    const active = await data(await listLoans(w.adminLogin, "?status=ACTIVE"));
    expect(active.loans.map((l: { number: number }) => l.number)).toEqual([1]);
    expect(active.summary).toEqual({ loansOutstandingPaisa: 4000000, activeLoans: 1 });
    const farzana = await data(await listLoans(w.adminLogin, `?ownerId=${w.owners.farzana.id}`));
    expect(farzana.loans.map((l: { number: number }) => l.number)).toEqual([2]);
  });

  it("refuses bad filters and anonymous callers", async () => {
    const w = await world();
    expect((await listLoans(w.adminLogin, "?status=OPEN")).status).toBe(422);
    expect((await listLoans(w.adminLogin, "?ownerId=nope")).status).toBe(422);
    expect((await loansRoute.GET(apiRequest("/loans"), params({}))).status).toBe(401);
  });
});

describe("GET /api/v1/loans/:id (F3, F6)", () => {
  it("returns the movement history oldest first with running outstanding, skipped notes and change history", async () => {
    const w = await world();
    await patchLoan(w.adminLogin, w.loan.id, { installmentPaisa: 300000, reason: "Reduced until March at owner's request" });
    const d = await data(await getLoan(w.ownerLogin, w.loan.id));
    expect(d.loan).toMatchObject({ number: 1, ownerName: "Tanvir Ahmed", fundAccountName: "Cash — with Rayhan", method: "CASH", repaidCashPaisa: 0, repaidDeductionPaisa: 1000000, outstandingPaisa: 4000000, installmentPaisa: 300000 });
    expect(d.movements.map((m: { kind: string; amountPaisa: number; runningPaisa: number; voidable: boolean; date: string }) => [m.kind, m.date, m.amountPaisa, m.runningPaisa, m.voidable])).toEqual([
      ["DISBURSED", "2026-06-10", 5000000, 5000000, false],
      ["DEDUCTION", "2026-07-31", 500000, 4500000, false],
      ["DEDUCTION", "2026-08-31", 500000, 4000000, false],
      ["SKIPPED", "2026-09-30", 0, 4000000, false],
    ]);
    expect(d.changes).toEqual([
      expect.objectContaining({ action: "loan.updated", by: "Rayhan Ahmed", reason: "Reduced until March at owner's request", before: { installmentPaisa: 500000 }, after: { installmentPaisa: 300000 } }),
    ]);
  });

  it("shows the payment a split loan came from", async () => {
    const w = await world();
    await prisma.loan.update({ where: { id: w.loan.id }, data: { origin: "PAYOUT_SPLIT" } });
    expect((await data(await getLoan(w.adminLogin, w.loan.id))).loan.origin).toBe("PAYOUT_SPLIT");
    const direct = await data(await createLoanApi(w.adminLogin, { ownerId: w.owners.nasrin.id, amountPaisa: 100000, date: "2026-10-12", fundAccountId: w.house.id, method: "CASH", reason: "Repairs" }));
    expect((await data(await getLoan(w.adminLogin, direct.loan.id))).loan.origin).toBe("DIRECT");
  });

  it("404s on unknown ids", async () => {
    const w = await world();
    expect((await getLoan(w.adminLogin, randomUUID())).status).toBe(404);
    expect((await json(await getLoan(w.adminLogin, "nope"))).error.code).toBe("NOT_FOUND");
  });
});
