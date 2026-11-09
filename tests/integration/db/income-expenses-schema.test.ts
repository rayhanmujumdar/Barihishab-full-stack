import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTxn, moneyWorld } from "../../helpers/factory";

describe("income & expenses schema guards", () => {
  it("allows one period per property and month", async () => {
    const w = await moneyWorld();
    await expect(prisma.period.create({ data: { propertyId: w.property.id, month: w.oct.month } })).rejects.toThrow();
  });

  it("keeps category codes unique per property", async () => {
    const w = await moneyWorld();
    await expect(
      prisma.category.create({ data: { propertyId: w.property.id, kind: "INCOME", code: "RENT", nameEn: "x", nameBn: "x" } }),
    ).rejects.toThrow();
  });

  it("rejects zero amounts, from-reserve income and half-filled voids", async () => {
    const w = await moneyWorld();
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await expect(createTxn({ ...base, categoryId: w.categories.ELEC.id, amountPaisa: 0 })).rejects.toThrow();
    await expect(createTxn({ ...base, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, fromReserve: true })).rejects.toThrow();
    const t = await createTxn({ ...base, categoryId: w.categories.ELEC.id });
    await expect(prisma.houseTransaction.update({ where: { id: t.id }, data: { voidedAt: new Date() } })).rejects.toThrow();
  });

  it("blocks direct inserts and updates in a CLOSED period", async () => {
    const w = await moneyWorld();
    const base = { propertyId: w.property.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.ELEC.id };
    await expect(createTxn({ ...base, periodId: w.sep.id })).rejects.toThrow(/PERIOD_CLOSED/);

    const t = await createTxn({ ...base, periodId: w.oct.id });
    await expect(prisma.houseTransaction.update({ where: { id: t.id }, data: { periodId: w.sep.id } })).rejects.toThrow(/PERIOD_CLOSED/);

    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    await expect(prisma.$executeRaw`UPDATE house_transactions SET amount_paisa = 1 WHERE id = ${t.id}::uuid`).rejects.toThrow(/PERIOD_CLOSED/);
  });

  it("never deletes financial rows", async () => {
    const w = await moneyWorld();
    const t = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.ELEC.id });
    await expect(prisma.$executeRaw`DELETE FROM house_transactions WHERE id = ${t.id}::uuid`).rejects.toThrow(/cannot be deleted/);
    const a = await prisma.attachment.create({
      data: { propertyId: w.property.id, storageKey: "k1", fileName: "a.pdf", mime: "application/pdf", sizeBytes: 10, uploadedById: w.admin.id },
    });
    await expect(prisma.$executeRaw`DELETE FROM attachments WHERE id = ${a.id}::uuid`).rejects.toThrow(/cannot be deleted/);
  });
});
