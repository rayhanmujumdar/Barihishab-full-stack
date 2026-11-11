import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listOwners } from "@/lib/owners/owner-service";
import { createPeriod, createTxn, createUser } from "../../helpers/factory";
import { boardData, distributionWorld, postClose } from "../../helpers/distribution";
import { loginAs, json } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { getReport, reportData } from "../../helpers/reports";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

type Col = { month: string; status: string; figure: Record<string, number> | null };
type Row = { displayName: string } & Record<string, unknown>;
const byFirst = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.displayName.split(" ")[0].toLowerCase(), r])) as Record<string, Row>;

describe("GET /api/v1/reports/yearly — months and totals (RPT-02, F3, G1–G3)", () => {
  it("shows 12 columns, closed and draft totals kept apart", async () => {
    const w = await distributionWorld();
    const d = await reportData("yearly", w.ownerLogin, "year=2026");
    expect(d.year).toBe(2026);
    expect(d.years).toEqual([2026]);
    expect(d.empty).toBe(false);
    expect(d.months.map((c: Col) => c.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
    expect(d.months.map((c: Col) => c.status)).toEqual(["NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "NONE", "FINAL", "DRAFT", "NONE", "NONE"]);
    expect(d.months[0].figure).toBeNull();
    const board = await boardData(w.adminLogin, "2026-10");
    expect(d.months[9].figure).toMatchObject({ incomePaisa: 10300000, expensesAllPaisa: 1398000, reservePaisa: 445100, distributablePaisa: board.staircase.distributablePaisa });
    expect(d.totals).toMatchObject({ closedCount: 1, draftCount: 1 });
    expect(d.totals.closed.incomePaisa).toBe(0);
    expect(d.totals.draft).toMatchObject({ incomePaisa: 10300000, distributablePaisa: 8456900 });
  });

  it("moves a month into the closed totals once it closes, and Σ entitlement = closed distributable", async () => {
    const w = await distributionWorld();
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    const d = await reportData("yearly", w.adminLogin);
    expect(d.year).toBe(2026);
    expect(d.months[9].status).toBe("FINAL");
    // Closing October opens November, which becomes the draft month.
    expect(d.totals).toMatchObject({ closedCount: 2, draftCount: 1 });
    expect(d.months[10].status).toBe("DRAFT");
    expect(d.totals.closed).toMatchObject({ incomePaisa: 10300000, expensesAllPaisa: 1398000, distributablePaisa: 8456900 });
    expect(d.owners.totals.entitlementPaisa).toBe(d.totals.closed.distributablePaisa);
  });

  it("carries a deficit from one open month into the next exactly like Distribution", async () => {
    const w = await distributionWorld();
    const nov = await createPeriod(w.property.id, "2026-11");
    const base = { propertyId: w.property.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, periodId: w.oct.id, categoryId: w.categories.REPAIR.id, amountPaisa: 20000000 });
    await createTxn({ ...base, periodId: nov.id, kind: "INCOME", categoryId: w.categories.RENT.id, amountPaisa: 15000000 });
    const d = await reportData("yearly", w.ownerLogin, "year=2026");
    expect(d.months[9].figure).toMatchObject({ distributablePaisa: 0, deficitCarriedPaisa: 11098000 });
    const board = await boardData(w.adminLogin, "2026-11");
    expect(board.staircase.previousDeficitPaisa).toBe(11098000);
    expect(d.months[10].figure).toMatchObject({ previousDeficitPaisa: 11098000, distributablePaisa: board.staircase.distributablePaisa, reservePaisa: board.staircase.reservePaisa });
  });

  it("is empty for a year without periods", async () => {
    const w = await distributionWorld();
    const d = await reportData("yearly", w.ownerLogin, "year=2025");
    expect(d.empty).toBe(true);
    expect(d.months.every((c: Col) => c.status === "NONE" && c.figure === null)).toBe(true);
    expect(d.totals).toMatchObject({ closedCount: 0, draftCount: 0 });
    expect(d.topExpenseCategories).toEqual([]);
  });

  it("lists years with data, newest first", async () => {
    const w = await distributionWorld();
    await createPeriod(w.property.id, "2025-12", "CLOSED");
    expect((await reportData("yearly", w.ownerLogin)).years).toEqual([2026, 2025]);
  });
});

describe("GET /api/v1/reports/yearly — top categories (F3.5)", () => {
  it("lists the five largest expense categories of the year, drafts included", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, categoryId: w.categories.REPAIR.id, amountPaisa: 17570000 });
    await createTxn({ ...base, categoryId: w.categories.SALARY.id, amountPaisa: 10800000 });
    await createTxn({ ...base, categoryId: w.categories.HOLDING_TAX.id, amountPaisa: 3700000 });
    await createTxn({ ...base, categoryId: w.categories.GAS.id, amountPaisa: 90000 });
    await createTxn({ ...base, categoryId: w.categories.GAS.id, amountPaisa: 900000, voided: "Wrong" });
    const d = await reportData("yearly", w.ownerLogin, "year=2026");
    expect(d.topExpenseCategories.map((c: { code: string; amountPaisa: number }) => [c.code, c.amountPaisa])).toEqual([
      ["REPAIR", 17570000],
      ["SALARY", 10800000],
      ["HOLDING_TAX", 3700000],
      ["ELEC", 1000000],
      ["WATER", 398000],
    ]);
    expect(d.topExpenseCategories[0].shareBp).toBe(5236); // 17570000 / 33558000
  });
});

describe("GET /api/v1/reports/yearly — owner year table (F3.6, G8, Rules 6–7)", () => {
  it("adds the year's ledger per owner and matches Owners for balance and loan", async () => {
    const w = await distributionWorld();
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    const d = await reportData("yearly", w.ownerLogin, "year=2026");
    const list = await listOwners(w.property.id, null);
    const balance = Object.fromEntries(list.owners.map((o) => [o.displayName.split(" ")[0].toLowerCase(), o]));
    const r = byFirst(d.owners.rows);
    expect(Object.keys(r)).toEqual(["nasrin", "rayhan", "tanvir", "farzana", "sabrina"]);
    for (const k of Object.keys(r)) {
      expect(r[k].balanceNowPaisa, k).toBe(balance[k].balancePaisa);
      expect(r[k].loanOutstandingPaisa, k).toBe(balance[k].loanOutstandingPaisa);
      const x = r[k] as Record<string, number>;
      expect(x.openingPaisa + x.entitlementPaisa - x.paidOutPaisa - x.advancesPaisa - x.loanDeductionPaisa + x.otherPaisa, k).toBe(x.balanceNowPaisa);
    }
    expect(r.nasrin).toMatchObject({ unitsNow: 40, sharePercentNow: 40, entitlementPaisa: 3382760, advancesPaisa: 500000, balanceLabel: "OWED" });
    expect(r.tanvir).toMatchObject({ openingPaisa: 805585, loanDeductionPaisa: 500000, loanOutstandingPaisa: 3000000 });
    expect(r.nasrin.shareChanges).toEqual([{ month: "2026-06", unitsBefore: 50, unitsAfter: 40, percentBefore: 50, percentAfter: 40 }]);
    expect(r.sabrina.shareChanges).toEqual([{ month: "2026-06", unitsBefore: 0, unitsAfter: 10, percentBefore: 0, percentAfter: 10 }]);
    expect(r.rayhan.shareChanges).toEqual([]);
    expect(d.owners.totals.entitlementPaisa).toBe(8456900);
  });
});

describe("GET /api/v1/reports/yearly — access and CSV (F7)", () => {
  it("refuses anonymous, users without report.view and bad years", async () => {
    const w = await distributionWorld();
    expect((await getReport("yearly", null, "year=2026")).status).toBe(401);
    expect((await getReport("yearly", await loginAs(await createUser({ roles: ["VIEWER"] })), "year=2026")).status).toBe(403);
    const bad = await getReport("yearly", w.ownerLogin, "year=1999");
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.code).toBe("VALIDATION_FAILED");
  });

  it("downloads the month table and the owner table as CSV", async () => {
    const w = await distributionWorld();
    const res = await getReport("yearly", w.ownerLogin, "year=2026&format=csv");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="BariHisab-Yearly-2026.csv"');
    const lines = (await res.text()).replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Month,Status,Income,Expenses (all),From reserve,Reserve kept,Deficit carried,Distributable");
    expect(lines[1]).toBe("2026-01,None,,,,,,");
    expect(lines[10]).toBe("2026-10,Draft,103000.00,13980.00,0.00,4451.00,0.00,84569.00");
    expect(lines[13]).toBe("Total (closed months),,0.00,0.00,0.00,0.00,,0.00");
    expect(lines[14]).toBe("");
    expect(lines[15]).toBe("Owner,Units now,Share now %,Opening,Entitlement,Paid out,Advances,Loan deductions,Other,Balance now,Loan outstanding");
    expect(lines[16]).toMatch(/^Nasrin Ahmed,40,40.00,/);
  });
});
