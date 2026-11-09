import { describe, expect, it } from "vitest";
import * as list from "@/app/api/v1/transactions/route";
import * as one from "@/app/api/v1/transactions/[id]/route";
import * as summary from "@/app/api/v1/transactions/summary/route";
import * as vendors from "@/app/api/v1/transactions/vendors/route";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createProperty, createTxn, createUnit, moneyWorld } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";

async function october() {
  const w = await moneyWorld();
  const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.bank.id, createdById: w.admin.id };
  const flat = await createUnit(w.property.id, { name: "Flat 1A" });
  const rent = await createTxn({ ...base, kind: "INCOME", categoryId: w.categories.RENT.id, unitId: flat.id, amountPaisa: 1800000, txnDate: "2026-10-05" });
  const elec = await createTxn({ ...base, categoryId: w.categories.ELEC.id, amountPaisa: 630000, txnDate: "2026-10-12", vendor: "DESCO" });
  const water = await createTxn({ ...base, categoryId: w.categories.WATER.id, amountPaisa: 360000, txnDate: "2026-10-14", vendor: "Dhaka WASA" });
  const voided = await createTxn({ ...base, categoryId: w.categories.WATER.id, amountPaisa: 50000, txnDate: "2026-10-15", voided: "Duplicate entry" });
  const pump = await createTxn({ ...base, categoryId: w.categories.REPAIR.id, amountPaisa: 1800000, txnDate: "2026-10-01", fromReserve: true });
  return { ...w, flat, rent, elec, water, voided, pump, owner: await loginAs(w.owner) };
}

describe("GET /api/v1/transactions (LST-01..04)", () => {
  it("lists newest first, keeps voided rows, and totals without them", async () => {
    const w = await october();
    const body = await json(await list.GET(apiRequest("/transactions?period=2026-10&kind=EXPENSE", { login: w.owner }), params({})));
    expect(body.data.items.map((t: { id: string }) => t.id)).toEqual([w.voided.id, w.water.id, w.elec.id, w.pump.id]);
    expect(body.data.items[0]).toMatchObject({ voidReason: "Duplicate entry", voidedAt: expect.any(String) });
    // Tab total = Expense(P): excludes voided and From-Reserve rows.
    expect(body.data.totalPaisa).toBe(990000);
  });

  it("filters by category code, including From-Reserve rows in that category", async () => {
    const w = await october();
    const water = await json(await list.GET(apiRequest("/transactions?period=2026-10&kind=EXPENSE&category=WATER", { login: w.owner }), params({})));
    expect(water.data.items).toHaveLength(2);
    expect(water.data.totalPaisa).toBe(360000);
    const repair = await json(await list.GET(apiRequest("/transactions?period=2026-10&kind=EXPENSE&category=REPAIR", { login: w.owner }), params({})));
    expect(repair.data.totalPaisa).toBe(1800000);
  });

  it("paginates with a cursor and counts attachments", async () => {
    const w = await october();
    await prisma.attachment.create({
      data: { propertyId: w.property.id, storageKey: "k", fileName: "bill.png", mime: "image/png", sizeBytes: 10, uploadedById: w.admin.id, entityId: w.elec.id, linkedAt: new Date() },
    });
    const p1 = await json(await list.GET(apiRequest("/transactions?period=2026-10&kind=EXPENSE&limit=2", { login: w.owner }), params({})));
    expect(p1.data.items).toHaveLength(2);
    const p2 = await json(await list.GET(apiRequest(`/transactions?period=2026-10&kind=EXPENSE&limit=2&cursor=${p1.data.nextCursor}`, { login: w.owner }), params({})));
    expect(p2.data.items.map((t: { id: string }) => t.id)).toEqual([w.elec.id, w.pump.id]);
    expect(p2.data.items[0].attachmentCount).toBe(1);
    expect(p2.data.nextCursor).toBeNull();
  });

  it("returns an empty list for an unknown month", async () => {
    const w = await october();
    const body = await json(await list.GET(apiRequest("/transactions?period=2020-01", { login: w.owner }), params({})));
    expect(body.data).toEqual({ items: [], nextCursor: null, totalPaisa: 0 });
  });

  it("requires a valid period", async () => {
    const w = await october();
    expect((await list.GET(apiRequest("/transactions?period=Oct", { login: w.owner }), params({}))).status).toBe(422);
  });
});

describe("GET /api/v1/transactions/summary", () => {
  it("gives tab counts and totals and chips only for used categories (LST-02)", async () => {
    const w = await october();
    const body = await json(await summary.GET(apiRequest("/transactions/summary?period=2026-10", { login: w.owner }), params({})));
    expect(body.data).toMatchObject({
      period: "2026-10",
      status: "OPEN",
      totals: { incomePaisa: 1800000, expensePaisa: 990000, reserveSpentPaisa: 1800000, incomeCount: 1, expenseCount: 3 },
    });
    const chips = Object.fromEntries(body.data.categories.map((c: { code: string; count: number; totalPaisa: number }) => [c.code, [c.count, c.totalPaisa]]));
    expect(chips).toEqual({ RENT: [1, 1800000], ELEC: [1, 630000], WATER: [2, 360000], REPAIR: [1, 1800000] });
  });

  it("reports status null for an unknown month", async () => {
    const w = await october();
    const body = await json(await summary.GET(apiRequest("/transactions/summary?period=2020-01", { login: w.owner }), params({})));
    expect(body.data).toMatchObject({ status: null, categories: [] });
  });
});

describe("GET /api/v1/transactions/:id (DET-01)", () => {
  it("returns the entry with recorder, attachments and history oldest first", async () => {
    const w = await october();
    await prisma.$transaction(async (tx) => {
      await audit(tx, { actorId: w.admin.id, action: "transaction.updated", entityType: "house_transaction", entityId: w.elec.id, before: { amountPaisa: 603000 }, after: { amountPaisa: 630000 }, reason: "Typo — the DESCO bill reads ৳6,300" });
      await audit(tx, { actorId: w.admin.id, action: "transaction.voided", entityType: "house_transaction", entityId: w.elec.id, reason: "Duplicate entry" });
    });
    const body = await json(await one.GET(apiRequest(`/transactions/${w.elec.id}`, { login: w.owner }), params({ id: w.elec.id })));
    expect(body.data).toMatchObject({ id: w.elec.id, vendor: "DESCO", recordedBy: expect.any(String), attachments: [], periodStatus: "OPEN" });
    expect(body.data.history.map((h: { action: string }) => h.action)).toEqual(["transaction.created", "transaction.updated", "transaction.voided"]);
    expect(body.data.history[1]).toMatchObject({ before: { amountPaisa: 603000 }, after: { amountPaisa: 630000 }, reason: "Typo — the DESCO bill reads ৳6,300", actorName: expect.any(String) });
  });

  it("404s for another property's entry and bad ids", async () => {
    const w = await october();
    const other = await createProperty();
    await prisma.houseTransaction.update({ where: { id: w.water.id }, data: { propertyId: other.id } });
    expect((await one.GET(apiRequest(`/transactions/${w.water.id}`, { login: w.owner }), params({ id: w.water.id }))).status).toBe(404);
    expect((await one.GET(apiRequest(`/transactions/nope`, { login: w.owner }), params({ id: "nope" }))).status).toBe(404);
    expect((await one.GET(apiRequest(`/transactions/00000000-0000-4000-8000-000000000000`, { login: w.owner }), params({ id: "00000000-0000-4000-8000-000000000000" }))).status).toBe(404);
  });
});

describe("GET /api/v1/transactions/vendors (EXP-03)", () => {
  it("suggests distinct vendors by prefix, most used first", async () => {
    const w = await october();
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.bank.id, createdById: w.admin.id, categoryId: w.categories.ELEC.id };
    await createTxn({ ...base, vendor: "Dhaka WASA", txnDate: "2026-10-02" });
    const admin = await loginAs(w.admin);
    const d = await json(await vendors.GET(apiRequest("/transactions/vendors?q=d", { login: admin }), params({})));
    expect(d.data.items).toEqual(["Dhaka WASA", "DESCO"]);
    const dh = await json(await vendors.GET(apiRequest("/transactions/vendors?q=DH", { login: admin }), params({})));
    expect(dh.data.items).toEqual(["Dhaka WASA"]);
    expect((await vendors.GET(apiRequest("/transactions/vendors?q=d", { login: w.owner }), params({}))).status).toBe(403);
  });
});
