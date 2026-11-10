import { describe, expect, it } from "vitest";
import { advanceStatuses, expectedFinish, loanFigures, loanHistory, repaymentCap, type HistoryLedgerRow, type HistoryMovementRow } from "./loans";

const ded = (id: string, amountPaisa: number, over: Partial<HistoryLedgerRow> = {}): HistoryLedgerRow => ({
  id,
  type: "LOAN_DEDUCTION",
  amountPaisa,
  date: "2026-07-31",
  at: `2026-07-31T10:00:00.000Z#${id}`,
  origin: "CLOSE",
  voided: false,
  voidReason: null,
  reversesId: null,
  recordedBy: "Admin",
  note: null,
  ...over,
});
const mov = (id: string, type: HistoryMovementRow["type"], amountPaisa: number, over: Partial<HistoryMovementRow> = {}): HistoryMovementRow => ({
  id,
  type,
  amountPaisa,
  date: "2026-08-15",
  at: `2026-08-15T10:00:00.000Z#${id}`,
  voided: false,
  voidReason: null,
  reversesId: null,
  recordedBy: "Admin",
  note: null,
  ...over,
});

describe("loanFigures", () => {
  it("L2: three deductions and a cash repayment, then the cash is voided", () => {
    const ledger = [ded("d1", -500000), ded("d2", -500000), ded("d3", -500000)];
    const before = loanFigures(5000000, ledger, [mov("c1", "CASH_REPAYMENT", -1000000)]);
    expect(before).toEqual({ outstandingPaisa: 2500000, repaidCashPaisa: 1000000, repaidDeductionPaisa: 1500000, repaidPaisa: 2500000, progress: 0.5 });
    const after = loanFigures(5000000, ledger, [mov("c1", "CASH_REPAYMENT", -1000000, { voided: true }), mov("r1", "REVERSAL", 1000000, { reversesId: "c1" })]);
    expect(after).toMatchObject({ outstandingPaisa: 3500000, repaidCashPaisa: 0, repaidPaisa: 1500000, progress: 0.3 });
  });

  it("voided manual deductions and their reversals cancel out", () => {
    const f = loanFigures(1000000, [ded("d1", -300000, { origin: "DIRECT", voided: true }), ded("r1", 300000, { type: "REVERSAL", reversesId: "d1" })], []);
    expect(f).toMatchObject({ outstandingPaisa: 1000000, repaidDeductionPaisa: 0, repaidPaisa: 0, progress: 0 });
  });

  it("a cancellation or write-off brings the outstanding to 0 without counting as repaid", () => {
    expect(loanFigures(2000000, [], [mov("x", "CANCELLATION", -2000000)])).toMatchObject({ outstandingPaisa: 0, repaidPaisa: 0 });
    expect(loanFigures(5000000, [ded("d1", -2000000)], [mov("w", "WRITE_OFF", -3000000)])).toMatchObject({ outstandingPaisa: 0, repaidPaisa: 2000000 });
  });
});

describe("expectedFinish", () => {
  const base = { status: "ACTIVE" as const, installmentPaisa: 500000, disbursedOn: "2026-06-10" };

  it("L2 after October: six instalments November → April", () => {
    expect(expectedFinish({ ...base, outstandingPaisa: 3000000, earliestOpenMonth: "2026-11" })).toEqual({
      monthsLeft: 6,
      finishMonth: "2027-04",
      nextDeduction: { amountPaisa: 500000, month: "2026-11" },
    });
  });

  it("a June loan is first deducted when July closes", () => {
    expect(expectedFinish({ ...base, outstandingPaisa: 5000000, earliestOpenMonth: "2026-06" })).toMatchObject({ monthsLeft: 10, finishMonth: "2027-04", nextDeduction: { month: "2026-07" } });
    expect(expectedFinish({ ...base, outstandingPaisa: 5000000, earliestOpenMonth: null })).toMatchObject({ finishMonth: "2027-04" });
  });

  it("a lower instalment moves the finish month; the last one can be partial", () => {
    expect(expectedFinish({ ...base, installmentPaisa: 300000, outstandingPaisa: 3000000, earliestOpenMonth: "2026-11" })?.finishMonth).toBe("2027-08");
    expect(expectedFinish({ ...base, outstandingPaisa: 120000, earliestOpenMonth: "2026-12" })).toEqual({
      monthsLeft: 1,
      finishMonth: "2026-12",
      nextDeduction: { amountPaisa: 120000, month: "2026-12" },
    });
  });

  it("manual, paid-off and closed loans have no schedule", () => {
    expect(expectedFinish({ ...base, installmentPaisa: null, outstandingPaisa: 100, earliestOpenMonth: "2026-11" })).toBeNull();
    expect(expectedFinish({ ...base, outstandingPaisa: 0, earliestOpenMonth: "2026-11" })).toBeNull();
    expect(expectedFinish({ ...base, status: "CANCELLED", outstandingPaisa: 100, earliestOpenMonth: "2026-11" })).toBeNull();
  });
});

describe("repaymentCap", () => {
  it("cash is capped by the outstanding, a deduction also by the positive balance", () => {
    expect(repaymentCap("CASH", 1000000, -50000)).toBe(1000000);
    expect(repaymentCap("DEDUCTION", 3500000, 805585)).toBe(805585);
    expect(repaymentCap("DEDUCTION", 300000, 805585)).toBe(300000);
    expect(repaymentCap("DEDUCTION", 300000, -5)).toBe(0);
  });
});

describe("loanHistory", () => {
  it("L2: disbursed then close deductions, oldest first with the running outstanding", () => {
    const rows = loanHistory({
      status: "ACTIVE",
      principalPaisa: 5000000,
      disbursedOn: "2026-06-10",
      disbursedAt: "2026-06-10T08:00:00.000Z",
      disbursedBy: "Admin",
      ledger: [ded("d2", -500000, { date: "2026-08-31", at: "2026-08-31T00:00:00.000Z" }), ded("d1", -500000)],
      movements: [],
      skippedMonths: [{ month: "2026-09", date: "2026-09-30" }],
    });
    expect(rows.map((r) => [r.kind, r.amountPaisa, r.runningPaisa, r.voidable])).toEqual([
      ["DISBURSED", 5000000, 5000000, false],
      ["DEDUCTION", 500000, 4500000, false],
      ["DEDUCTION", 500000, 4000000, false],
      ["SKIPPED", 0, 4000000, false],
    ]);
    expect(rows[1]).toMatchObject({ onClose: true, month: "2026-07" });
    expect(rows[3]).toMatchObject({ month: "2026-09", date: "2026-09-30" });
  });

  it("voids keep the original visible next to its reversal; only open repayments are voidable", () => {
    const rows = loanHistory({
      status: "ACTIVE",
      principalPaisa: 2000000,
      disbursedOn: "2026-02-12",
      disbursedAt: "2026-02-12T08:00:00.000Z",
      disbursedBy: "Admin",
      ledger: [ded("m1", -100000, { origin: "DIRECT", date: "2026-03-01", at: "2026-03-01T00:00:00.000Z" })],
      movements: [
        mov("c1", "CASH_REPAYMENT", -1000000, { voided: true, voidReason: "Wrong loan", date: "2026-03-30", at: "2026-03-30T00:00:00.000Z" }),
        mov("r1", "REVERSAL", 1000000, { reversesId: "c1", date: "2026-04-01", at: "2026-04-01T00:00:00.000Z" }),
        mov("c2", "CASH_REPAYMENT", -500000, { date: "2026-05-28", at: "2026-05-28T00:00:00.000Z" }),
        mov("c0", "CASH_REPAYMENT", -1, { date: "2026-02-12", at: "2026-02-12T09:00:00.000Z" }),
      ],
      skippedMonths: [],
    });
    expect(rows.map((r) => [r.id, r.kind, r.effectPaisa, r.runningPaisa, r.voided, r.voidable])).toEqual([
      ["disbursed", "DISBURSED", 2000000, 2000000, false, false],
      ["c0", "CASH_REPAYMENT", -1, 1999999, false, true],
      ["m1", "DEDUCTION", -100000, 1899999, false, true],
      ["c1", "CASH_REPAYMENT", -1000000, 899999, true, false],
      ["r1", "REVERSAL", 1000000, 1899999, false, false],
      ["c2", "CASH_REPAYMENT", -500000, 1399999, false, true],
    ]);
    expect(rows[3].voidReason).toBe("Wrong loan");
  });

  it("ledger reversals, cancellation and write-off get their own kinds; closed loans have nothing voidable", () => {
    const rows = loanHistory({
      status: "WRITTEN_OFF",
      principalPaisa: 1000000,
      disbursedOn: "2026-01-05",
      disbursedAt: "2026-01-05T00:00:00.000Z",
      disbursedBy: "Admin",
      ledger: [
        ded("m1", -200000, { origin: "DIRECT", voided: true, date: "2026-02-01", at: "2026-02-01T00:00:00.000Z" }),
        ded("lr", 200000, { type: "REVERSAL", reversesId: "m1", origin: "DIRECT", date: "2026-02-02", at: "2026-02-02T00:00:00.000Z" }),
        ded("m2", -100000, { origin: "DIRECT", date: "2026-02-03", at: "2026-02-03T00:00:00.000Z" }),
      ],
      movements: [mov("w", "WRITE_OFF", -900000, { date: "2026-03-01", at: "2026-03-01T00:00:00.000Z" })],
      skippedMonths: [],
    });
    expect(rows.map((r) => r.kind)).toEqual(["DISBURSED", "DEDUCTION", "REVERSAL", "DEDUCTION", "WRITTEN_OFF"]);
    expect(rows.every((r) => !r.voidable)).toBe(true);
    expect(rows.at(-1)?.runningPaisa).toBe(0);
    expect(loanHistory({ ...{ status: "CANCELLED" as const, principalPaisa: 10, disbursedOn: "2026-01-01", disbursedAt: "x", disbursedBy: "A", ledger: [], skippedMonths: [] }, movements: [mov("x", "CANCELLATION", -10)] }).at(-1)?.kind).toBe("CANCELLED");
  });
});

describe("advanceStatuses", () => {
  type E = Parameters<typeof advanceStatuses>[0][number];
  const e = (id: string, type: E["type"], amountPaisa: number, month: string, over: Partial<E> = {}): E => ({ id, type, amountPaisa, month, voided: false, ...over });

  it("Nasrin: an October advance is recovered by October's entitlement", () => {
    const s = advanceStatuses([e("a", "ADVANCE", -500000, "2026-10"), e("en", "ENTITLEMENT", 3382760, "2026-10")]);
    expect(s.get("a")).toEqual({ status: "RECOVERED", recoveredMonth: "2026-10" });
  });

  it("recovers oldest first, leaving the newer advance outstanding", () => {
    const s = advanceStatuses([e("aug", "ADVANCE", -300000, "2026-08"), e("sep", "ADVANCE", -200000, "2026-09"), e("en", "ENTITLEMENT", 400000, "2026-09")]);
    expect(s.get("aug")).toEqual({ status: "RECOVERED", recoveredMonth: "2026-09" });
    expect(s.get("sep")).toEqual({ status: "OUTSTANDING", recoveredMonth: null });
  });

  it("an advance that never took the balance below 0 is recovered in its own month", () => {
    const s = advanceStatuses([e("o", "OPENING", 800000, "2026-01"), e("a", "ADVANCE", -500000, "2026-02")]);
    expect(s.get("a")).toEqual({ status: "RECOVERED", recoveredMonth: "2026-02" });
  });

  it("only the part below 0 is queued; earlier debts are cleared first", () => {
    const s = advanceStatuses([
      e("o", "OPENING", -100000, "2026-01"),
      e("a", "ADVANCE", -300000, "2026-02", { }),
      e("en", "ENTITLEMENT", 150000, "2026-02"),
      e("adj", "ADJUSTMENT", 250000, "2026-03"),
    ]);
    expect(s.get("a")).toEqual({ status: "RECOVERED", recoveredMonth: "2026-03" });
  });

  it("voided advances are VOID; voided entries and reversals are skipped", () => {
    const s = advanceStatuses([
      e("o", "OPENING", -50000, "2026-01"),
      e("a", "ADVANCE", -300000, "2026-02", { voided: true }),
      e("r", "REVERSAL", 300000, "2026-02"),
      e("p", "PAYOUT", -100000, "2026-02", { voided: true }),
      e("b", "ADVANCE", -100000, "2026-03"),
      e("en", "ENTITLEMENT", 0, "2026-03"),
    ]);
    expect(s.get("a")).toEqual({ status: "VOID", recoveredMonth: null });
    expect(s.get("b")).toEqual({ status: "OUTSTANDING", recoveredMonth: null });
    expect(s.has("p")).toBe(false);
  });
});
