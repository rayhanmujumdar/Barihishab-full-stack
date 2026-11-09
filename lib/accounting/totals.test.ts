import { describe, expect, it } from "vitest";
import { fundBalance, toPeriodTotals } from "./totals";

describe("toPeriodTotals", () => {
  it("splits income, expense and reserve-paid expense", () => {
    expect(
      toPeriodTotals([
        { kind: "INCOME", fromReserve: false, sum: 10300000, count: 6 },
        { kind: "EXPENSE", fromReserve: false, sum: 1398000, count: 4 },
        { kind: "EXPENSE", fromReserve: true, sum: 1800000, count: 1 },
      ]),
    ).toEqual({ incomePaisa: 10300000, expensePaisa: 1398000, reserveSpentPaisa: 1800000, incomeCount: 6, expenseCount: 5 });
  });

  it("is all zeros for an empty month", () => {
    expect(toPeriodTotals([])).toEqual({ incomePaisa: 0, expensePaisa: 0, reserveSpentPaisa: 0, incomeCount: 0, expenseCount: 0 });
  });

  it("matches the PRD §11 October example", () => {
    const t = toPeriodTotals([
      { kind: "INCOME", fromReserve: false, sum: 8800000 + 1500000, count: 7 },
      { kind: "EXPENSE", fromReserve: false, sum: 630000 + 360000 + 108000 + 300000, count: 4 },
    ]);
    expect(t.incomePaisa).toBe(10300000);
    expect(t.expensePaisa).toBe(1398000);
    expect(t.incomePaisa - t.expensePaisa).toBe(8902000); // Base ৳89,020
  });
});

describe("fundBalance", () => {
  it("is opening + income − expense", () => {
    expect(fundBalance(200000, 1800000, 630000)).toBe(1370000);
    expect(fundBalance(200000, 0, 500000)).toBe(-300000);
  });

  it("adds signed owner-ledger moves and subtracts loans disbursed", () => {
    // 1370000 − payout 400000 − advance 100000 + its reversal 100000 − loan 200000
    expect(fundBalance(200000, 1800000, 630000, -400000, 200000)).toBe(770000);
  });
});
