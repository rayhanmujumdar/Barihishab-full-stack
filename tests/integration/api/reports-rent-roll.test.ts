import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPeriod, createTxn, createUnit, createUser } from "../../helpers/factory";
import { distributionWorld } from "../../helpers/distribution";
import { loginAs } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { getReport, reportData } from "../../helpers/reports";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

type Row = { name: string; cells: { kind: string }[]; totalPaisa: number; expectedPaisa: number };

describe("GET /api/v1/reports/rent-roll (F9, G10)", () => {
  it("shows paid, unpaid and arrear cells with totals, expected and collection", async () => {
    const w = await distributionWorld();
    const shop = await createUnit(w.property.id, { name: "Shop", tenantName: null, rentPaisa: 500000, isActive: false });
    await createUnit(w.property.id, { name: "Garage", tenantName: null, rentPaisa: 300000, isActive: false });
    // Units set up at the start of the year (createdAt bounds when rent is expected).
    await prisma.unit.updateMany({ where: { propertyId: w.property.id }, data: { createdAt: new Date("2026-01-05T00:00:00Z") } });
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "INCOME" as const };
    const arrear = await createTxn({ ...base, categoryId: w.categories.ARREAR.id, unitId: w.units.flat2a.id, amountPaisa: 1800000 });
    await prisma.houseTransaction.update({ where: { id: arrear.id }, data: { referencePeriodId: w.sep.id } });
    await createTxn({ ...base, categoryId: w.categories.RENT.id, unitId: shop.id, amountPaisa: 500000 });
    await createTxn({ ...base, categoryId: w.categories.RENT.id, unitId: w.units.flat3a.id, amountPaisa: 1800000, voided: "Bounced" });

    const d = await reportData("rent-roll", w.adminLogin, "year=2026");
    expect(d.year).toBe(2026);
    const rows = Object.fromEntries(d.rows.map((r: Row) => [r.name, r]));
    expect(Object.keys(rows)).toEqual(["Flat 2A", "Flat 3A", "Shop"]);
    const sep = 8;
    const oct = 9;
    // September's rent came late (booked in October): an arrear, not October's rent.
    expect(rows["Flat 2A"].cells[sep]).toEqual({ kind: "ARREAR", paidIn: "2026-10", amountPaisa: 1800000, entryIds: [arrear.id] });
    expect(rows["Flat 2A"].cells[oct]).toEqual({ kind: "PAID", amountPaisa: 1800000, entryIds: [w.txns.rent.id] });
    expect(rows["Flat 3A"].cells[oct]).toEqual({ kind: "NONE" });
    expect(rows["Flat 2A"]).toMatchObject({ totalPaisa: 3600000, expectedPaisa: 3600000 });
    // The inactive Shop is expected only up to its last rent (October).
    expect(rows.Shop).toMatchObject({ totalPaisa: 500000, expectedPaisa: 1000000 });
    expect(d.months[oct]).toEqual({ key: "2026-10", status: "DRAFT", totalPaisa: 2300000, expectedPaisa: 4100000, collectionBp: 5610 });
    expect(d.months[sep]).toMatchObject({ key: "2026-09", status: "FINAL", totalPaisa: 1800000, expectedPaisa: 4100000, collectionBp: 4390 });
    expect(d.months[0]).toEqual({ key: "2026-01", status: "NONE", totalPaisa: 0, expectedPaisa: null, collectionBp: null });
  });

  it("expects no rent before a unit was added", async () => {
    const w = await distributionWorld();
    await prisma.unit.updateMany({ where: { propertyId: w.property.id }, data: { createdAt: new Date("2026-10-02T00:00:00Z") } });
    const d = await reportData("rent-roll", w.adminLogin, "year=2026");
    expect(d.months[8]).toMatchObject({ key: "2026-09", expectedPaisa: 0, collectionBp: null });
    expect(d.months[9]).toMatchObject({ key: "2026-10", expectedPaisa: 3600000 });
    expect(d.rows.map((r: Row) => r.expectedPaisa)).toEqual([1800000, 1800000]);
  });

  it("shows December's rent paid in January of the next year as an arrear", async () => {
    const w = await distributionWorld();
    const dec = await createPeriod(w.property.id, "2026-12");
    const jan = await createPeriod(w.property.id, "2027-01");
    const late = await createTxn({ propertyId: w.property.id, periodId: jan.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "INCOME", categoryId: w.categories.ARREAR.id, unitId: w.units.flat3a.id, amountPaisa: 1800000 });
    await prisma.houseTransaction.update({ where: { id: late.id }, data: { referencePeriodId: dec.id } });
    const d = await reportData("rent-roll", w.adminLogin, "year=2026");
    const flat3a = d.rows.find((r: Row) => r.name === "Flat 3A");
    expect(flat3a.cells[11]).toEqual({ kind: "ARREAR", paidIn: "2027-01", amountPaisa: 1800000, entryIds: [late.id] });
    const next = await reportData("rent-roll", w.adminLogin, "year=2027");
    expect(next.rows.find((r: Row) => r.name === "Flat 3A").cells[0]).toEqual({ kind: "NONE" });
  });

  it("checks access and the year", async () => {
    const w = await distributionWorld();
    expect((await getReport("rent-roll", null, "year=2026")).status).toBe(401);
    expect((await getReport("rent-roll", await loginAs(await createUser({ roles: ["VIEWER"] })), "year=2026")).status).toBe(403);
    expect((await getReport("rent-roll", w.ownerLogin, "year=abc")).status).toBe(422);
    const res = await getReport("rent-roll", w.ownerLogin);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
