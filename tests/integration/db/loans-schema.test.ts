import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createLoanMovement, createOwner, createProperty, moneyWorld } from "../../helpers/factory";

const CATEGORY_SQL = readFileSync("prisma/migrations/20261110000100_loan_written_off_category/migration.sql", "utf8");
const LOANS_SQL = readFileSync("prisma/migrations/20261110000000_advances_loans/migration.sql", "utf8");
const GUARD_ON = 'ENABLE TRIGGER "ole_closed_guard";';
/** The migration's origin backfill, from lifting the closed-month guard to restoring it. */
const ORIGIN_BACKFILL = LOANS_SQL.slice(LOANS_SQL.indexOf('ALTER TABLE "owner_ledger_entries" DISABLE TRIGGER'), LOANS_SQL.indexOf(GUARD_ON) + GUARD_ON.length);

async function world() {
  const w = await moneyWorld();
  const owner = await createOwner(w.property.id, { displayName: "Tanvir Ahmed" });
  const loan = await createLoan({ propertyId: w.property.id, ownerId: owner.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 1000000 });
  return { ...w, ownerRow: owner, loan };
}

describe("advances & loans schema guards (design D1–D3)", () => {
  it("never deletes a loan movement", async () => {
    const w = await world();
    const m = await createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id, type: "CASH_REPAYMENT", amountPaisa: -100, fundAccountId: w.cash.id });
    await expect(prisma.loanMovement.delete({ where: { id: m.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("refuses a movement in a CLOSED month but allows marking it void", async () => {
    const w = await world();
    await expect(
      createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.sep.id, createdById: w.admin.id, type: "CASH_REPAYMENT", amountPaisa: -100, fundAccountId: w.cash.id }),
    ).rejects.toThrow(/PERIOD_CLOSED/);
    const m = await createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id, type: "CASH_REPAYMENT", amountPaisa: -100, fundAccountId: w.cash.id });
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    await prisma.loanMovement.update({ where: { id: m.id }, data: { voidedAt: new Date(), voidedById: w.admin.id, voidReason: "Wrong loan" } });
    await expect(prisma.loanMovement.update({ where: { id: m.id }, data: { note: "x" } })).rejects.toThrow(/PERIOD_CLOSED/);
  });

  it("keeps amounts non-zero, signed by type, and reversals linked", async () => {
    const w = await world();
    const base = { propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id };
    await expect(createLoanMovement({ ...base, type: "CASH_REPAYMENT", amountPaisa: 0, fundAccountId: w.cash.id })).rejects.toThrow();
    await expect(createLoanMovement({ ...base, type: "CASH_REPAYMENT", amountPaisa: 100, fundAccountId: w.cash.id })).rejects.toThrow();
    await expect(createLoanMovement({ ...base, type: "CASH_REPAYMENT", amountPaisa: -100 })).rejects.toThrow();
    await expect(createLoanMovement({ ...base, type: "REVERSAL", amountPaisa: 100, fundAccountId: w.cash.id })).rejects.toThrow();
    const m = await createLoanMovement({ ...base, type: "CASH_REPAYMENT", amountPaisa: -100, fundAccountId: w.cash.id });
    await createLoanMovement({ ...base, type: "REVERSAL", amountPaisa: 100, fundAccountId: w.cash.id, reversesId: m.id });
  });

  it("numbers loans uniquely per property", async () => {
    const w = await world();
    expect(w.loan.number).toBe(1);
    await expect(prisma.loan.update({ where: { id: (await createLoan({ propertyId: w.property.id, ownerId: w.ownerRow.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 5 })).id }, data: { number: 1 } })).rejects.toThrow();
  });

  it("defaults origins: loans DIRECT, ledger entries DIRECT", async () => {
    const w = await world();
    expect(w.loan.origin).toBe("DIRECT");
    const e = await createLedgerEntry({ propertyId: w.property.id, ownerId: w.ownerRow.id, periodId: w.oct.id, createdById: w.admin.id, type: "ADJUSTMENT", amountPaisa: 5 });
    expect(e.origin).toBe("DIRECT");
  });

  it("backfills origin on entitlements in CLOSED months, then restores the guard", async () => {
    const w = await world();
    const e = await createLedgerEntry({ propertyId: w.property.id, ownerId: w.ownerRow.id, periodId: w.oct.id, createdById: w.admin.id, type: "ENTITLEMENT", amountPaisa: 500000 });
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    const statements = ORIGIN_BACKFILL.split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    await prisma.$transaction(async (tx) => {
      for (const stmt of statements) await tx.$executeRawUnsafe(stmt);
    });
    expect((await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: e.id } })).origin).toBe("CLOSE");
    // The guard is back on: the closed month refuses edits again.
    await expect(prisma.ownerLedgerEntry.update({ where: { id: e.id }, data: { note: "x" } })).rejects.toThrow(/PERIOD_CLOSED/);
  });

  it("adds the system 'Loan written off' category to every property, once (F10)", async () => {
    const a = await createProperty();
    const b = await createProperty();
    await prisma.$executeRawUnsafe(CATEGORY_SQL);
    await prisma.$executeRawUnsafe(CATEGORY_SQL);
    for (const p of [a, b]) {
      const rows = await prisma.category.findMany({ where: { propertyId: p.id, code: "LOAN_WRITTEN_OFF" } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "EXPENSE", isSystem: true, nameEn: "Loan written off" });
    }
  });
});
