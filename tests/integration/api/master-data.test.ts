import { describe, expect, it } from "vitest";
import * as categories from "@/app/api/v1/categories/route";
import * as categoryOne from "@/app/api/v1/categories/[id]/route";
import * as funds from "@/app/api/v1/fund-accounts/route";
import * as fundOne from "@/app/api/v1/fund-accounts/[id]/route";
import * as units from "@/app/api/v1/units/route";
import * as unitOne from "@/app/api/v1/units/[id]/route";
import { prisma } from "@/lib/prisma";
import { createFund, createTxn, createUnit, moneyWorld } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";

async function lastAudit(action: string) {
  return prisma.auditLog.findFirst({ where: { action }, orderBy: { id: "desc" } });
}

describe("units (MST-01)", () => {
  it("creates, lists and edits units with audit", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    const res = await units.POST(
      apiRequest("/units", { login: admin, body: { name: "Flat 1A", tenantName: "Kamal Uddin", rentPaisa: 1800000, defaultFundAccountId: w.cash.id } }),
      params({}),
    );
    expect(res.status).toBe(201);
    const { unit } = (await json(res)).data;
    expect(unit).toMatchObject({ name: "Flat 1A", tenantName: "Kamal Uddin", rentPaisa: 1800000, defaultFundAccountId: w.cash.id, isActive: true });
    expect((await lastAudit("unit.created"))?.entityId).toBe(unit.id);

    const patched = await unitOne.PATCH(apiRequest(`/units/${unit.id}`, { method: "PATCH", login: admin, body: { rentPaisa: 2100000 } }), params({ id: unit.id }));
    expect(patched.status).toBe(200);
    const audit = await lastAudit("unit.updated");
    expect(audit).toMatchObject({ before: { rentPaisa: 1800000 }, after: { rentPaisa: 2100000 } });

    const list = await json(await units.GET(apiRequest("/units", { login: await loginAs(w.owner) }), params({})));
    expect(list.data.items.map((u: { name: string }) => u.name)).toEqual(["Flat 1A"]);
  });

  it("rejects duplicate names and inactive or foreign default funds", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    await createUnit(w.property.id, { name: "Flat 1A" });
    const dup = await units.POST(apiRequest("/units", { login: admin, body: { name: "Flat 1A", rentPaisa: 0 } }), params({}));
    expect(dup.status).toBe(409);
    expect((await json(dup)).error.code).toBe("NAME_TAKEN");

    const off = await createFund(w.property.id, { isActive: false });
    const bad = await units.POST(apiRequest("/units", { login: admin, body: { name: "Flat 2A", rentPaisa: 0, defaultFundAccountId: off.id } }), params({}));
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.fields.defaultFundAccountId).toBeTruthy();
  });

  it("hides deactivated units from ?active=true but keeps them on entries", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    const unit = await createUnit(w.property.id, { name: "Flat 1A" });
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, kind: "INCOME", categoryId: w.categories.RENT.id, fundAccountId: w.cash.id, createdById: w.admin.id, unitId: unit.id });
    const res = await unitOne.PATCH(apiRequest(`/units/${unit.id}`, { method: "PATCH", login: admin, body: { isActive: false } }), params({ id: unit.id }));
    expect(res.status).toBe(200);
    const active = await json(await units.GET(apiRequest("/units?active=true", { login: admin }), params({})));
    expect(active.data.items).toEqual([]);
    const txn = await prisma.houseTransaction.findFirstOrThrow({ include: { unit: true } });
    expect(txn.unit?.name).toBe("Flat 1A");
  });

  it("is read-only for owners", async () => {
    const w = await moneyWorld();
    const owner = await loginAs(w.owner);
    const unit = await createUnit(w.property.id);
    expect((await units.POST(apiRequest("/units", { login: owner, body: { name: "X", rentPaisa: 0 } }), params({}))).status).toBe(403);
    expect((await unitOne.PATCH(apiRequest(`/units/${unit.id}`, { method: "PATCH", login: owner, body: { rentPaisa: 1 } }), params({ id: unit.id }))).status).toBe(403);
  });

  it("returns 404 for unknown ids", async () => {
    const w = await moneyWorld();
    const res = await unitOne.PATCH(
      apiRequest(`/units/00000000-0000-4000-8000-000000000000`, { method: "PATCH", login: await loginAs(w.admin), body: { rentPaisa: 1 } }),
      params({ id: "00000000-0000-4000-8000-000000000000" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("fund accounts (MST-02, FND-01)", () => {
  it("computes live balances from non-voided entries", async () => {
    const w = await moneyWorld();
    const cash = await createFund(w.property.id, { name: "Cash", openingPaisa: 200000 });
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: cash.id, createdById: w.admin.id };
    await createTxn({ ...base, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, amountPaisa: 1800000 });
    await createTxn({ ...base, categoryId: w.categories.ELEC.id, amountPaisa: 600000 });
    await createTxn({ ...base, categoryId: w.categories.WATER.id, amountPaisa: 30000, fromReserve: true });
    await createTxn({ ...base, categoryId: w.categories.GAS.id, amountPaisa: 50000, voided: "Duplicate entry" });
    const body = await json(await funds.GET(apiRequest("/fund-accounts", { login: await loginAs(w.owner) }), params({})));
    const found = body.data.items.find((f: { id: string }) => f.id === cash.id);
    expect(found.balancePaisa).toBe(1370000);
    expect(found.openingBalancePaisa).toBe(200000);
  });

  it("creates accounts and refuses to deactivate one holding money", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    const res = await funds.POST(
      apiRequest("/fund-accounts", { login: admin, body: { name: "bKash", type: "WALLET", openingBalancePaisa: 50000, openingDate: "2026-10-01" } }),
      params({}),
    );
    expect(res.status).toBe(201);
    const { fundAccount } = (await json(res)).data;
    expect(fundAccount).toMatchObject({ name: "bKash", type: "WALLET", balancePaisa: 50000, openingDate: "2026-10-01" });
    expect(await lastAudit("fund_account.created")).toBeTruthy();

    const refused = await fundOne.PATCH(apiRequest(`/fund-accounts/${fundAccount.id}`, { method: "PATCH", login: admin, body: { isActive: false } }), params({ id: fundAccount.id }));
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe("FUND_NOT_EMPTY");

    const zeroed = await fundOne.PATCH(
      apiRequest(`/fund-accounts/${fundAccount.id}`, { method: "PATCH", login: admin, body: { openingBalancePaisa: 0, isActive: false } }),
      params({ id: fundAccount.id }),
    );
    expect(zeroed.status).toBe(200);
    expect((await json(zeroed)).data.fundAccount.isActive).toBe(false);
    expect(await lastAudit("fund_account.updated")).toMatchObject({ after: { isActive: false, openingBalancePaisa: 0 } });
  });

  it("forbids owners from writing", async () => {
    const w = await moneyWorld();
    const res = await funds.POST(
      apiRequest("/fund-accounts", { login: await loginAs(w.owner), body: { name: "x", type: "CASH", openingBalancePaisa: 0, openingDate: "2026-10-01" } }),
      params({}),
    );
    expect(res.status).toBe(403);
  });
});

describe("categories (MST-03, EXP-02)", () => {
  it("lists by kind and locks system categories (IE-16)", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    const income = await json(await categories.GET(apiRequest("/categories?kind=INCOME", { login: admin }), params({})));
    expect(income.data.items.map((c: { code: string }) => c.code)).toEqual(["RENT", "ARREAR", "ROOFTOP", "PARKING", "OTHER_INC", "ADJUSTMENT_INC"]);

    const rent = w.categories.RENT;
    for (const body of [{ isActive: false }, { nameEn: "Rent!" }, { kind: "EXPENSE" }]) {
      const res = await categoryOne.PATCH(apiRequest(`/categories/${rent.id}`, { method: "PATCH", login: admin, body }), params({ id: rent.id }));
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect((await json(res)).error.code).toBe("CATEGORY_LOCKED");
    }
  });

  it("creates, renames and deactivates admin categories", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    const res = await categories.POST(apiRequest("/categories", { login: admin, body: { kind: "EXPENSE", nameEn: "Internet", nameBn: "ইন্টারনেট" } }), params({}));
    expect(res.status).toBe(201);
    const { category } = (await json(res)).data;
    expect(category).toMatchObject({ kind: "EXPENSE", nameEn: "Internet", isSystem: false, isActive: true });
    expect(category.code).toMatch(/^[A-Z0-9_]+$/);

    const other = w.categories.OTHER_EXP;
    const renamed = await categoryOne.PATCH(apiRequest(`/categories/${other.id}`, { method: "PATCH", login: admin, body: { nameEn: "Misc", nameBn: "বিবিধ" } }), params({ id: other.id }));
    expect(renamed.status).toBe(200);
    expect(await lastAudit("category.updated")).toMatchObject({ before: { nameEn: "Other", nameBn: "অন্যান্য" }, after: { nameEn: "Misc", nameBn: "বিবিধ" } });

    const kindChange = await categoryOne.PATCH(apiRequest(`/categories/${other.id}`, { method: "PATCH", login: admin, body: { kind: "INCOME" } }), params({ id: other.id }));
    expect(kindChange.status).toBe(422);

    const off = await categoryOne.PATCH(apiRequest(`/categories/${other.id}`, { method: "PATCH", login: admin, body: { isActive: false } }), params({ id: other.id }));
    expect((await json(off)).data.category.isActive).toBe(false);
    const active = await json(await categories.GET(apiRequest("/categories?kind=EXPENSE&active=true", { login: admin }), params({})));
    expect(active.data.items.map((c: { code: string }) => c.code)).not.toContain("OTHER_EXP");
  });

  it("forbids owners from writing", async () => {
    const w = await moneyWorld();
    const res = await categories.POST(apiRequest("/categories", { login: await loginAs(w.owner), body: { kind: "EXPENSE", nameEn: "x", nameBn: "x" } }), params({}));
    expect(res.status).toBe(403);
  });
});
