import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createLoan, createOwner, createShareSet, moneyWorld } from "../../helpers/factory";

async function world() {
  const w = await moneyWorld();
  const owner = await createOwner(w.property.id, { displayName: "Nasrin Ahmed" });
  const entry = (data: Partial<Parameters<typeof createLedgerEntry>[0]>) =>
    createLedgerEntry({ propertyId: w.property.id, ownerId: owner.id, periodId: w.oct.id, createdById: w.admin.id, type: "ADJUSTMENT", amountPaisa: 100, ...data });
  return { ...w, ownerRow: owner, entry };
}

describe("owners schema guards", () => {
  it("allows many name-only owners but links a user to one owner only", async () => {
    const w = await world();
    await createOwner(w.property.id);
    await createOwner(w.property.id);
    await createOwner(w.property.id, { userId: w.owner.id });
    await expect(createOwner(w.property.id, { userId: w.owner.id })).rejects.toThrow();
  });

  it("rejects zero amounts and wrong signs", async () => {
    const w = await world();
    await expect(w.entry({ amountPaisa: 0 })).rejects.toThrow();
    await expect(w.entry({ type: "PAYOUT", amountPaisa: 100, fundAccountId: w.cash.id })).rejects.toThrow();
    await expect(w.entry({ type: "PAYOUT", amountPaisa: -100 })).rejects.toThrow();
    await expect(w.entry({ type: "ENTITLEMENT", amountPaisa: -100 })).rejects.toThrow();
    await expect(w.entry({ type: "REVERSAL", amountPaisa: 100 })).rejects.toThrow();
  });

  it("keeps one OPENING per owner and one reversal per original", async () => {
    const w = await world();
    await w.entry({ type: "OPENING", amountPaisa: 100 });
    await expect(w.entry({ type: "OPENING", amountPaisa: 200 })).rejects.toThrow();
    const payout = await w.entry({ type: "PAYOUT", amountPaisa: -100, fundAccountId: w.cash.id });
    await w.entry({ type: "REVERSAL", amountPaisa: 100, fundAccountId: w.cash.id, reversesId: payout.id });
    await expect(w.entry({ type: "REVERSAL", amountPaisa: 100, fundAccountId: w.cash.id, reversesId: payout.id })).rejects.toThrow();
  });

  it("requires void fields together", async () => {
    const w = await world();
    const e = await w.entry({ type: "PAYOUT", amountPaisa: -100, fundAccountId: w.cash.id });
    await expect(prisma.ownerLedgerEntry.update({ where: { id: e.id }, data: { voidedAt: new Date() } })).rejects.toThrow();
  });

  it("blocks writes in a CLOSED period except marking a void", async () => {
    const w = await world();
    await expect(w.entry({ periodId: w.sep.id })).rejects.toThrow(/PERIOD_CLOSED/);
    const e = await w.entry({ type: "PAYOUT", amountPaisa: -100, fundAccountId: w.cash.id });
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    await expect(prisma.$executeRaw`UPDATE owner_ledger_entries SET amount_paisa = -5 WHERE id = ${e.id}::uuid`).rejects.toThrow(/PERIOD_CLOSED/);
    await prisma.ownerLedgerEntry.update({ where: { id: e.id }, data: { voidedAt: new Date(), voidedById: w.admin.id, voidReason: "Wrong owner" } });
    await expect(prisma.$executeRaw`UPDATE owner_ledger_entries SET void_reason = 'changed' WHERE id = ${e.id}::uuid`).rejects.toThrow(/PERIOD_CLOSED/);
  });

  it("keeps one active share set per month and units ≥ 0", async () => {
    const w = await world();
    await createShareSet(w.property.id, w.admin.id, "2026-10", { [w.ownerRow.id]: 10 });
    await createShareSet(w.property.id, w.admin.id, "2026-10", { [w.ownerRow.id]: 5 }, { replaced: true });
    await expect(createShareSet(w.property.id, w.admin.id, "2026-10", { [w.ownerRow.id]: 20 })).rejects.toThrow();
    await expect(createShareSet(w.property.id, w.admin.id, "2026-11", { [w.ownerRow.id]: -1 })).rejects.toThrow();
  });

  it("never deletes owners, share sets, ledger entries or loans", async () => {
    const w = await world();
    const s = await createShareSet(w.property.id, w.admin.id, "2026-10", { [w.ownerRow.id]: 10 });
    const e = await w.entry({});
    const l = await createLoan({ propertyId: w.property.id, ownerId: w.ownerRow.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 100 });
    await expect(prisma.$executeRaw`DELETE FROM owner_ledger_entries WHERE id = ${e.id}::uuid`).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.$executeRaw`DELETE FROM loans WHERE id = ${l.id}::uuid`).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.$executeRaw`DELETE FROM share_set_items WHERE share_set_id = ${s.id}::uuid`).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.$executeRaw`DELETE FROM share_sets WHERE id = ${s.id}::uuid`).rejects.toThrow(/cannot be deleted/);
    await expect(prisma.$executeRaw`DELETE FROM owners WHERE id = ${w.ownerRow.id}::uuid`).rejects.toThrow(/cannot be deleted/);
    await expect(createLoan({ propertyId: w.property.id, ownerId: w.ownerRow.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 0 })).rejects.toThrow();
  });
});
