import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as save } from "@/app/api/v1/transactions/generate-rent/route";
import { POST as preview } from "@/app/api/v1/transactions/generate-rent/preview/route";
import { prisma } from "@/lib/prisma";
import { createTxn, createUnit, moneyWorld } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi, "2026-10-22T06:00:00Z"));
afterEach(() => vi.useRealTimers());

async function setup() {
  const w = await moneyWorld();
  const specs = [
    ["Flat 1A", 1800000, w.bank.id],
    ["Flat 1B", 1800000, w.bank.id],
    ["Flat 2A", 2000000, w.bank.id],
    ["Flat 2B", 2000000, w.bank.id],
    ["Flat 3A", 2200000, w.bank.id],
    ["Shop G1", 1200000, w.cash.id],
  ] as const;
  const units = [];
  for (const [i, [name, rent, fund]] of specs.entries()) units.push(await createUnit(w.property.id, { name, rentPaisa: rent, defaultFundAccountId: fund, tenantName: `Tenant ${i}` }));
  await prisma.unit.updateMany({ data: { sortOrder: 0 } });
  const byName = Object.fromEntries(units.map((u) => [u.name, u]));
  return { ...w, units, byName, adminLogin: await loginAs(w.admin), ownerLogin: await loginAs(w.owner) };
}

const doPreview = (login: Awaited<ReturnType<typeof loginAs>>, period = "2026-10") =>
  preview(apiRequest("/transactions/generate-rent/preview", { login, body: { period } }), params({}));

describe("Generate rent (INC-04)", () => {
  it("IE-09: previews every active unit without rent, at its set rent and default fund", async () => {
    const w = await setup();
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, kind: "INCOME", categoryId: w.categories.RENT.id, unitId: w.byName["Flat 3A"].id, fundAccountId: w.bank.id, createdById: w.admin.id });
    await createUnit(w.property.id, { name: "Closed shop", isActive: false });
    const res = await doPreview(w.adminLogin);
    expect(res.status).toBe(200);
    const { rows } = (await json(res)).data;
    expect(rows.map((r: { unit: string }) => r.unit)).toEqual(["Flat 1A", "Flat 1B", "Flat 2A", "Flat 2B", "Shop G1"]);
    expect(rows[4]).toMatchObject({ amountPaisa: 1200000, fundAccountId: w.cash.id, selected: true, tenant: "Tenant 5" });
    expect(await prisma.houseTransaction.count()).toBe(1); // nothing saved
  });

  it("saves ticked rows in one transaction with exactly one audit row, then previews nothing", async () => {
    const w = await setup();
    const { rows } = (await json(await doPreview(w.adminLogin))).data;
    const ticked = rows.filter((r: { unit: string }) => r.unit !== "Flat 3A").map((r: { unitId: string; amountPaisa: number; fundAccountId: string }) => ({ unitId: r.unitId, amountPaisa: r.amountPaisa, fundAccountId: r.fundAccountId }));
    const before = await prisma.auditLog.count({ where: { action: "transaction.rent_generated" } });
    const res = await save(moneyPost("/transactions/generate-rent", w.adminLogin, { period: "2026-10", txnDate: "2026-10-22", rows: ticked }), params({}));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.created).toBe(5);
    expect(data.skipped).toEqual([]);
    expect(data.periodTotals.incomePaisa).toBe(1800000 * 2 + 2000000 * 2 + 1200000);
    expect(data.transactions[0]).toMatchObject({ source: "GENERATED_RENT", description: "Flat 1A · Tenant 0", category: { code: "RENT" } });
    expect((await prisma.auditLog.count({ where: { action: "transaction.rent_generated" } })) - before).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "transaction.created", entityId: { in: data.transactions.map((t: { id: string }) => t.id) } } })).toBe(0);

    const again = (await json(await doPreview(w.adminLogin))).data.rows;
    expect(again.map((r: { unit: string }) => r.unit)).toEqual(["Flat 3A"]);
  });

  it("IE-10: skips a unit paid between preview and save", async () => {
    const w = await setup();
    const { rows } = (await json(await doPreview(w.adminLogin))).data;
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, kind: "INCOME", categoryId: w.categories.RENT.id, unitId: w.byName["Flat 1A"].id, fundAccountId: w.bank.id, createdById: w.admin.id });
    const body = { period: "2026-10", txnDate: "2026-10-22", rows: rows.map((r: { unitId: string; amountPaisa: number; fundAccountId: string }) => ({ unitId: r.unitId, amountPaisa: r.amountPaisa, fundAccountId: r.fundAccountId })) };
    const { data } = await json(await save(moneyPost("/transactions/generate-rent", w.adminLogin, body), params({})));
    expect(data.created).toBe(5);
    expect(data.skipped).toEqual([{ unitId: w.byName["Flat 1A"].id, unit: "Flat 1A" }]);
  });

  it("refuses Closed months, duplicate units, missing funds and owners", async () => {
    const w = await setup();
    const closed = await doPreview(w.adminLogin, "2026-09");
    expect((await json(closed)).error.code).toBe("PERIOD_CLOSED");

    const u = w.byName["Flat 1A"];
    const dup = await save(moneyPost("/transactions/generate-rent", w.adminLogin, { period: "2026-10", txnDate: "2026-10-22", rows: [{ unitId: u.id, amountPaisa: 1, fundAccountId: w.bank.id }, { unitId: u.id, amountPaisa: 1, fundAccountId: w.bank.id }] }), params({}));
    expect(dup.status).toBe(422);

    const noFund = await save(moneyPost("/transactions/generate-rent", w.adminLogin, { period: "2026-10", txnDate: "2026-10-22", rows: [{ unitId: u.id, amountPaisa: 1, fundAccountId: "00000000-0000-4000-8000-000000000000" }] }), params({}));
    expect((await json(noFund)).error.details.fields["rows.0.fundAccountId"]).toBeTruthy();

    expect((await doPreview(w.ownerLogin)).status).toBe(403);
    expect((await save(moneyPost("/transactions/generate-rent", w.ownerLogin, { period: "2026-10", txnDate: "2026-10-22", rows: [] }), params({}))).status).toBe(403);
  });

  it("two generators racing on the same month record each unit's rent once", async () => {
    const w = await setup();
    const { rows } = (await json(await doPreview(w.adminLogin))).data;
    const body = { period: "2026-10", txnDate: "2026-10-22", rows: rows.map((r: { unitId: string; amountPaisa: number; fundAccountId: string }) => ({ unitId: r.unitId, amountPaisa: r.amountPaisa, fundAccountId: r.fundAccountId })) };
    const results = await Promise.all([
      save(moneyPost("/transactions/generate-rent", w.adminLogin, body, "rent-race-a"), params({})),
      save(moneyPost("/transactions/generate-rent", w.adminLogin, body, "rent-race-b"), params({})),
    ]);
    const data = await Promise.all(results.map(async (r) => (await json(r)).data));
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(data.map((d) => d.created).sort()).toEqual([0, 6]);
    expect(data.map((d) => d.skipped.length).sort()).toEqual([0, 6]);
    expect(await prisma.houseTransaction.count({ where: { periodId: w.oct.id, categoryId: w.categories.RENT.id } })).toBe(6);
  });

  it("replays the same Idempotency-Key", async () => {
    const w = await setup();
    const u = w.byName["Flat 1A"];
    const body = { period: "2026-10", txnDate: "2026-10-22", rows: [{ unitId: u.id, amountPaisa: 1800000, fundAccountId: w.bank.id }] };
    const a = await json(await save(moneyPost("/transactions/generate-rent", w.adminLogin, body, "rent-oct-1"), params({})));
    const b = await json(await save(moneyPost("/transactions/generate-rent", w.adminLogin, body, "rent-oct-1"), params({})));
    expect(b).toEqual(a);
    expect(await prisma.houseTransaction.count()).toBe(1);
  });
});
