import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { houseFundBalance, listFunds } from "@/lib/master-data/fund-service";
import { prisma } from "@/lib/prisma";
import { createFund, createLedgerEntry, createLoan, createLoanMovement, createTxn, createUser } from "../../helpers/factory";
import { distributionWorld } from "../../helpers/distribution";
import { loginAs, json } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { getReport, reportData } from "../../helpers/reports";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

type FundRow = { fundAccountId: string; name: string } & Record<string, number>;
const rowOf = (d: { rows: FundRow[] }, id: string) => d.rows.find((r) => r.fundAccountId === id)!;

describe("GET /api/v1/reports/funds (F11, G11)", () => {
  it("rolls each account from opening to closing for a month", async () => {
    const w = await distributionWorld();
    // Tanvir's ৳35,000 loan left Cash in June (before October).
    const d = await reportData("funds", w.ownerLogin, "month=2026-10");
    expect(d.period).toEqual({ kind: "month", month: "2026-10" });
    expect(rowOf(d, w.cash.id)).toMatchObject({
      openingPaisa: -3500000,
      incomePaisa: 10300000,
      expensesPaisa: 1398000,
      ownerPaymentsPaisa: 500000,
      loansOutPaisa: 0,
      loanRepaymentsPaisa: 0,
      closingPaisa: 4902000,
    });
    expect(rowOf(d, w.bank.id)).toMatchObject({ openingPaisa: 0, closingPaisa: 0 });
    expect(d.totals.closingPaisa).toBe(4902000);
  });

  it("counts loans by disbursal month and nets repayments, payout voids and their reversals", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, periodId: w.oct.id, createdById: w.admin.id };
    const loan = await createLoan({ ...base, ownerId: w.owners.farzana.id, fundAccountId: w.bank.id, principalPaisa: 1000000, disbursedOn: "2026-10-02" });
    const repay = await createLoanMovement({ ...base, loanId: loan.id, type: "CASH_REPAYMENT", amountPaisa: -300000, fundAccountId: w.bank.id });
    await createLoanMovement({ ...base, loanId: loan.id, type: "CASH_REPAYMENT", amountPaisa: -100000, fundAccountId: w.bank.id });
    await createLoanMovement({ ...base, loanId: loan.id, type: "REVERSAL", amountPaisa: 300000, fundAccountId: w.bank.id, reversesId: repay.id });
    const payout = await createLedgerEntry({ ...base, ownerId: w.owners.rayhan.id, type: "PAYOUT", amountPaisa: -250000, fundAccountId: w.bank.id, voided: "Wrong account" });
    await createLedgerEntry({ ...base, ownerId: w.owners.rayhan.id, type: "REVERSAL", amountPaisa: 250000, fundAccountId: w.bank.id, reversesId: payout.id });
    await createTxn({ ...base, fundAccountId: w.bank.id, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, amountPaisa: 2000000 });
    const d = await reportData("funds", w.adminLogin, "month=2026-10");
    expect(rowOf(d, w.bank.id)).toMatchObject({ openingPaisa: 0, incomePaisa: 2000000, ownerPaymentsPaisa: 0, loansOutPaisa: 1000000, loanRepaymentsPaisa: 100000, closingPaisa: 1100000 });
  });

  it("covers a whole year from the 1 Jan opening", async () => {
    const w = await distributionWorld();
    const d = await reportData("funds", w.ownerLogin, "year=2026");
    expect(d.period).toEqual({ kind: "year", year: 2026 });
    expect(rowOf(d, w.cash.id)).toMatchObject({ openingPaisa: 0, loansOutPaisa: 3500000, closingPaisa: 4902000 });
    expect(d.years).toEqual([2026]);
    expect(d.months.map((m: { key: string }) => m.key)).toEqual(["2026-10", "2026-09"]);
  });

  it("closes the current month at the Settings balance and the House Fund total", async () => {
    const w = await distributionWorld();
    const opened = await createFund(w.property.id, { name: "bKash", type: "WALLET", openingPaisa: 750000 });
    await createFund(w.property.id, { name: "Old wallet", type: "WALLET", isActive: false });
    const d = await reportData("funds", w.adminLogin, "month=2026-10");
    const funds = await listFunds(w.property.id);
    for (const f of funds.filter((x) => x.isActive)) expect(rowOf(d, f.id).closingPaisa, f.name).toBe(f.balancePaisa);
    expect(rowOf(d, opened.id)).toMatchObject({ openingPaisa: 750000, closingPaisa: 750000 });
    expect(d.rows.some((r: FundRow) => r.name === "Old wallet")).toBe(false);
    const active = d.rows.filter((r: FundRow & { isActive: boolean }) => r.isActive).reduce((s: number, r: FundRow) => s + r.closingPaisa, 0);
    expect(active).toBe(await houseFundBalance(prisma, w.property.id));
  });

  it("counts an account's opening balance only from the month it opened", async () => {
    const w = await distributionWorld();
    const wallet = await createFund(w.property.id, { name: "bKash", type: "WALLET", openingPaisa: 750000 });
    await prisma.fundAccount.update({ where: { id: wallet.id }, data: { openingDate: new Date("2026-10-15T00:00:00Z") } });
    const sep = await reportData("funds", w.ownerLogin, "month=2026-09");
    expect(rowOf(sep, wallet.id)).toMatchObject({ openingPaisa: 0, closingPaisa: 0 });
    const oct = await reportData("funds", w.ownerLogin, "month=2026-10");
    expect(rowOf(oct, wallet.id)).toMatchObject({ openingPaisa: 750000, closingPaisa: 750000 });
    const year = await reportData("funds", w.ownerLogin, "year=2026");
    expect(rowOf(year, wallet.id)).toMatchObject({ openingPaisa: 750000, closingPaisa: 750000 });
  });

  it("needs exactly one of month or year and report.view", async () => {
    const w = await distributionWorld();
    const none = await getReport("funds", w.ownerLogin);
    expect(none.status).toBe(422);
    expect((await json(none)).error.code).toBe("VALIDATION_FAILED");
    expect((await getReport("funds", w.ownerLogin, "month=2026-10&year=2026")).status).toBe(422);
    expect((await getReport("funds", null, "month=2026-10")).status).toBe(401);
    expect((await getReport("funds", await loginAs(await createUser({ roles: ["VIEWER"] })), "month=2026-10")).status).toBe(403);
    expect((await getReport("funds", w.ownerLogin, "month=2026-10")).headers.get("cache-control")).toBe("no-store");
  });
});
