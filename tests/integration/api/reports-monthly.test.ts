import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPeriod, createProperty, createTxn, createUser } from "../../helpers/factory";
import { boardData, distributionWorld, postClose, postReopen } from "../../helpers/distribution";
import { loginAs, json } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { attachBill, getReport, reportData } from "../../helpers/reports";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const BOARD_KEYS = ["ownerId", "displayName", "units", "sharePercent", "openingPaisa", "entitlementPaisa", "receivedPaisa", "advancePaisa", "loanDeductionPaisa", "otherPaisa", "balancePaisa", "balanceLabel", "loanOutstandingPaisa"] as const;
const pick = (r: Record<string, unknown>) => Object.fromEntries(BOARD_KEYS.map((k) => [k, r[k]]));

describe("GET /api/v1/reports/monthly — figures (RPT-01, F2, Rules 1–6)", () => {
  it("reports October as a draft whose staircase and owner table match Distribution", async () => {
    const w = await distributionWorld();
    const d = await reportData("monthly", w.ownerLogin, "month=2026-10");
    const board = await boardData(w.adminLogin, "2026-10");
    expect(d.month).toMatchObject({ key: "2026-10", status: "DRAFT", closedAt: null });
    expect(d.staircase).toMatchObject({
      incomePaisa: 10300000,
      expensesCountedPaisa: 1398000,
      reserveSpentPaisa: 0,
      reservePaisa: 445100,
      reserveSource: "RULE",
      previousDeficitPaisa: 0,
      distributablePaisa: 8456900,
      deficitCarriedPaisa: 0,
    });
    expect(d.staircase.distributablePaisa).toBe(board.staircase.distributablePaisa);
    expect(d.owners.rows.map(pick)).toEqual(board.rows.map(pick));
    expect(d.owners.totals.entitlementPaisa).toBe(8456900);
    expect(d.summary).toEqual({ incomePaisa: 10300000, expensesAllPaisa: 1398000, distributablePaisa: 8456900, deficitCarriedPaisa: 0 });
  });

  it("reports a closed month as final from its snapshot", async () => {
    const w = await distributionWorld();
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    const d = await reportData("monthly", w.adminLogin);
    expect(d.month.key).toBe("2026-10");
    expect(d.month.status).toBe("FINAL");
    expect(d.month.closedAt).toEqual(expect.any(String));
    const board = await boardData(w.adminLogin, "2026-10");
    expect(d.owners.rows.map(pick)).toEqual(board.rows.map(pick));
    expect(d.owners.totals.entitlementPaisa).toBe(d.staircase.distributablePaisa);
  });

  it("defaults to the latest closed month, even when a newer month is open", async () => {
    const w = await distributionWorld();
    const d = await reportData("monthly", w.ownerLogin);
    expect(d.month.key).toBe("2026-09");
    expect(d.months).toEqual([
      { key: "2026-10", status: "OPEN" },
      { key: "2026-09", status: "CLOSED" },
    ]);
  });

  it("is { month: null } without periods and 404 for an unknown month", async () => {
    const property = await createProperty();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const login = await loginAs(admin);
    expect(await reportData("monthly", login)).toEqual({ month: null });
    await createPeriod(property.id, "2026-10");
    const res = await getReport("monthly", login, "month=2025-01");
    expect(res.status).toBe(404);
  });

  it("splits Expenses (all) from the Reserve-paid part and ignores voided entries", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, categoryId: w.categories.REPAIR.id, amountPaisa: 1800000, fromReserve: true, vendor: "Pump Co" });
    await createTxn({ ...base, categoryId: w.categories.ELEC.id, amountPaisa: 300000, voided: "Duplicate" });
    const d = await reportData("monthly", w.adminLogin, "month=2026-10");
    expect(d.expenses).toMatchObject({ totalPaisa: 3198000, fromReservePaisa: 1800000, count: 3 });
    expect(d.staircase.expensesCountedPaisa).toBe(1398000);
    expect(d.staircase.reserveSpentPaisa).toBe(1800000);
    const elec = d.expenses.categories.find((c: { code: string }) => c.code === "ELEC");
    expect(elec).toMatchObject({ amountPaisa: 1000000, count: 1 });
    expect(elec.entries).toHaveLength(1);
  });
});

describe("GET /api/v1/reports/monthly — categories and entries (F2.3–F2.5, G4, G5)", () => {
  it("lists categories with counts, shares and their entries with bills", async () => {
    const w = await distributionWorld();
    await attachBill(w.property.id, w.txns.elec.id, w.admin.id);
    await attachBill(w.property.id, w.txns.elec.id, w.admin.id, { fileName: "old.jpg", mime: "image/jpeg", removed: true });
    await attachBill(w.property.id, w.txns.elec.id, w.admin.id, { fileName: "private.pdf", isPrivate: true });
    const d = await reportData("monthly", w.ownerLogin, "month=2026-10");
    expect(d.income.totalPaisa).toBe(10300000);
    expect(d.income.categories.map((c: { code: string; count: number; shareBp: number }) => [c.code, c.count, c.shareBp])).toEqual([
      ["RENT", 1, 1748],
      ["ROOFTOP", 1, 8252],
    ]);
    expect(d.expenses.categories.map((c: { code: string; shareBp: number }) => [c.code, c.shareBp])).toEqual([
      ["ELEC", 7153],
      ["WATER", 2847],
    ]);
    const rent = d.income.categories[0].entries[0];
    expect(rent).toMatchObject({ unitName: "Flat 2A", amountPaisa: 1800000, fundName: "Cash — with Rayhan", fromReserve: false, date: "2026-10-10" });
    const elec = d.expenses.categories[0];
    expect(elec).toMatchObject({ nameEn: "Electricity", nameBn: "বিদ্যুৎ" });
    expect(elec.entries[0].attachments).toEqual([{ id: expect.any(String), fileName: "desco-oct.pdf", mime: "application/pdf" }]);
    expect(d.empty).toBe(false);
    expect([...d.income.categories, ...d.expenses.categories].flatMap((c: { entries: unknown[] }) => c.entries)).toHaveLength(4);
  });

  it("marks a month without entries as empty", async () => {
    const w = await distributionWorld();
    const d = await reportData("monthly", w.ownerLogin, "month=2026-09");
    expect(d.empty).toBe(true);
    expect(d.income.categories).toEqual([]);
    expect(d.expenses.categories).toEqual([]);
  });
});

describe("GET /api/v1/reports/monthly — notes (F2.8, §8)", () => {
  it("names unpaid units", async () => {
    const w = await distributionWorld();
    const d = await reportData("monthly", w.ownerLogin, "month=2026-10");
    expect(d.notes.unpaidUnits).toEqual([{ name: "Flat 3A", tenantName: "Nusrat Jahan" }]);
    expect(d.notes.reopen).toBeNull();
    expect(d.notes.overrideReason).toBeNull();
    expect(d.notes.deficit).toBeNull();
  });

  it("notes the latest reopen, a reserve override and a deficit", async () => {
    const w = await distributionWorld();
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    expect((await postReopen(w.adminLogin, "2026-10", "Plumber bill was missed")).status).toBe(200);
    await prisma.period.update({ where: { id: w.oct.id }, data: { reserveOverridePaisa: BigInt(100000), reserveOverrideReason: "Roof fund" } });
    let d = await reportData("monthly", w.ownerLogin, "month=2026-10");
    expect(d.notes.reopen).toEqual({ at: expect.any(String), reason: "Plumber bill was missed" });
    expect(d.notes.overrideReason).toBe("Roof fund");
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.REPAIR.id, amountPaisa: 20000000 });
    d = await reportData("monthly", w.ownerLogin, "month=2026-10");
    expect(d.notes.deficit).toEqual({ amountPaisa: 11098000, nextMonth: "2026-11" });
    expect(d.summary.deficitCarriedPaisa).toBe(11098000);
  });
});

describe("GET /api/v1/reports/monthly — comparisons (F8, G9)", () => {
  it("compares with last month and the same month last year", async () => {
    const w = await distributionWorld();
    const nov = await createPeriod(w.property.id, "2026-11");
    const lastNov = await createPeriod(w.property.id, "2025-11");
    const base = { propertyId: w.property.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, periodId: nov.id, kind: "INCOME", categoryId: w.categories.RENT.id, amountPaisa: 12500000 });
    await createTxn({ ...base, periodId: nov.id, categoryId: w.categories.ELEC.id, amountPaisa: 1300000 });
    await createTxn({ ...base, periodId: lastNov.id, kind: "INCOME", categoryId: w.categories.RENT.id, amountPaisa: 9000000 });
    const d = await reportData("monthly", w.ownerLogin, "month=2026-11");
    expect(d.compare.lastMonth).toMatchObject({ key: "2026-10", incomePaisa: 10300000, expensesAllPaisa: 1398000 });
    expect(d.compare.lastYear).toMatchObject({ key: "2025-11", incomePaisa: 9000000, expensesAllPaisa: 0 });
    const elec = d.expenses.categories.find((c: { code: string }) => c.code === "ELEC");
    expect(elec.previousPaisa).toBe(1000000);
    const oct = await reportData("monthly", w.ownerLogin, "month=2026-10");
    expect(oct.compare.lastMonth).toMatchObject({ key: "2026-09", incomePaisa: 0 });
    expect(oct.compare.lastYear).toBeNull();
  });
});

describe("GET /api/v1/reports/monthly — access and CSV (F7, §4)", () => {
  it("gives Owner and Super Admin the same body with no-store", async () => {
    const w = await distributionWorld();
    const a = await getReport("monthly", w.ownerLogin, "month=2026-10");
    const b = await getReport("monthly", w.adminLogin, "month=2026-10");
    expect(a.headers.get("cache-control")).toBe("no-store");
    const da = (await json(a)).data;
    const db = (await json(b)).data;
    expect(da).toEqual(db);
    expect(da.owners.rows).toHaveLength(5);
  });

  it("refuses anonymous (401), users without report.view (403) and bad months (422)", async () => {
    const w = await distributionWorld();
    expect((await getReport("monthly", null, "month=2026-10")).status).toBe(401);
    const viewer = await loginAs(await createUser({ roles: ["VIEWER"] }));
    expect((await getReport("monthly", viewer, "month=2026-10")).status).toBe(403);
    const bad = await getReport("monthly", w.ownerLogin, "month=2026-13");
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.code).toBe("VALIDATION_FAILED");
  });

  it("downloads the month's entries as CSV", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, categoryId: w.categories.OTHER_EXP.id, amountPaisa: 5050, vendor: "=cmd", txnDate: "2026-10-03" });
    const res = await getReport("monthly", w.ownerLogin, "month=2026-10&format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="BariHisab-Monthly-2026-10-DRAFT.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const lines = (await res.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Category,Description,Vendor,Unit,Fund account,From reserve,Amount,Status");
    expect(lines).toHaveLength(6);
    expect(lines).toContain("2026-10-10,Expense,Electricity,,,,Cash — with Rayhan,No,10000.00,Draft");
    expect(lines).toContain("2026-10-03,Expense,Other,,'=cmd,,Cash — with Rayhan,No,50.50,Draft");
    expect(lines).toContain("2026-10-10,Income,House rent,,,Flat 2A,Cash — with Rayhan,No,18000.00,Draft");
  });

  it("names a final month's CSV without -DRAFT", async () => {
    const w = await distributionWorld();
    const res = await getReport("monthly", w.ownerLogin, "month=2026-09&format=csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="BariHisab-Monthly-2026-09.csv"');
    expect((await res.text()).replace(/^﻿/, "").trimEnd().split("\r\n")).toHaveLength(1);
  });
});
