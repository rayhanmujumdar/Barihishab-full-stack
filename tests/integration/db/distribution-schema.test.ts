import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createOwner, moneyWorld } from "../../helpers/factory";

async function world() {
  const w = await moneyWorld();
  const owner = await createOwner(w.property.id, { displayName: "Tanvir Ahmed" });
  const loan = await createLoan({ propertyId: w.property.id, ownerId: owner.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 1000000 });
  const entry = (data: Partial<Parameters<typeof createLedgerEntry>[0]>) =>
    createLedgerEntry({ propertyId: w.property.id, ownerId: owner.id, periodId: w.oct.id, createdById: w.admin.id, type: "ADJUSTMENT", amountPaisa: 100, ...data });
  return { ...w, ownerRow: owner, loan, entry };
}

describe("distribution schema guards", () => {
  it("requires a non-negative reserve override with a reason", async () => {
    const w = await world();
    await expect(prisma.period.update({ where: { id: w.oct.id }, data: { reserveOverridePaisa: BigInt(-1), reserveOverrideReason: "x" } })).rejects.toThrow();
    await expect(prisma.period.update({ where: { id: w.oct.id }, data: { reserveOverridePaisa: BigInt(100) } })).rejects.toThrow();
    await prisma.period.update({ where: { id: w.oct.id }, data: { reserveOverridePaisa: BigInt(0), reserveOverrideReason: "No reserve this month" } });
  });

  it("never deletes reopen history", async () => {
    const w = await world();
    const row = await prisma.periodReopen.create({ data: { propertyId: w.property.id, periodId: w.sep.id, reason: "Missed bill", reopenedById: w.admin.id } });
    await expect(prisma.periodReopen.delete({ where: { id: row.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("keeps a loan instalment positive", async () => {
    const w = await world();
    await expect(prisma.loan.update({ where: { id: w.loan.id }, data: { installmentPaisa: BigInt(0) } })).rejects.toThrow();
    await prisma.loan.update({ where: { id: w.loan.id }, data: { installmentPaisa: BigInt(200000) } });
  });

  it("ties every loan deduction to a loan and keeps it negative", async () => {
    const w = await world();
    await expect(w.entry({ type: "LOAN_DEDUCTION", amountPaisa: -100 })).rejects.toThrow();
    await expect(w.entry({ type: "LOAN_DEDUCTION", amountPaisa: 100, loanId: w.loan.id })).rejects.toThrow();
    const d = await w.entry({ type: "LOAN_DEDUCTION", amountPaisa: -100, loanId: w.loan.id });
    await w.entry({ type: "REVERSAL", amountPaisa: 100, loanId: w.loan.id, reversesId: d.id });
  });

  it("still refuses an entitlement in a CLOSED month", async () => {
    const w = await world();
    await expect(w.entry({ type: "ENTITLEMENT", amountPaisa: 100, periodId: w.sep.id })).rejects.toThrow(/PERIOD_CLOSED/);
  });
});
