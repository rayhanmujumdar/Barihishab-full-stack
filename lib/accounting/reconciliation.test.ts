import { describe, expect, it } from "vitest";
import { reconcile, type ReconcileInput } from "./reconciliation";

// Home PRD §9: fund ৳1,24,508.75 = owners + reserve + open month net.
const balanced: ReconcileInput = {
  fundPaisa: 12450875,
  ownerBalancesPaisa: 12000000,
  reservePaisa: 445100,
  openNetPaisa: 5775,
  deficitCarriedPaisa: 0,
  loansOutstandingPaisa: 0,
};

/** Apply a money move to both sides of the equation. */
const move = (i: ReconcileInput, d: Partial<ReconcileInput>): ReconcileInput => ({
  fundPaisa: i.fundPaisa + (d.fundPaisa ?? 0),
  ownerBalancesPaisa: i.ownerBalancesPaisa + (d.ownerBalancesPaisa ?? 0),
  reservePaisa: i.reservePaisa + (d.reservePaisa ?? 0),
  openNetPaisa: i.openNetPaisa + (d.openNetPaisa ?? 0),
  deficitCarriedPaisa: i.deficitCarriedPaisa + (d.deficitCarriedPaisa ?? 0),
  loansOutstandingPaisa: i.loansOutstandingPaisa + (d.loansOutstandingPaisa ?? 0),
});

describe("reconcile (main PRD §5.7, Home PRD F5/G8)", () => {
  it("is BALANCED when the fund equals the formula to the paisa", () => {
    expect(reconcile(balanced)).toEqual({ status: "BALANCED", expectedPaisa: 12450875, mismatchPaisa: 0, parts: balanced });
  });

  it("is CHECK with the signed mismatch when the cash is short", () => {
    const r = reconcile({ ...balanced, fundPaisa: 12250875 });
    expect(r.status).toBe("CHECK");
    expect(r.mismatchPaisa).toBe(-200000);
    expect(r.expectedPaisa).toBe(12450875);
  });

  it("is CHECK by a single paisa", () => {
    expect(reconcile({ ...balanced, fundPaisa: balanced.fundPaisa + 1 })).toMatchObject({ status: "CHECK", mismatchPaisa: 1 });
  });

  it("subtracts the carried deficit and loans outstanding", () => {
    const r = reconcile({ fundPaisa: 700, ownerBalancesPaisa: 1000, reservePaisa: 100, openNetPaisa: 50, deficitCarriedPaisa: 150, loansOutstandingPaisa: 300 });
    expect(r).toMatchObject({ status: "BALANCED", expectedPaisa: 700 });
  });

  it.each([
    ["loan disbursed from the fund", { fundPaisa: -1000000, loansOutstandingPaisa: 1000000 }],
    ["loan deduction on close (no cash, TC-08)", { ownerBalancesPaisa: -200000, loansOutstandingPaisa: -200000 }],
    ["cash loan repayment", { fundPaisa: 300000, loansOutstandingPaisa: -300000 }],
    ["payout to an owner", { fundPaisa: -1000000, ownerBalancesPaisa: -1000000 }],
    ["advance to an owner", { fundPaisa: -500000, ownerBalancesPaisa: -500000 }],
    ["payout void reversal (TC-12)", { fundPaisa: 1000000, ownerBalancesPaisa: 1000000 }],
    ["income in the open month", { fundPaisa: 1800000, openNetPaisa: 1800000 }],
    ["expense in the open month", { fundPaisa: -108000, openNetPaisa: -108000 }],
    ["expense paid from the reserve", { fundPaisa: -50000, reservePaisa: -50000 }],
  ] as const)("stays BALANCED after a %s", (_, d) => {
    expect(reconcile(move(balanced, d)).status).toBe("BALANCED");
  });

  it("stays BALANCED when a month closes (net → entitlements + reserve)", () => {
    // Open net 8902000 becomes 8456900 owner entitlements + 445100 kept in reserve.
    const before = { ...balanced, fundPaisa: balanced.fundPaisa + 8902000, openNetPaisa: balanced.openNetPaisa + 8902000 };
    expect(reconcile(before).status).toBe("BALANCED");
    expect(reconcile(move(before, { openNetPaisa: -8902000, ownerBalancesPaisa: 8456900, reservePaisa: 445100 })).status).toBe("BALANCED");
  });
});
