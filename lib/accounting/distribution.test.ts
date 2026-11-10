import { describe, expect, it } from "vitest";
import {
  allocate,
  boardRows,
  closeChecks,
  deductionByOwner,
  diffSnapshots,
  loanDeductions,
  reserveFor,
  staircase,
  unpaidUnits,
  type BoardEntry,
  type CloseCheckInput,
  type ReserveRule,
} from "./distribution";

const OFF: ReserveRule = { mode: "OFF" };
const FIVE: ReserveRule = { mode: "PERCENT", percentBp: 500 };

describe("reserveFor", () => {
  it("is 0 when the rule is off or there is no surplus (Rule 10)", () => {
    expect(reserveFor(8902000, OFF)).toBe(0);
    expect(reserveFor(0, FIVE)).toBe(0);
    expect(reserveFor(-4578000, FIVE)).toBe(0);
    expect(reserveFor(-1, FIVE, 50000)).toBe(0);
  });

  it("rounds a percent half-up to whole taka (§11.1)", () => {
    expect(reserveFor(8902000, FIVE)).toBe(445100);
    expect(reserveFor(8902050, FIVE)).toBe(445100);
    expect(reserveFor(9822000, FIVE)).toBe(491100);
    expect(reserveFor(1000, FIVE)).toBe(100); // ৳0.50 → ৳1
    expect(reserveFor(999, FIVE)).toBe(0); // ৳0.4995 → ৳0
    expect(reserveFor(50, { mode: "PERCENT", percentBp: 10000 })).toBe(50); // never above surplus
  });

  it("caps a fixed amount and an override at the surplus", () => {
    expect(reserveFor(1500000, { mode: "FIXED", fixedPaisa: 2000000 })).toBe(1500000);
    expect(reserveFor(8902000, { mode: "FIXED", fixedPaisa: 500000 })).toBe(500000);
    expect(reserveFor(8902000, FIVE, 1000000)).toBe(1000000);
    expect(reserveFor(800000, FIVE, 1000000)).toBe(800000);
    expect(reserveFor(8902000, FIVE, 0)).toBe(0);
  });
});

describe("staircase", () => {
  it("computes the October 2026 preview (§11.1)", () => {
    const s = staircase({ incomePaisa: 10300000, expensePaisa: 1398000, reserveSpentPaisa: 0, previousDeficitPaisa: 0, rule: FIVE });
    expect(s).toMatchObject({ surplusPaisa: 8902000, reservePaisa: 445100, reserveSource: "RULE", netPaisa: 8456900, distributablePaisa: 8456900, deficitCarriedPaisa: 0 });
  });

  it("carries April's deficit into May (§11.2)", () => {
    const april = staircase({ incomePaisa: 12500000, expensePaisa: 17078000, reserveSpentPaisa: 0, previousDeficitPaisa: 0, rule: FIVE });
    expect(april).toMatchObject({ reservePaisa: 0, distributablePaisa: 0, deficitCarriedPaisa: 4578000 });
    const may = staircase({ incomePaisa: 12500000, expensePaisa: 2678000, reserveSpentPaisa: 0, previousDeficitPaisa: april.deficitCarriedPaisa, rule: FIVE });
    expect(may).toMatchObject({ reservePaisa: 491100, previousDeficitPaisa: 4578000, distributablePaisa: 4752900, deficitCarriedPaisa: 0 });
  });

  it("applies a 10% reserve (main PRD TC-05)", () => {
    const s = staircase({ incomePaisa: 10000000, expensePaisa: 2000000, reserveSpentPaisa: 0, previousDeficitPaisa: 0, rule: { mode: "PERCENT", percentBp: 1000 } });
    expect(s.reservePaisa).toBe(800000);
    expect(s.distributablePaisa).toBe(7200000);
  });

  it("marks an override and ignores it without surplus", () => {
    expect(staircase({ incomePaisa: 10300000, expensePaisa: 1398000, reserveSpentPaisa: 300000, previousDeficitPaisa: 0, rule: FIVE, overridePaisa: 1000000 })).toMatchObject({
      reservePaisa: 1000000,
      reserveSource: "OVERRIDE",
      distributablePaisa: 7902000,
      reserveSpentPaisa: 300000,
    });
    expect(staircase({ incomePaisa: 0, expensePaisa: 100, reserveSpentPaisa: 0, previousDeficitPaisa: 0, rule: OFF, overridePaisa: 5 }).reserveSource).toBe("RULE");
  });
});

describe("allocate", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `o${i + 1}`);

  it("gives the extra paisa by display order on a tie (§11.3)", () => {
    const r = allocate(100000, ids(3).map((ownerId) => ({ ownerId, units: 1 })));
    expect(r.map((a) => a.amountPaisa)).toEqual([33334, 33333, 33333]);
  });

  it("splits October by 40:25:15:10:10", () => {
    const units = [40, 25, 15, 10, 10];
    const r = allocate(8456900, units.map((u, i) => ({ ownerId: `o${i}`, units: u })));
    expect(r.map((a) => a.amountPaisa)).toEqual([3382760, 2114225, 1268535, 845690, 845690]);
  });

  it("gives leftover paisa to the largest remainders, not the first owner", () => {
    // 10 paisa by 1:2 → 3.33 / 6.67 → 3 + 7
    expect(allocate(10, [{ ownerId: "a", units: 1 }, { ownerId: "b", units: 2 }]).map((a) => a.amountPaisa)).toEqual([3, 7]);
  });

  it("gives 0 for zero distributable, zero units and no units at all", () => {
    expect(allocate(0, [{ ownerId: "a", units: 1 }])).toEqual([{ ownerId: "a", amountPaisa: 0 }]);
    expect(allocate(100, [{ ownerId: "a", units: 0 }])).toEqual([{ ownerId: "a", amountPaisa: 0 }]);
    expect(allocate(101, [{ ownerId: "a", units: 0 }, { ownerId: "b", units: 1 }, { ownerId: "c", units: 1 }]).map((a) => a.amountPaisa)).toEqual([0, 51, 50]);
  });

  it("always sums to the distributable (property check)", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let run = 0; run < 300; run++) {
      const holders = Array.from({ length: 1 + rand(8) }, (_, i) => ({ ownerId: `o${i}`, units: rand(50) }));
      if (holders.every((h) => h.units === 0)) holders[0].units = 1;
      const d = rand(1_000_000_000);
      const r = allocate(d, holders);
      expect(r.reduce((s, a) => s + a.amountPaisa, 0)).toBe(d);
      for (const a of r) expect(Number.isInteger(a.amountPaisa)).toBe(true);
    }
  });
});

describe("loanDeductions", () => {
  const loan = (over: Partial<Parameters<typeof loanDeductions>[1][number]> = {}) => ({ id: "l1", ownerId: "t", installmentPaisa: 200000, outstandingPaisa: 1000000, disbursedOn: "2026-01-10", ...over });

  it("deducts the instalment (main PRD TC-08)", () => {
    const r = loanDeductions([{ ownerId: "t", amountPaisa: 1600000 }], [loan()]);
    expect(r.deductions).toEqual([{ loanId: "l1", ownerId: "t", amountPaisa: 200000, paysOff: false }]);
    expect(r.skipped).toEqual([]);
  });

  it("is capped by the entitlement and by the outstanding (G4)", () => {
    expect(loanDeductions([{ ownerId: "t", amountPaisa: 300000 }], [loan({ installmentPaisa: 500000 })]).deductions[0].amountPaisa).toBe(300000);
    const paid = loanDeductions([{ ownerId: "t", amountPaisa: 1268535 }], [loan({ installmentPaisa: 500000, outstandingPaisa: 150000 })]).deductions[0];
    expect(paid).toMatchObject({ amountPaisa: 150000, paysOff: true });
  });

  it("skips a loan when no entitlement is free", () => {
    const r = loanDeductions([{ ownerId: "t", amountPaisa: 0 }], [loan()]);
    expect(r.deductions).toEqual([]);
    expect(r.skipped).toEqual([{ loanId: "l1", ownerId: "t" }]);
    expect(loanDeductions([], [loan()]).skipped).toHaveLength(1);
  });

  it("ignores loans without instalment or outstanding, and serves the oldest loan first", () => {
    const r = loanDeductions(
      [{ ownerId: "t", amountPaisa: 250000 }],
      [
        loan({ id: "new", disbursedOn: "2026-05-01" }),
        loan({ id: "old", disbursedOn: "2026-02-01" }),
        loan({ id: "none", installmentPaisa: null }),
        loan({ id: "done", outstandingPaisa: 0 }),
        loan({ id: "same-a", disbursedOn: "2026-09-01", installmentPaisa: 1 }),
        loan({ id: "same-b", disbursedOn: "2026-09-01", installmentPaisa: 1 }),
      ],
    );
    expect(r.deductions.map((d) => [d.loanId, d.amountPaisa])).toEqual([
      ["old", 200000],
      ["new", 50000],
    ]);
    expect(r.skipped.map((s) => s.loanId)).toEqual(["same-a", "same-b"]);
    expect(deductionByOwner(r.deductions).get("t")).toBe(250000);
  });

  it("takes no instalment from a loan disbursed in or after the month being closed (§7.3)", () => {
    const r = loanDeductions([{ ownerId: "t", amountPaisa: 1600000 }], [loan({ id: "june", disbursedOn: "2026-06-10" }), loan({ id: "may", disbursedOn: "2026-05-31" })], "2026-06");
    expect(r.deductions.map((d) => d.loanId)).toEqual(["may"]);
    expect(r.skipped).toEqual([]);
    expect(loanDeductions([{ ownerId: "t", amountPaisa: 1600000 }], [loan({ id: "june", disbursedOn: "2026-06-10" })], "2026-07").deductions).toHaveLength(1);
  });
});

describe("boardRows", () => {
  const owner = (ownerId: string, over: Partial<Parameters<typeof boardRows>[0]["owners"][number]> = {}) => ({ ownerId, units: 10, openingPaisa: 0, currentBalancePaisa: 0, loanOutstandingPaisa: 0, ...over });
  const e = (id: string, ownerId: string, type: BoardEntry["type"], amountPaisa: number, reversesId: string | null = null, voided = false): BoardEntry => ({ id, ownerId, type, amountPaisa, reversesId, voided });

  it("shows the open-month preview with Balance now and after close (§11.1 Tanvir)", () => {
    const { rows, totals } = boardRows({
      status: "OPEN",
      owners: [owner("t", { units: 15, openingPaisa: 805585, currentBalancePaisa: 805585, loanOutstandingPaisa: 3500000 })],
      monthEntries: [],
      entitlements: new Map([["t", 1268535]]),
      deductions: new Map([["t", 500000]]),
    });
    expect(rows[0]).toMatchObject({ entitlementPaisa: 1268535, loanDeductionPaisa: 500000, balancePaisa: 805585, afterClosePaisa: 1574120, loanOutstandingPaisa: 3500000 });
    expect(totals).toMatchObject({ entitlementPaisa: 1268535, loanDeductionPaisa: 500000 });
  });

  it("classifies posted entries and computes the month-end balance for a closed month", () => {
    const { rows, totals } = boardRows({
      status: "CLOSED",
      owners: [owner("f", { openingPaisa: 870390 })],
      monthEntries: [
        e("1", "f", "ENTITLEMENT", 845690),
        e("2", "f", "PAYOUT", -500000),
        e("3", "f", "ADVANCE", -100000),
        e("4", "f", "LOAN_DEDUCTION", -50000),
        e("5", "f", "ADJUSTMENT", 2000),
        e("6", "f", "OPENING", 1000),
        e("7", "f", "REVERSAL", 300000, "old-payout"),
      ],
      entitlements: new Map(),
      deductions: new Map(),
    });
    expect(rows[0]).toMatchObject({ entitlementPaisa: 845690, receivedPaisa: 500000, advancePaisa: 100000, loanDeductionPaisa: 50000, otherPaisa: 303000, afterClosePaisa: null });
    expect(rows[0].balancePaisa).toBe(870390 + 845690 - 500000 - 100000 - 50000 + 303000);
    expect(totals).toEqual({ entitlementPaisa: 845690, receivedPaisa: 500000, advancePaisa: 100000, loanDeductionPaisa: 50000, otherPaisa: 303000 });
  });

  it("cancels a voided original and its reversal in the same month", () => {
    const { rows } = boardRows({
      status: "CLOSED",
      owners: [owner("a")],
      monthEntries: [e("p", "a", "PAYOUT", -500000, null, true), e("r", "a", "REVERSAL", 500000, "p"), e("old", "a", "ENTITLEMENT", 100, null, true), e("r2", "a", "REVERSAL", -100, "old"), e("new", "a", "ENTITLEMENT", 200)],
      entitlements: new Map(),
      deductions: new Map(),
    });
    expect(rows[0]).toMatchObject({ receivedPaisa: 0, otherPaisa: 0, entitlementPaisa: 200, balancePaisa: 200 });
  });

  it("lists 0-unit owners only when they had activity (G8)", () => {
    const { rows } = boardRows({
      status: "OPEN",
      owners: [owner("former", { units: 0, currentBalancePaisa: -200000 }), owner("idle", { units: 0 })],
      monthEntries: [e("p", "former", "PAYOUT", -200000)],
      entitlements: new Map(),
      deductions: new Map(),
    });
    expect(rows.map((r) => r.ownerId)).toEqual(["former"]);
    expect(rows[0]).toMatchObject({ receivedPaisa: 200000, entitlementPaisa: 0, afterClosePaisa: -200000 });
  });
});

describe("unpaidUnits", () => {
  it("lists active units with rent and no income this month", () => {
    const units = [
      { id: "1", name: "Flat 3A", tenantName: "Nusrat Jahan", rentPaisa: 1800000, isActive: true },
      { id: "2", name: "Flat 2A", tenantName: null, rentPaisa: 1800000, isActive: true },
      { id: "3", name: "Shop", tenantName: null, rentPaisa: 0, isActive: true },
      { id: "4", name: "Old", tenantName: null, rentPaisa: 100, isActive: false },
    ];
    expect(unpaidUnits(units, new Set(["2"])).map((u) => u.name)).toEqual(["Flat 3A"]);
  });
});

describe("closeChecks", () => {
  const ok: CloseCheckInput = {
    totalUnits: 100,
    ownersWithUnits: 5,
    previousOpenMonth: null,
    sumEntitlementsPaisa: 8456900,
    distributablePaisa: 8456900,
    isOpen: true,
    incomeCount: 6,
    unpaidUnitCount: 0,
    expensesWithoutBill: 0,
    monthOver: true,
    reserveAfterClosePaisa: 0,
  };

  it("passes everything for a clean month", () => {
    expect(closeChecks(ok)).toEqual({ mustPass: expect.arrayContaining([{ code: "SHARES", ok: true }]), warnings: [], canClose: true });
  });

  it("blocks on each must-pass failure", () => {
    const failed = (over: Partial<CloseCheckInput>) => closeChecks({ ...ok, ...over }).mustPass.filter((c) => !c.ok).map((c) => c.code);
    expect(failed({ totalUnits: 0, ownersWithUnits: 0 })).toEqual(["SHARES"]);
    expect(failed({ totalUnits: 0, ownersWithUnits: 0, sumEntitlementsPaisa: 0 })).toEqual(["SHARES"]);
    expect(failed({ previousOpenMonth: "2026-09" })).toEqual(["PREVIOUS_CLOSED"]);
    expect(failed({ sumEntitlementsPaisa: 1 })).toEqual(["BALANCED"]);
    expect(failed({ isOpen: false })).toEqual(["STILL_OPEN"]);
    expect(closeChecks({ ...ok, isOpen: false }).canClose).toBe(false);
  });

  it("warns without blocking", () => {
    const r = closeChecks({ ...ok, incomeCount: 0, unpaidUnitCount: 1, expensesWithoutBill: 2, monthOver: false, reserveAfterClosePaisa: -1 });
    expect(r.warnings).toEqual(["NO_INCOME", "UNPAID_RENT", "MISSING_BILLS", "MONTH_NOT_OVER", "RESERVE_NEGATIVE"]);
    expect(r.canClose).toBe(true);
  });
});

describe("diffSnapshots", () => {
  it("shows the §6.3 missed plumber bill", () => {
    const base = { incomePaisa: 12500000, previousDeficitPaisa: 0, deficitCarriedPaisa: 0 };
    const before = { ...base, expensePaisa: 2678000, reservePaisa: 491100, distributablePaisa: 9330900, entitlements: [{ ownerId: "a", amountPaisa: 9330900 }, { ownerId: "gone", amountPaisa: 0 }] };
    const after = { ...base, expensePaisa: 3178000, reservePaisa: 466100, distributablePaisa: 8855900, entitlements: [{ ownerId: "a", amountPaisa: 8855900 }, { ownerId: "new", amountPaisa: 5 }] };
    const d = diffSnapshots(before, after);
    expect(d.lines).toEqual([
      { key: "expensePaisa", beforePaisa: 2678000, afterPaisa: 3178000, diffPaisa: 500000 },
      { key: "reservePaisa", beforePaisa: 491100, afterPaisa: 466100, diffPaisa: -25000 },
      { key: "distributablePaisa", beforePaisa: 9330900, afterPaisa: 8855900, diffPaisa: -475000 },
    ]);
    expect(d.owners).toEqual([
      { ownerId: "a", beforePaisa: 9330900, afterPaisa: 8855900, diffPaisa: -475000 },
      { ownerId: "new", beforePaisa: 0, afterPaisa: 5, diffPaisa: 5 },
      { ownerId: "gone", beforePaisa: 0, afterPaisa: 0, diffPaisa: 0 },
    ]);
  });
});
