import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPeriod, createTxn, createUser } from "../../helpers/factory";
import { distributionWorld } from "../../helpers/distribution";
import { loginAs, json } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { getReport, reportData } from "../../helpers/reports";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

async function world() {
  const w = await distributionWorld();
  const jul = await createPeriod(w.property.id, "2026-07", "OPEN");
  const base = { propertyId: w.property.id, fundAccountId: w.cash.id, createdById: w.admin.id };
  const pump = await createTxn({ ...base, periodId: jul.id, categoryId: w.categories.REPAIR.id, amountPaisa: 1800000, fromReserve: true, vendor: "Pump Co", txnDate: "2026-07-14" });
  const roof = await createTxn({ ...base, periodId: w.oct.id, categoryId: w.categories.REPAIR.id, amountPaisa: 14500000, vendor: "Roof Ltd", txnDate: "2026-10-05" });
  await createTxn({ ...base, periodId: w.oct.id, categoryId: w.categories.REPAIR.id, amountPaisa: 1270000, vendor: "Roof Ltd", txnDate: "2026-10-06" });
  await createTxn({ ...base, periodId: w.oct.id, categoryId: w.categories.REPAIR.id, amountPaisa: 999999, vendor: "Ghost", voided: "Duplicate" });
  await createTxn({ ...base, periodId: jul.id, kind: "INCOME", categoryId: w.categories.RENT.id, amountPaisa: 5000000 });
  return { ...w, jul, pump, roof };
}

describe("GET /api/v1/reports/expenses (F10, G12)", () => {
  it("answers 'how much did we spend on repairs in 2026?'", async () => {
    const w = await world();
    const d = await reportData("expenses", w.ownerLogin, `from=2026-01&to=2026-12&categoryId=${w.categories.REPAIR.id}`);
    expect(d).toMatchObject({ from: "2026-01", to: "2026-12", categoryIds: [w.categories.REPAIR.id], totalPaisa: 17570000, fromReservePaisa: 1800000, count: 3 });
    expect(d.byCategory).toEqual([{ categoryId: w.categories.REPAIR.id, code: "REPAIR", nameEn: "Repairs", nameBn: "মেরামত", amountPaisa: 17570000, shareBp: 10000, count: 3 }]);
    expect(d.topVendors).toEqual([
      { vendor: "Roof Ltd", amountPaisa: 15770000, count: 2 },
      { vendor: "Pump Co", amountPaisa: 1800000, count: 1 },
    ]);
    expect(d.trend).toHaveLength(12);
    expect(d.trend[6]).toEqual({ month: "2026-07", amounts: { [w.categories.REPAIR.id]: 1800000 }, totalPaisa: 1800000 });
    expect(d.trend[9].totalPaisa).toBe(15770000);
    expect(d.topExpenses[0]).toMatchObject({ id: w.roof.id, date: "2026-10-05", month: "2026-10", categoryNameEn: "Repairs", vendor: "Roof Ltd", amountPaisa: 14500000 });
    expect(d.categories.some((c: { code: string }) => c.code === "ELEC")).toBe(true);
  });

  it("covers every expense category without a filter, with blank vendors grouped", async () => {
    const w = await world();
    const d = await reportData("expenses", w.ownerLogin, "from=2026-10&to=2026-10");
    expect(d.totalPaisa).toBe(1398000 + 14500000 + 1270000);
    expect(d.fromReservePaisa).toBe(0);
    expect(d.byCategory.map((c: { code: string }) => c.code)).toEqual(["REPAIR", "ELEC", "WATER"]);
    expect(d.topVendors).toEqual([
      { vendor: "Roof Ltd", amountPaisa: 15770000, count: 2 },
      { vendor: null, amountPaisa: 1398000, count: 2 },
    ]);
    expect(d.trend).toEqual([{ month: "2026-10", amounts: {}, totalPaisa: 17168000 }]);
    expect(d.topExpenses).toHaveLength(4);
  });

  it("validates the range and access", async () => {
    const w = await world();
    const long = await getReport("expenses", w.ownerLogin, "from=2023-12&to=2026-12");
    expect(long.status).toBe(422);
    expect((await json(long)).error.code).toBe("VALIDATION_FAILED");
    expect((await getReport("expenses", w.ownerLogin, "from=2026-05&to=2026-04")).status).toBe(422);
    expect((await getReport("expenses", w.ownerLogin, "to=2026-04")).status).toBe(422);
    expect((await getReport("expenses", null, "from=2026-01&to=2026-02")).status).toBe(401);
    expect((await getReport("expenses", await loginAs(await createUser({ roles: ["VIEWER"] })), "from=2026-01&to=2026-02")).status).toBe(403);
  });
});
