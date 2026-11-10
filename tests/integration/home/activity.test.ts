// Home read model — Latest activity (Home PRD F8, Rule 5, Rule 6).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { latestActivity } from "@/lib/home/activity";
import { prisma } from "@/lib/prisma";
import { createLoan, createLoanMovement, createProperty, createTxn } from "../../helpers/factory";
import { distributionWorld, type DistWorld } from "../../helpers/distribution";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const expense = (w: DistWorld, code: string, amountPaisa: number, txnDate: string, extra: { voided?: string; vendor?: string } = {}) =>
  createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories[code].id, amountPaisa, txnDate, ...extra });

describe("latestActivity", () => {
  it("lists the 6 newest money events across income, expenses, advances, loans and repayments", async () => {
    const w = await distributionWorld(); // 4 txns on 10 Oct + Nasrin's advance on 12 Oct + Tanvir's loan in June.
    await prisma.ownerLedgerEntry.updateMany({ where: { ownerId: w.owners.nasrin.id, type: "ADVANCE" }, data: { referenceNo: "TX4134", method: "BANK" } });
    await expense(w, "WATER", 360000, "2026-10-14");
    await expense(w, "GAS", 108000, "2026-10-15", { vendor: "Titas Gas" });
    await createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id, type: "CASH_REPAYMENT", amountPaisa: -200000, fundAccountId: w.cash.id, movementDate: "2026-10-16" });
    const items = await latestActivity(w.property.id);
    expect(items).toHaveLength(6);
    expect(items.map((i) => [i.kind, i.date, i.amountPaisa])).toEqual([
      ["REPAYMENT", "2026-10-16", 200000],
      ["EXPENSE", "2026-10-15", -108000],
      ["EXPENSE", "2026-10-14", -360000],
      ["ADVANCE", "2026-10-12", -500000],
      expect.arrayContaining(["2026-10-10"]),
      expect.arrayContaining(["2026-10-10"]),
    ]);
    expect(items[0]).toMatchObject({ owner: { id: w.owners.tanvir.id, name: "Tanvir Ahmed" }, entryId: null });
    expect(items[1]).toMatchObject({ category: { nameEn: w.categories.GAS.nameEn, nameBn: w.categories.GAS.nameBn }, description: "Titas Gas", month: "2026-10" });
    expect(items[3]).toMatchObject({ owner: { id: w.owners.nasrin.id, name: "Nasrin Ahmed" }, method: "BANK", reference: "TX4134", category: null });
  });

  it("leaves out voided entries, void reversals, cancelled loans and reversed repayments", async () => {
    const w = await distributionWorld();
    await expense(w, "GAS", 108000, "2026-10-20", { voided: "Typo" });
    const p = await w.entry(w.owners.farzana.id, "PAYOUT", -100000, { fundAccountId: w.cash.id, entryDate: "2026-10-19", voided: "Wrong owner" });
    await w.entry(w.owners.farzana.id, "REVERSAL", 100000, { fundAccountId: w.cash.id, reversesId: p.id, entryDate: "2026-10-19" });
    await createLoan({ propertyId: w.property.id, ownerId: w.owners.farzana.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100000, status: "CANCELLED", disbursedOn: "2026-10-18" });
    const m = await createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id, type: "CASH_REPAYMENT", amountPaisa: -200000, fundAccountId: w.cash.id, movementDate: "2026-10-17" });
    await prisma.loanMovement.update({ where: { id: m.id }, data: { voidedAt: new Date(), voidReason: "Wrong loan", voidedById: w.admin.id } });
    await createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id, type: "REVERSAL", amountPaisa: 200000, fundAccountId: w.cash.id, reversesId: m.id, movementDate: "2026-10-17" });
    const items = await latestActivity(w.property.id);
    expect(items[0]).toMatchObject({ kind: "ADVANCE", date: "2026-10-12" });
    expect(items.some((i) => i.date > "2026-10-12")).toBe(false);
  });

  it("shows a payout and a loan with their owners", async () => {
    const w = await distributionWorld();
    await w.entry(w.owners.farzana.id, "PAYOUT", -870390, { fundAccountId: w.cash.id, entryDate: "2026-10-18", method: "BKASH" });
    const loan = await createLoan({ propertyId: w.property.id, ownerId: w.owners.rayhan.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 2000000, disbursedOn: "2026-10-19" });
    const items = await latestActivity(w.property.id);
    expect(items[0]).toMatchObject({ kind: "LOAN", id: loan.id, owner: { name: "Rayhan Ahmed" }, amountPaisa: -2000000, method: "CASH" });
    expect(items[1]).toMatchObject({ kind: "PAYOUT", owner: { name: "Farzana Haque" }, amountPaisa: -870390, method: "BKASH" });
  });

  it("is empty for a house with no money events", async () => {
    const p = await createProperty();
    expect(await latestActivity(p.id)).toEqual([]);
  });
});
