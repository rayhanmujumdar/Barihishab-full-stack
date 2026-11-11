import { describe, expect, it } from "vitest";
import {
  categoryRows,
  changeBp,
  fundRow,
  monthFigure,
  ownerYearFigures,
  rentRoll,
  shareBp,
  shareChanges,
  yearTotals,
  type CategoryGroup,
  type MonthFigure,
} from "./reports";

describe("shareBp (Reports G5)", () => {
  it("rounds half-up to basis points like PRD §9.1", () => {
    const total = 1398000;
    expect([630000, 360000, 300000, 108000].map((a) => shareBp(a, total))).toEqual([4506, 2575, 2146, 773]);
    expect(shareBp(1, 20000)).toBe(1); // 0.5 bp → 1
    expect(shareBp(8800000, 10300000)).toBe(8544);
  });

  it("is 0 when the total is 0 or negative", () => {
    expect(shareBp(0, 0)).toBe(0);
    expect(shareBp(100, -5)).toBe(0);
  });

  it("stays exact for amounts beyond 2^53 / 10000", () => {
    expect(shareBp(1_000_000_000_000, 2_000_000_000_000)).toBe(5000);
  });
});

describe("changeBp (Reports F8)", () => {
  it("is relative to the previous value", () => {
    expect(changeBp(10300000, 12500000)).toBe(-1760);
    expect(changeBp(630000, 400000)).toBe(5750);
  });

  it("rounds half away from zero", () => {
    expect(changeBp(3, 20000)).toBe(-9999); // −0.99985 → −9999 (−9998.5)
    expect(changeBp(20003, 20000)).toBe(2); // 1.5 bp → 2
  });

  it("is null when the previous value is 0 or missing", () => {
    expect(changeBp(500, 0)).toBeNull();
    expect(changeBp(500, null)).toBeNull();
  });
});

const g = (code: string, sortOrder: number, amountPaisa: number, count = 1): CategoryGroup => ({ categoryId: code, code, nameEn: code, nameBn: code, sortOrder, amountPaisa, count });

describe("categoryRows (Reports F2.3–F2.4)", () => {
  it("sorts expenses by amount, ties by category order, and adds shares", () => {
    const rows = categoryRows([g("GAS", 1, 108000), g("WATER", 5, 360000), g("ELEC", 2, 630000), g("CLEAN", 4, 300000), g("TIE", 3, 300000)], "EXPENSE");
    expect(rows.map((r) => r.code)).toEqual(["ELEC", "WATER", "TIE", "CLEAN", "GAS"]);
    expect(rows[0].shareBp).toBe(3710);
  });

  it("keeps income in category order and drops empty categories", () => {
    const rows = categoryRows([g("OTHER", 9, 1500000), g("RENT", 1, 8800000, 5), g("EMPTY", 2, 0, 0)], "INCOME");
    expect(rows.map((r) => [r.code, r.count, r.shareBp])).toEqual([
      ["RENT", 5, 8544],
      ["OTHER", 1, 1456],
    ]);
  });
});

const stair = { incomePaisa: 10300000, expensePaisa: 1398000, reserveSpentPaisa: 0, reservePaisa: 445100, previousDeficitPaisa: 0, distributablePaisa: 8456900, deficitCarriedPaisa: 0 };

describe("monthFigure (Reports G1, Rule 4)", () => {
  it("splits expenses (all) into counted and paid from Reserve", () => {
    expect(monthFigure({ ...stair, expensePaisa: 3200000, reserveSpentPaisa: 1800000 })).toMatchObject({
      expensesAllPaisa: 5000000,
      fromReservePaisa: 1800000,
      expensesCountedPaisa: 3200000,
    });
  });

  it("carries the staircase through", () => {
    expect(monthFigure(stair)).toEqual({
      incomePaisa: 10300000,
      expensesAllPaisa: 1398000,
      fromReservePaisa: 0,
      expensesCountedPaisa: 1398000,
      reservePaisa: 445100,
      previousDeficitPaisa: 0,
      distributablePaisa: 8456900,
      deficitCarriedPaisa: 0,
    });
  });
});

describe("yearTotals (Reports G2, Rule 5)", () => {
  const f = (income: number, distributable: number): MonthFigure => monthFigure({ ...stair, incomePaisa: income, distributablePaisa: distributable });
  it("separates closed months from draft months", () => {
    const t = yearTotals([
      { month: "2026-08", status: "FINAL", figure: f(12500000, 8000000) },
      { month: "2026-09", status: "FINAL", figure: f(12500000, 7000000) },
      { month: "2026-10", status: "DRAFT", figure: f(10300000, 8456900) },
      { month: "2026-11", status: "NONE", figure: null },
    ]);
    expect(t.closedCount).toBe(2);
    expect(t.draftCount).toBe(1);
    expect(t.closed).toMatchObject({ incomePaisa: 25000000, distributablePaisa: 15000000, expensesAllPaisa: 2796000, reservePaisa: 890200, fromReservePaisa: 0 });
    expect(t.draft).toMatchObject({ incomePaisa: 10300000, distributablePaisa: 8456900 });
  });
});

describe("ownerYearFigures (Reports F3.6, §9.3)", () => {
  it("adds each type, flips outflows positive and counts reversals against the reversed type", () => {
    const m = ownerYearFigures(
      ["nasrin", "tanvir", "idle"],
      new Map([
        ["nasrin", 1200000],
        ["tanvir", -400000],
      ]),
      [
        { ownerId: "nasrin", type: "ENTITLEMENT", amountPaisa: 29224070 },
        { ownerId: "nasrin", type: "PAYOUT", amountPaisa: -30424070 },
        { ownerId: "nasrin", type: "PAYOUT", amountPaisa: -100000 },
        { ownerId: "nasrin", type: "REVERSAL", amountPaisa: 100000, reversedType: "PAYOUT" },
        { ownerId: "nasrin", type: "ADVANCE", amountPaisa: -500000 },
        { ownerId: "tanvir", type: "ENTITLEMENT", amountPaisa: 9780765 },
        { ownerId: "tanvir", type: "LOAN_DEDUCTION", amountPaisa: -1500000 },
        { ownerId: "tanvir", type: "ADJUSTMENT", amountPaisa: 50000 },
        { ownerId: "tanvir", type: "OPENING", amountPaisa: 10000 },
        { ownerId: "tanvir", type: "REVERSAL", amountPaisa: -7000, reversedType: null },
      ],
    );
    expect(m.get("nasrin")).toEqual({ openingPaisa: 1200000, entitlementPaisa: 29224070, paidOutPaisa: 30424070, advancesPaisa: 500000, loanDeductionPaisa: 0, otherPaisa: 0, endPaisa: -500000 });
    expect(m.get("tanvir")).toEqual({ openingPaisa: -390000, entitlementPaisa: 9780765, paidOutPaisa: 0, advancesPaisa: 0, loanDeductionPaisa: 1500000, otherPaisa: 43000, endPaisa: 7933765 });
    expect(m.get("idle")).toEqual({ openingPaisa: 0, entitlementPaisa: 0, paidOutPaisa: 0, advancesPaisa: 0, loanDeductionPaisa: 0, otherPaisa: 0, endPaisa: 0 });
  });
});

describe("ownerYearFigures edge cases", () => {
  it("ignores rows of owners not in the list", () => {
    const m = ownerYearFigures(["a"], new Map(), [{ ownerId: "b", type: "PAYOUT", amountPaisa: -100 }]);
    expect([...m.keys()]).toEqual(["a"]);
    expect(m.get("a")?.paidOutPaisa).toBe(0);
  });
});

describe("shareChanges (Reports G8)", () => {
  const sets = [
    { id: "a", effectiveMonth: "2025-01", replaced: false, items: [{ ownerId: "n", units: 50 }, { ownerId: "r", units: 50 }] },
    { id: "x", effectiveMonth: "2026-03", replaced: true, items: [{ ownerId: "n", units: 1 }] },
    { id: "b", effectiveMonth: "2026-06", replaced: false, items: [{ ownerId: "n", units: 40 }, { ownerId: "r", units: 50 }, { ownerId: "s", units: 10 }] },
    { id: "c", effectiveMonth: "2027-01", replaced: false, items: [{ ownerId: "n", units: 30 }] },
  ];

  it("lists changes effective inside the year with units and percent before → after (not the house's first set)", () => {
    expect(shareChanges(sets, 2026, "n")).toEqual([{ month: "2026-06", unitsBefore: 50, unitsAfter: 40, percentBefore: 50, percentAfter: 40 }]);
    expect(shareChanges(sets, 2026, "s")).toEqual([{ month: "2026-06", unitsBefore: 0, unitsAfter: 10, percentBefore: 0, percentAfter: 10 }]);
    expect(shareChanges(sets, 2026, "r")).toEqual([]);
    expect(shareChanges(sets, 2025, "n")).toEqual([]);
  });
});

describe("rentRoll (Reports F9)", () => {
  const units = [
    { id: "2a", name: "Flat 2A", tenantName: "Karim", rentPaisa: 1800000, isActive: true },
    { id: "3a", name: "Flat 3A", tenantName: "Nusrat", rentPaisa: 1800000, isActive: true },
    { id: "old", name: "Shop", tenantName: null, rentPaisa: 500000, isActive: false },
    { id: "gone", name: "Garage", tenantName: null, rentPaisa: 300000, isActive: false },
  ];
  const months = [
    { key: "2026-09", hasPeriod: true },
    { key: "2026-10", hasPeriod: true },
    { key: "2026-11", hasPeriod: false },
  ];
  const r = rentRoll(units, months, [
    { id: "t1", unitId: "2a", month: "2026-10", referenceMonth: null, amountPaisa: 1800000 },
    { id: "t2", unitId: "2a", month: "2026-10", referenceMonth: "2026-09", amountPaisa: 1800000 },
    { id: "t3", unitId: "3a", month: "2026-09", referenceMonth: null, amountPaisa: 1800000 },
    { id: "t4", unitId: "old", month: "2026-09", referenceMonth: "2026-09", amountPaisa: 500000 },
  ]);

  it("marks each month's own rent: paid on time, paid late (arrear) or missing", () => {
    const [a, b, shop] = r.rows;
    expect(a.cells).toEqual([
      { kind: "ARREAR", paidIn: "2026-10", amountPaisa: 1800000, entryIds: ["t2"] },
      { kind: "PAID", amountPaisa: 1800000, entryIds: ["t1"] },
      { kind: "NONE" },
    ]);
    expect(b.cells[1]).toEqual({ kind: "NONE" });
    expect(shop.cells[0]).toEqual({ kind: "PAID", amountPaisa: 500000, entryIds: ["t4"] });
  });

  it("does not let a catch-up payment mark its booking month as paid", () => {
    const roll = rentRoll(
      [{ id: "u", name: "Flat", tenantName: null, rentPaisa: 100, isActive: true }],
      [
        { key: "2026-01", hasPeriod: true },
        { key: "2026-02", hasPeriod: true },
      ],
      [{ id: "jan-late", unitId: "u", month: "2026-02", referenceMonth: "2026-01", amountPaisa: 100 }],
    );
    expect(roll.rows[0].cells).toEqual([{ kind: "ARREAR", paidIn: "2026-02", amountPaisa: 100, entryIds: ["jan-late"] }, { kind: "NONE" }]);
    expect(roll.months.map((m) => m.collectionBp)).toEqual([10000, 0]);
  });

  it("ignores rent for months outside the grid (shown in that year's roll)", () => {
    const roll = rentRoll(
      [{ id: "u", name: "Flat", tenantName: null, rentPaisa: 100, isActive: true }],
      [{ key: "2026-01", hasPeriod: true }],
      [{ id: "dec", unitId: "u", month: "2026-01", referenceMonth: "2025-12", amountPaisa: 100 }],
    );
    expect(roll.rows[0]).toMatchObject({ cells: [{ kind: "NONE" }], totalPaisa: 0 });
  });

  it("expects rent only from the month a unit was added (or first paid)", () => {
    const roll = rentRoll(
      [
        { id: "new", name: "Flat 4A", tenantName: null, rentPaisa: 100, isActive: true, addedIn: "2026-10" },
        { id: "early", name: "Flat 1A", tenantName: null, rentPaisa: 100, isActive: true, addedIn: "2026-10" },
      ],
      [
        { key: "2026-09", hasPeriod: true },
        { key: "2026-10", hasPeriod: true },
      ],
      [{ id: "paid-sep", unitId: "early", month: "2026-09", referenceMonth: null, amountPaisa: 100 }],
    );
    expect(roll.rows.map((x) => x.expectedPaisa)).toEqual([100, 200]);
    expect(roll.months.map((m) => m.expectedPaisa)).toEqual([100, 200]);
  });

  it("keeps inactive units only when they have rent in the year", () => {
    expect(r.rows.map((x) => x.unitId)).toEqual(["2a", "3a", "old"]);
  });

  it("totals rent for each month (on time or late) with expected and collection", () => {
    // The inactive Shop is expected only up to its last rent (September).
    expect(r.rows.map((x) => [x.totalPaisa, x.expectedPaisa])).toEqual([
      [3600000, 3600000],
      [1800000, 3600000],
      [500000, 500000],
    ]);
    expect(r.months).toEqual([
      { key: "2026-09", totalPaisa: 4100000, expectedPaisa: 4100000, collectionBp: 10000 },
      { key: "2026-10", totalPaisa: 1800000, expectedPaisa: 3600000, collectionBp: 5000 },
      { key: "2026-11", totalPaisa: 0, expectedPaisa: null, collectionBp: null },
    ]);
  });
});

describe("rentRoll without active units", () => {
  it("has no collection rate when nothing is expected", () => {
    const r = rentRoll([{ id: "x", name: "Shop", tenantName: null, rentPaisa: 0, isActive: true }], [{ key: "2026-01", hasPeriod: true }], []);
    expect(r.months[0]).toEqual({ key: "2026-01", totalPaisa: 0, expectedPaisa: 0, collectionBp: null });
    expect(r.rows[0].cells).toEqual([{ kind: "NONE" }]);
  });

  it("names the earliest month an arrear was paid in", () => {
    const r = rentRoll(
      [{ id: "u", name: "Flat", tenantName: null, rentPaisa: 100, isActive: true }],
      [{ key: "2026-01", hasPeriod: true }],
      [
        { id: "late2", unitId: "u", month: "2026-03", referenceMonth: "2026-01", amountPaisa: 50 },
        { id: "late1", unitId: "u", month: "2026-02", referenceMonth: "2026-01", amountPaisa: 50 },
      ],
    );
    expect(r.rows[0].cells[0]).toEqual({ kind: "ARREAR", paidIn: "2026-02", amountPaisa: 100, entryIds: ["late1", "late2"] });
  });
});

describe("fundRow (Reports F11)", () => {
  const none = { incomePaisa: 0, expensesPaisa: 0, ownerPaymentsPaisa: 0, loansOutPaisa: 0, loanRepaymentsPaisa: 0 };
  it("rolls opening + movements into closing", () => {
    const row = fundRow(0, none, { incomePaisa: 10300000, expensesPaisa: 1398000, ownerPaymentsPaisa: 500000, loansOutPaisa: 0, loanRepaymentsPaisa: 0 });
    expect(row).toEqual({ openingPaisa: 0, incomePaisa: 10300000, expensesPaisa: 1398000, ownerPaymentsPaisa: 500000, loansOutPaisa: 0, loanRepaymentsPaisa: 0, closingPaisa: 8402000 });
  });

  it("starts from the account opening plus everything before the period", () => {
    const row = fundRow(100000, { incomePaisa: 900000, expensesPaisa: 100000, ownerPaymentsPaisa: 200000, loansOutPaisa: 300000, loanRepaymentsPaisa: 50000 }, { ...none, loanRepaymentsPaisa: 25000, loansOutPaisa: 10000 });
    expect(row.openingPaisa).toBe(450000);
    expect(row.closingPaisa).toBe(465000);
  });
});
