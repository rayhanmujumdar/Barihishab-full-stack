import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createMoneyRequest, createOwner, createTxn, moneyWorld } from "../../helpers/factory";

async function world() {
  const w = await moneyWorld();
  const owner = await createOwner(w.property.id, { userId: w.owner.id, displayName: "Nasrin Ahmed" });
  const request = await createMoneyRequest({ propertyId: w.property.id, ownerId: owner.id, createdById: w.owner.id, amountPaisa: 1000000 });
  return { ...w, ownerRow: owner, request };
}

describe("money_requests schema guards (Requests design D1)", () => {
  it("never deletes a request", async () => {
    const w = await world();
    await expect(prisma.moneyRequest.delete({ where: { id: w.request.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("refuses a zero request and an approved amount outside ৳1…requested", async () => {
    const w = await world();
    await expect(createMoneyRequest({ propertyId: w.property.id, ownerId: w.ownerRow.id, createdById: w.owner.id, amountPaisa: 0 })).rejects.toThrow();
    await expect(createMoneyRequest({ propertyId: w.property.id, ownerId: w.ownerRow.id, createdById: w.owner.id, amountPaisa: 99 })).rejects.toThrow(/mr_requested_range/);
    await expect(prisma.moneyRequest.update({ where: { id: w.request.id }, data: { amountApprovedPaisa: BigInt(1000001) } })).rejects.toThrow(/mr_approved_range/);
    await expect(prisma.moneyRequest.update({ where: { id: w.request.id }, data: { amountApprovedPaisa: BigInt(99) } })).rejects.toThrow(/mr_approved_range/);
    await prisma.moneyRequest.update({ where: { id: w.request.id }, data: { amountApprovedPaisa: BigInt(100) } });
  });

  it("keeps numbers unique per property and year", async () => {
    const w = await world();
    await expect(
      prisma.moneyRequest.create({
        data: { ...w.request, id: undefined, createdAt: undefined, updatedAt: undefined, amountApprovedPaisa: null },
      }),
    ).rejects.toThrow();
    const next = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.ownerRow.id, createdById: w.owner.id, year: 2027 });
    expect(next.number).toBe(1);
  });

  it("links at most one advance, loan and expense to a request", async () => {
    const w = await world();
    const p = w.property.id;
    const adv = await createLedgerEntry({ propertyId: p, ownerId: w.ownerRow.id, periodId: w.oct.id, createdById: w.admin.id, type: "ADVANCE", amountPaisa: -100, fundAccountId: w.cash.id });
    await prisma.ownerLedgerEntry.update({ where: { id: adv.id }, data: { requestId: w.request.id } });
    const adv2 = await createLedgerEntry({ propertyId: p, ownerId: w.ownerRow.id, periodId: w.oct.id, createdById: w.admin.id, type: "ADVANCE", amountPaisa: -100, fundAccountId: w.cash.id });
    await expect(prisma.ownerLedgerEntry.update({ where: { id: adv2.id }, data: { requestId: w.request.id } })).rejects.toThrow();

    const l1 = await createLoan({ propertyId: p, ownerId: w.ownerRow.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100 });
    const l2 = await createLoan({ propertyId: p, ownerId: w.ownerRow.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100 });
    await prisma.loan.update({ where: { id: l1.id }, data: { requestId: w.request.id, origin: "REQUEST" } });
    await expect(prisma.loan.update({ where: { id: l2.id }, data: { requestId: w.request.id } })).rejects.toThrow();

    const grant = w.categories.OWNER_GRANT;
    const t1 = await createTxn({ propertyId: p, periodId: w.oct.id, categoryId: grant.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "EXPENSE", amountPaisa: 100 });
    await prisma.houseTransaction.update({ where: { id: t1.id }, data: { requestId: w.request.id, source: "REQUEST_GRANT" } });
    const t2 = await createTxn({ propertyId: p, periodId: w.oct.id, categoryId: grant.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "EXPENSE", amountPaisa: 100 });
    await expect(prisma.houseTransaction.update({ where: { id: t2.id }, data: { requestId: w.request.id, source: "REQUEST_GRANT" } })).rejects.toThrow();
  });

  it("links requests only to ADVANCE entries and REQUEST_GRANT expenses", async () => {
    const w = await world();
    const pay = await createLedgerEntry({ propertyId: w.property.id, ownerId: w.ownerRow.id, periodId: w.oct.id, createdById: w.admin.id, type: "PAYOUT", amountPaisa: -100, fundAccountId: w.cash.id });
    await expect(prisma.ownerLedgerEntry.update({ where: { id: pay.id }, data: { requestId: w.request.id } })).rejects.toThrow(/ole_request_advance/);
    const grant = w.categories.OWNER_GRANT;
    const t = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: grant.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "EXPENSE", amountPaisa: 100 });
    await expect(prisma.houseTransaction.update({ where: { id: t.id }, data: { requestId: w.request.id } })).rejects.toThrow(/ht_request_grant/);
  });

  it("defaults attachments to not private", async () => {
    const w = await world();
    const a = await prisma.attachment.create({ data: { propertyId: w.property.id, storageKey: `k-${w.request.id}`, fileName: "bill.pdf", mime: "application/pdf", sizeBytes: 10, uploadedById: w.owner.id } });
    expect(a.isPrivate).toBe(false);
  });
});
