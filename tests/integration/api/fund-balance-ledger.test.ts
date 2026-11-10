import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as funds from "@/app/api/v1/fund-accounts/route";
import { POST as createTxnRoute } from "@/app/api/v1/transactions/route";
import { createFund, createLedgerEntry, createLoan, createLoanMovement, createOwner, createTxn, moneyWorld } from "../../helpers/factory";
import { prisma } from "@/lib/prisma";
import { apiRequest, json, loginAs, params } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("fund balances include owner payouts and loans (PRD §9.5 v_fund_balance)", () => {
  async function setup() {
    const w = await moneyWorld();
    const cash = await createFund(w.property.id, { name: "Cash", openingPaisa: 200000 });
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: cash.id, createdById: w.admin.id };
    await createTxn({ ...base, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, amountPaisa: 1800000 });
    await createTxn({ ...base, categoryId: w.categories.ELEC.id, amountPaisa: 630000 });
    const owner = await createOwner(w.property.id);
    const entry = { propertyId: w.property.id, ownerId: owner.id, periodId: w.oct.id, createdById: w.admin.id, fundAccountId: cash.id };
    await createLedgerEntry({ ...entry, type: "PAYOUT", amountPaisa: -400000 });
    const advance = await createLedgerEntry({ ...entry, type: "ADVANCE", amountPaisa: -100000, voided: "Wrong owner" });
    await createLedgerEntry({ ...entry, type: "REVERSAL", amountPaisa: 100000, reversesId: advance.id });
    await createLedgerEntry({ ...entry, fundAccountId: null, type: "ADJUSTMENT", amountPaisa: 999 });
    await createLoan({ propertyId: w.property.id, ownerId: owner.id, fundAccountId: cash.id, createdById: w.admin.id, principalPaisa: 200000 });
    await createLoan({ propertyId: w.property.id, ownerId: owner.id, fundAccountId: cash.id, createdById: w.admin.id, principalPaisa: 50000, status: "REPAID" });
    return { ...w, cash, ownerRow: owner };
  }

  const cashBalance = async (w: Awaited<ReturnType<typeof setup>>) =>
    (await json(await funds.GET(apiRequest("/fund-accounts", { login: await loginAs(w.owner) }), params({})))).data.items.find((f: { id: string }) => f.id === w.cash.id).balancePaisa;

  it("subtracts payouts, nets reversals, ignores adjustments and subtracts every disbursed loan whatever its status", async () => {
    const w = await setup();
    const body = await json(await funds.GET(apiRequest("/fund-accounts", { login: await loginAs(w.owner) }), params({})));
    // 1370000 − 400000 payout − 200000 active loan − 50000 repaid loan (its cash still left the fund).
    expect(body.data.items.find((f: { id: string }) => f.id === w.cash.id).balancePaisa).toBe(720000);
  });

  it("adds back cash repayments and cancellations; reversals take it out again (Advances & Loans F5, F8, F9)", async () => {
    const w = await setup();
    const loan = await prisma.loan.findFirstOrThrow({ where: { ownerId: w.ownerRow.id, principalPaisa: BigInt(200000) } });
    const base = { propertyId: w.property.id, periodId: w.oct.id, createdById: w.admin.id, fundAccountId: w.cash.id };
    await createLoanMovement({ ...base, loanId: loan.id, type: "CASH_REPAYMENT", amountPaisa: -50000 });
    const other = await createLoan({ propertyId: w.property.id, ownerId: w.ownerRow.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100000 });
    await createLoanMovement({ ...base, loanId: other.id, type: "CANCELLATION", amountPaisa: -100000 });
    // 720000 + 50000 cash repaid − 100000 disbursed + 100000 cancelled.
    expect(await cashBalance(w)).toBe(770000);
    const wrong = await createLoanMovement({ ...base, loanId: loan.id, type: "CASH_REPAYMENT", amountPaisa: -30000 });
    await createLoanMovement({ ...base, loanId: loan.id, type: "REVERSAL", amountPaisa: 30000, reversesId: wrong.id });
    expect(await cashBalance(w)).toBe(770000);
  });

  it("a write-off moves no cash: its movement offsets its house expense (F10)", async () => {
    const w = await setup();
    const loan = await prisma.loan.findFirstOrThrow({ where: { ownerId: w.ownerRow.id, principalPaisa: BigInt(200000) } });
    const before = await cashBalance(w);
    await createLoanMovement({ propertyId: w.property.id, periodId: w.oct.id, createdById: w.admin.id, fundAccountId: w.cash.id, loanId: loan.id, type: "WRITE_OFF", amountPaisa: -200000 });
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.ELEC.id, amountPaisa: 200000 });
    expect(await cashBalance(w)).toBe(before);
  });

  it("FUND_NEGATIVE on a new expense sees the payouts", async () => {
    const w = await setup();
    const res = await createTxnRoute(
      moneyPost("/transactions", await loginAs(w.admin), {
        period: "2026-10",
        kind: "EXPENSE",
        categoryId: w.categories.ELEC.id,
        amountPaisa: 800000,
        txnDate: "2026-10-12",
        fundAccountId: w.cash.id,
      }),
      params({}),
    );
    expect(res.status).toBe(201);
    expect((await json(res)).data.warnings).toContainEqual({ code: "FUND_NEGATIVE", fundAccountId: w.cash.id, balancePaisa: -80000 });
  });
});
