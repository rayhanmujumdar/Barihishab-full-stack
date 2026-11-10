import { describe, expect, it } from "vitest";
import {
  advanceLimit,
  balanceLabel,
  entitlementTotal,
  oldestDueMonth,
  ownerStatus,
  paidOut,
  setInForce,
  shareHistory,
  sharePercent,
  splitPayout,
  statement,
  totalUnits,
  unitsIn,
  type ShareSetLike,
} from "./owners";

const set = (id: string, effectiveMonth: string, units: Record<string, number>, replaced = false): ShareSetLike => ({
  id,
  effectiveMonth,
  replaced,
  items: Object.entries(units).map(([ownerId, u]) => ({ ownerId, units: u })),
});

// Owners PRD §2.2 share history.
const JAN = set("jan", "2026-01", { nasrin: 50, rayhan: 25, tanvir: 15, farzana: 10 });
const JUN = set("jun", "2026-06", { nasrin: 40, rayhan: 25, tanvir: 15, farzana: 10, sabrina: 10 });
const SETS = [JUN, JAN];

describe("balanceLabel", () => {
  it("labels positive, negative and zero balances", () => {
    expect(balanceLabel(805585)).toBe("OWED");
    expect(balanceLabel(-500000)).toBe("ADVANCE");
    expect(balanceLabel(0)).toBe("SETTLED");
  });
});

describe("sharePercent", () => {
  it("derives % from units", () => {
    expect(sharePercent(40, 100)).toBe(40);
    expect(sharePercent(1, 3)).toBeCloseTo(33.333, 2);
    expect(sharePercent(5, 0)).toBe(0);
  });
});

describe("setInForce / unitsIn", () => {
  it("picks the latest active set on or before the month", () => {
    expect(setInForce(SETS, "2026-05")?.id).toBe("jan");
    expect(setInForce(SETS, "2026-06")?.id).toBe("jun");
    expect(setInForce(SETS, "2026-08")?.id).toBe("jun");
    expect(setInForce(SETS, "2025-12")).toBeNull();
  });

  it("ignores replaced sets", () => {
    const old = set("old", "2026-06", { nasrin: 1 }, true);
    expect(setInForce([old, ...SETS], "2026-07")?.id).toBe("jun");
  });

  it("reads one owner's units, 0 when absent", () => {
    expect(unitsIn(JUN, "sabrina")).toBe(10);
    expect(unitsIn(JAN, "sabrina")).toBe(0);
    expect(unitsIn(null, "nasrin")).toBe(0);
  });

  it("totals a set's units", () => {
    expect(totalUnits(JUN)).toBe(100);
    expect(totalUnits(null)).toBe(0);
  });
});

describe("ownerStatus", () => {
  it("is current while the set in force gives units", () => {
    expect(ownerStatus(SETS, "nasrin", "2026-10")).toEqual({ status: "current", leftMonth: null });
  });

  it("is new when no set ever gave units", () => {
    expect(ownerStatus(SETS, "karim", "2026-10")).toEqual({ status: "new", leftMonth: null });
    expect(ownerStatus(SETS, "sabrina", "2026-05")).toEqual({ status: "new", leftMonth: null });
    expect(ownerStatus([], "karim", "2026-10")).toEqual({ status: "new", leftMonth: null });
  });

  it("is former after a set takes them to 0, with the month they left", () => {
    const sep = set("sep", "2026-09", { nasrin: 50, rayhan: 25, tanvir: 15, farzana: 10, sabrina: 0 });
    expect(ownerStatus([sep, ...SETS], "sabrina", "2026-10")).toEqual({ status: "former", leftMonth: "2026-09" });
  });

  it("ignores sets that start after the month", () => {
    const nov = set("nov", "2026-11", { nasrin: 40, rayhan: 25, farzana: 10, sabrina: 10 });
    expect(ownerStatus([nov, ...SETS], "tanvir", "2026-10").status).toBe("current");
  });
});

describe("shareHistory", () => {
  it("lists only versions where the owner's units changed, newest first", () => {
    const aug = set("aug", "2026-08", { nasrin: 40, rayhan: 30, tanvir: 10, farzana: 10, sabrina: 10 });
    const rows = shareHistory([aug, ...SETS], "nasrin");
    expect(rows.map((r) => [r.set.id, r.units, r.totalUnits])).toEqual([
      ["jun", 40, 100],
      ["jan", 50, 100],
    ]);
  });

  it("includes the move to 0 and skips replaced sets", () => {
    const sep = set("sep", "2026-09", { nasrin: 50, rayhan: 25, tanvir: 15, farzana: 10 });
    const replaced = set("x", "2026-09", { sabrina: 99 }, true);
    expect(shareHistory([sep, replaced, ...SETS], "sabrina").map((r) => [r.set.id, r.units])).toEqual([
      ["sep", 0],
      ["jun", 10],
    ]);
  });
});

describe("oldestDueMonth", () => {
  it("returns the first credit month not covered by debits", () => {
    const entries = [
      { month: "2026-08", amountPaisa: 3000000 },
      { month: "2026-09", amountPaisa: 3000000 },
      { month: "2026-09", amountPaisa: -4000000 },
    ];
    expect(oldestDueMonth(entries)).toBe("2026-09");
  });

  it("sorts credits by month", () => {
    expect(
      oldestDueMonth([
        { month: "2026-09", amountPaisa: 100 },
        { month: "2026-07", amountPaisa: 100 },
      ]),
    ).toBe("2026-07");
  });

  it("is null when nothing is owed", () => {
    expect(oldestDueMonth([{ month: "2026-08", amountPaisa: 100 }, { month: "2026-08", amountPaisa: -100 }])).toBeNull();
    expect(oldestDueMonth([{ month: "2026-08", amountPaisa: -100 }])).toBeNull();
    expect(oldestDueMonth([])).toBeNull();
  });
});

describe("splitPayout", () => {
  it("pays within the balance", () => {
    expect(splitPayout(870390, 870390)).toEqual({ payoutPaisa: 870390, excessPaisa: 0 });
    expect(splitPayout(100, 870390)).toEqual({ payoutPaisa: 100, excessPaisa: 0 });
  });

  it("splits above the balance", () => {
    expect(splitPayout(1300000, 805585)).toEqual({ payoutPaisa: 805585, excessPaisa: 494415 });
  });

  it("treats a zero or negative balance as nothing owed", () => {
    expect(splitPayout(100000, -500000)).toEqual({ payoutPaisa: 0, excessPaisa: 100000 });
    expect(splitPayout(100000, 0)).toEqual({ payoutPaisa: 0, excessPaisa: 100000 });
  });
});

describe("statement", () => {
  // Owners PRD §10 worked example (Nasrin, Aug 2026 → Latest).
  const e = (month: string, type: Parameters<typeof statement>[0][number]["type"], amountPaisa: number, id = `${month}-${type}`) => ({ id, month, type, amountPaisa });
  const NASRIN = [
    e("2026-07", "OPENING", 2989440),
    e("2026-08", "PAYOUT", -2989440),
    e("2026-08", "ENTITLEMENT", 3477760),
    e("2026-09", "PAYOUT", -3477760),
    e("2026-09", "ENTITLEMENT", 3481560),
    e("2026-10", "PAYOUT", -3481560),
    e("2026-10", "ADVANCE", -500000),
  ];

  it("reproduces the worked example", () => {
    const s = statement(NASRIN, "2026-08", null);
    expect(s.broughtForwardPaisa).toBe(2989440);
    expect(s.rows.map((r) => r.runningPaisa)).toEqual([0, 3477760, 0, 3481560, 0, -500000]);
    expect(s.closingPaisa).toBe(-500000);
    expect(s.totals).toEqual({ PAYOUT: -9948760, ENTITLEMENT: 6959320, ADVANCE: -500000 });
  });

  it("limits rows to the range and carries the rest", () => {
    const s = statement(NASRIN, "2026-08", "2026-08");
    expect(s.rows).toHaveLength(2);
    expect(s.closingPaisa).toBe(3477760);
  });

  it("handles an empty range", () => {
    const s = statement(NASRIN, "2027-01", "2027-03");
    expect(s.rows).toEqual([]);
    expect(s.broughtForwardPaisa).toBe(-500000);
    expect(s.closingPaisa).toBe(-500000);
    expect(s.totals).toEqual({});
  });

  it("keeps a voided payout and its reversal so they cancel", () => {
    const s = statement([e("2026-08", "OPENING", 1000000), e("2026-08", "PAYOUT", -400000), e("2026-09", "REVERSAL", 400000)], "2026-01", null);
    expect(s.rows.map((r) => r.runningPaisa)).toEqual([1000000, 600000, 1000000]);
    expect(s.closingPaisa).toBe(1000000);
  });
});

describe("advanceLimit", () => {
  it("averages the monthly entitlements", () => {
    expect(advanceLimit([3000000, 3000000, 3000000])).toBe(3000000);
    expect(advanceLimit([100, 200])).toBe(150);
    expect(advanceLimit([1, 1, 2])).toBe(1);
  });

  it("applies the Settings multiplier (F14): Nasrin's 1× limit is 3316253", () => {
    expect(advanceLimit([2989440, 3477760, 3481560])).toBe(3316253);
    expect(advanceLimit([2989440, 3477760, 3481560], 100)).toBe(3316253);
    expect(advanceLimit([3000000, 3000000, 3000000], 50)).toBe(1500000);
    expect(advanceLimit([3000000, 3000000, 3000000], 150)).toBe(4500000);
    expect(advanceLimit([3000000], 200)).toBe(6000000);
  });

  it("has no limit without entitlements", () => {
    expect(advanceLimit([])).toBeNull();
    expect(advanceLimit([0, 0, 0])).toBeNull();
    // 0.5× of a 1-paisa average rounds to 0: that is no usable limit, not "everything is over it".
    expect(advanceLimit([1, 0, 0], 50)).toBeNull();
    expect(advanceLimit([2], 50)).toBe(1);
  });
});

describe("paidOut / entitlementTotal", () => {
  const rows = [
    { type: "PAYOUT" as const, amountPaisa: -3000000, date: "2026-03-05", month: "2026-03", voided: false },
    { type: "ADVANCE" as const, amountPaisa: -500000, date: "2026-10-12", month: "2026-10", voided: false },
    { type: "PAYOUT" as const, amountPaisa: -200000, date: "2026-04-01", month: "2026-04", voided: true },
    { type: "REVERSAL" as const, amountPaisa: 200000, date: "2026-04-02", month: "2026-04", voided: false },
    { type: "PAYOUT" as const, amountPaisa: -100, date: "2025-12-31", month: "2025-12", voided: false },
    { type: "ENTITLEMENT" as const, amountPaisa: 3477760, date: "2026-09-02", month: "2026-08", voided: false },
    { type: "ENTITLEMENT" as const, amountPaisa: 100, date: "2026-01-01", month: "2025-12", voided: false },
  ];

  it("sums non-voided payouts and advances dated in the year", () => {
    expect(paidOut(rows, 2026)).toBe(3500000);
    expect(paidOut(rows, 2025)).toBe(100);
  });

  it("sums entitlements by their period's year", () => {
    expect(entitlementTotal(rows, 2026)).toBe(3477760);
    expect(entitlementTotal(rows, 2025)).toBe(100);
  });
});
