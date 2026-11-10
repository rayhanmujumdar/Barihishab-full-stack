import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/transactions/route";
import { prisma } from "@/lib/prisma";
import { createFund, createPeriod, createTxn, createUnit, moneyWorld } from "../../helpers/factory";
import { json, loginAs, params } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const create = (login: Awaited<ReturnType<typeof loginAs>>, body: Record<string, unknown>, key?: string) =>
  POST(moneyPost("/transactions", login, body, key), params({}));

async function setup() {
  const w = await moneyWorld();
  const flat1a = await createUnit(w.property.id, { name: "Flat 1A", tenantName: "Kamal Uddin", rentPaisa: 1800000, defaultFundAccountId: w.bank.id });
  return { ...w, flat1a, admin: await loginAs(w.admin), ownerLogin: await loginAs(w.owner), adminUser: w.admin };
}

const expense = (w: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) => ({
  period: "2026-10",
  kind: "EXPENSE",
  categoryId: w.categories.ELEC.id,
  amountPaisa: 630000,
  txnDate: "2026-10-12",
  fundAccountId: w.bank.id,
  vendor: "DESCO",
  description: "Common meter · stairs, pump, gate",
  ...extra,
});

describe("POST /api/v1/transactions", () => {
  it("IE-01: records rent income, fills the description and returns totals", async () => {
    const w = await setup();
    const res = await create(w.admin, { period: "2026-10", kind: "INCOME", categoryId: w.categories.RENT.id, unitId: w.flat1a.id, amountPaisa: 1800000, txnDate: "2026-10-05", fundAccountId: w.bank.id });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.transaction).toMatchObject({ period: "2026-10", kind: "INCOME", amountPaisa: 1800000, description: "Flat 1A · Kamal Uddin", unitName: "Flat 1A", isCorrected: false, source: "MANUAL" });
    expect(data.periodTotals).toMatchObject({ incomePaisa: 1800000, expensePaisa: 0 });
    expect(data.warnings).toEqual([]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "transaction.created", entityId: data.transaction.id } });
    expect(audit.actorId).toBe(w.adminUser.id);
    expect(audit.after).toMatchObject({ amountPaisa: 1800000 });
  });

  it("IE-03: rejects a zero amount", async () => {
    const w = await setup();
    const res = await create(w.admin, expense(w, { amountPaisa: 0 }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields.amountPaisa).toBe("Enter an amount greater than zero.");
  });

  it("IE-04: refuses a Closed month with 409 PERIOD_CLOSED", async () => {
    const w = await setup();
    const res = await create(w.admin, expense(w, { period: "2026-09", txnDate: "2026-09-12" }));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("PERIOD_CLOSED");
    expect(await prisma.houseTransaction.count()).toBe(0);
  });

  it("refuses an unknown month with a field error", async () => {
    const w = await setup();
    const res = await create(w.admin, expense(w, { period: "2025-01" }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields.period).toBeTruthy();
  });

  it("IE-11: a From-Reserve expense leaves the Expense total alone", async () => {
    const w = await setup();
    const res = await create(w.admin, expense(w, { categoryId: w.categories.REPAIR.id, amountPaisa: 1800000, fromReserve: true, vendor: "Pump mechanic" }));
    const { data } = await json(res);
    expect(data.periodTotals).toMatchObject({ expensePaisa: 0, reserveSpentPaisa: 1800000, expenseCount: 1 });
  });

  it("IE-12: a second rent for the same unit saves with RENT_ALREADY_RECORDED", async () => {
    const w = await setup();
    const body = { period: "2026-10", kind: "INCOME", categoryId: w.categories.RENT.id, unitId: w.flat1a.id, amountPaisa: 1800000, txnDate: "2026-10-05", fundAccountId: w.bank.id };
    await create(w.admin, body);
    const res = await create(w.admin, { ...body, txnDate: "2026-10-06" });
    expect(res.status).toBe(201);
    expect((await json(res)).data.warnings).toContainEqual({ code: "RENT_ALREADY_RECORDED" });
  });

  it("DUP-02: warns on the same kind + category + amount + date", async () => {
    const w = await setup();
    await create(w.admin, expense(w));
    const res = await create(w.admin, expense(w));
    expect((await json(res)).data.warnings).toContainEqual({ code: "POSSIBLE_DUPLICATE" });
  });

  it("IE-13: ARREAR needs a unit and a Closed earlier reference month", async () => {
    const w = await setup();
    const nov = await createPeriod(w.property.id, "2026-11");
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    vi.setSystemTime(new Date("2026-11-03T06:00:00Z"));
    w.admin = await loginAs(w.adminUser);
    const flat3a = await createUnit(w.property.id, { name: "Flat 3A", rentPaisa: 2200000 });
    const body = { period: "2026-11", kind: "INCOME", categoryId: w.categories.ARREAR.id, unitId: flat3a.id, amountPaisa: 2200000, txnDate: "2026-11-03", fundAccountId: w.bank.id };

    const noRef = await create(w.admin, body);
    expect((await json(noRef)).error.details.fields.referencePeriod).toBe("Pick the closed month this belongs to.");

    const res = await create(w.admin, { ...body, referencePeriod: "2026-10" });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.transaction).toMatchObject({ period: "2026-11", referencePeriod: "2026-10" });
    expect(data.periodTotals.incomePaisa).toBe(2200000);
    expect(nov.id).toBeTruthy();
  });

  it("IE-15: owners can't create", async () => {
    const w = await setup();
    const res = await create(w.ownerLogin, expense(w));
    expect(res.status).toBe(403);
  });

  it("IE-17: a fund going negative saves with FUND_NEGATIVE", async () => {
    const w = await setup();
    const cash = await createFund(w.property.id, { name: "Petty cash", openingPaisa: 200000 });
    const res = await create(w.admin, expense(w, { fundAccountId: cash.id, amountPaisa: 500000 }));
    expect(res.status).toBe(201);
    expect((await json(res)).data.warnings).toContainEqual({ code: "FUND_NEGATIVE", fundAccountId: cash.id, balancePaisa: -300000 });
  });

  it("warns when the date is far from the month", async () => {
    const w = await setup();
    vi.setSystemTime(new Date("2026-12-20T06:00:00Z"));
    w.admin = await loginAs(w.adminUser);
    const res = await create(w.admin, expense(w, { txnDate: "2026-12-20" }));
    expect((await json(res)).data.warnings).toContainEqual({ code: "DATE_FAR_FROM_PERIOD" });
  });

  it("EXP-05: Owner special grant and adjustment categories are not for manual entry", async () => {
    const w = await setup();
    for (const code of ["OWNER_GRANT", "ADJUSTMENT_EXP", "LOAN_WRITTEN_OFF"]) {
      const res = await create(w.admin, expense(w, { categoryId: w.categories[code].id }));
      expect((await json(res)).error.details.fields.categoryId, code).toBe("Pick a category.");
    }
  });

  it("refuses inactive references, units on expenses, future dates and from-reserve income", async () => {
    const w = await setup();
    const off = await createFund(w.property.id, { isActive: false });
    const cases: [Record<string, unknown>, string][] = [
      [expense(w, { fundAccountId: off.id }), "fundAccountId"],
      [expense(w, { unitId: w.flat1a.id }), "unitId"],
      [expense(w, { txnDate: "2026-10-22" }), "txnDate"],
      [{ ...expense(w), kind: "INCOME", categoryId: w.categories.OTHER_INC.id, fromReserve: true }, "fromReserve"],
      [expense(w, { vendor: "x".repeat(101) }), "vendor"],
      [expense(w, { description: "x".repeat(201) }), "description"],
    ];
    for (const [body, field] of cases) {
      const res = await create(w.admin, body);
      expect(res.status, field).toBe(422);
      expect((await json(res)).error.details.fields[field], field).toBeTruthy();
    }
  });

  it("opens the current month on first entry (PER-01)", async () => {
    const w = await setup();
    vi.setSystemTime(new Date("2026-11-02T06:00:00Z"));
    w.admin = await loginAs(w.adminUser);
    const res = await create(w.admin, expense(w, { period: "2026-11", txnDate: "2026-11-02" }));
    expect(res.status).toBe(201);
  });

  it("IE-14: the same Idempotency-Key creates one entry", async () => {
    const w = await setup();
    const a = await json(await create(w.admin, expense(w), "double-tap-1"));
    const b = await json(await create(w.admin, expense(w), "double-tap-1"));
    expect(b).toEqual(a);
    expect(await prisma.houseTransaction.count()).toBe(1);
  });

  it("ignores rows of another kind when checking duplicates", async () => {
    const w = await setup();
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, fundAccountId: w.bank.id, createdById: w.adminUser.id, amountPaisa: 630000, txnDate: "2026-10-12" });
    const res = await create(w.admin, expense(w));
    expect((await json(res)).data.warnings).toEqual([]);
  });
});
