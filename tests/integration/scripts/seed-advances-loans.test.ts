import { describe, expect, it } from "vitest";
import { activeLoans } from "@/lib/loans/loan-service";
import { currentMonthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { MARKER_REASON, runAdvancesLoansSeed } from "@/scripts/seed-advances-loans";
import { runTestUserSeed } from "@/scripts/seed-test-users";
import { createFund, createOwner, createPeriod } from "../../helpers/factory";

/** The test users + an owner row for the Super Admin, an open month and a funded bank account. */
async function world() {
  await runTestUserSeed({});
  const property = await prisma.property.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: "test.admin" } });
  await createOwner(property.id, { userId: admin.id, displayName: "Test Admin" });
  await createPeriod(property.id, currentMonthKey());
  await createFund(property.id, { name: "Bank account", type: "BANK", openingPaisa: 50_000_000 });
  await createFund(property.id, { name: "Cash in hand", type: "CASH", openingPaisa: 0 });
  return property;
}

describe("seed:advances-loans", () => {
  it("refuses a non-local database and production", async () => {
    await expect(runAdvancesLoansSeed({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/x" })).rejects.toThrow(/non-local/);
    await expect(runAdvancesLoansSeed({ NODE_ENV: "production" })).rejects.toThrow(/production/);
  });

  it("explains what to run first when the test owners are missing", async () => {
    const property = await prisma.property.create({ data: { name: "Empty" } });
    await createPeriod(property.id, currentMonthKey());
    await expect(runAdvancesLoansSeed({})).rejects.toThrow(/db:seed:test-users/);
  });

  it("creates every loan state and advance through the services, tied to the test owners", async () => {
    const property = await world();
    const result = await runAdvancesLoansSeed({});
    expect(result.skipped).toBe(false);

    const loans = await prisma.loan.findMany({ where: { propertyId: property.id }, include: { owner: true }, orderBy: { number: "asc" } });
    expect(loans.map((l) => [l.number, l.owner.displayName, l.status, l.isSelf, l.flagged])).toEqual([
      [1, "Tanvir Ahmed", "ACTIVE", false, false],
      [2, "Farzana Haque", "REPAID", false, false],
      [3, "Nasrin Ahmed", "CANCELLED", false, false],
      [4, "Test Admin", "ACTIVE", true, false],
      [5, "Tanvir Ahmed", "ACTIVE", false, true],
    ]);
    expect(loans[0].installmentPaisa).toBe(BigInt(300_000));
    const outstanding = new Map((await activeLoans(prisma, property.id)).map((l) => [l.number, l.outstandingPaisa]));
    expect(Object.fromEntries(outstanding)).toEqual({ 1: 4_500_000, 4: 1_500_000, 5: 800_000 });
    expect(await prisma.loanMovement.count({ where: { type: "REVERSAL" } })).toBe(1);

    const advances = await prisma.ownerLedgerEntry.findMany({ where: { propertyId: property.id, type: "ADVANCE" }, include: { owner: true }, orderBy: { createdAt: "asc" } });
    expect(advances.map((a) => [a.owner.displayName, Number(a.amountPaisa), a.voidedAt !== null])).toEqual([
      ["Nasrin Ahmed", -500_000, false],
      ["Tanvir Ahmed", -3_000_000, false],
      ["Farzana Haque", -200_000, true],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "loan.created", userAgent: "seed:advances-loans" } })).toBe(5);
  });

  it("runs once: a second run changes nothing", async () => {
    const property = await world();
    await runAdvancesLoansSeed({});
    const before = await prisma.loan.count({ where: { propertyId: property.id } });
    expect(await runAdvancesLoansSeed({})).toEqual({ skipped: true, rows: [] });
    expect(await prisma.loan.count({ where: { propertyId: property.id } })).toBe(before);
    expect(await prisma.loan.count({ where: { reason: MARKER_REASON } })).toBe(1);
  });
});
