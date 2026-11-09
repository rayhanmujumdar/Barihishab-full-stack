import { describe, expect, it } from "vitest";
import { checkEntry, isAfterTomorrow, MSG, type EntryCheck } from "./rules";

const cat = (code: string, kind: "INCOME" | "EXPENSE" = "EXPENSE", isActive = true) => ({ code, kind, isActive });
const base: EntryCheck = {
  kind: "EXPENSE",
  category: cat("ELEC"),
  unitId: null,
  unit: null,
  fund: { isActive: true },
  referencePeriod: null,
  reference: null,
  periodMonth: "2026-10",
  txnDate: "2026-10-12",
  today: "2026-10-20",
  fromReserve: false,
  mode: "manual",
};

describe("checkEntry", () => {
  it("accepts a normal expense", () => {
    expect(checkEntry(base)).toBeNull();
  });

  it("requires an active category of the same kind", () => {
    expect(checkEntry({ ...base, category: null })).toEqual({ categoryId: MSG.category });
    expect(checkEntry({ ...base, category: cat("ELEC", "EXPENSE", false) })).toEqual({ categoryId: MSG.category });
    expect(checkEntry({ ...base, category: cat("OTHER_INC", "INCOME") })).toEqual({ categoryId: MSG.category });
  });

  it("keeps OWNER_GRANT and adjustment categories out of manual entry (EXP-05)", () => {
    for (const code of ["OWNER_GRANT", "ADJUSTMENT_EXP"]) expect(checkEntry({ ...base, category: cat(code) })).toEqual({ categoryId: MSG.category });
    expect(checkEntry({ ...base, category: cat("ADJUSTMENT_EXP"), mode: "adjustment", referencePeriod: "2026-08", reference: { status: "CLOSED", month: "2026-08" } })).toBeNull();
  });

  it("requires an active unit for RENT and ARREAR, and none on expenses", () => {
    const rent = { ...base, kind: "INCOME" as const, category: cat("RENT", "INCOME") };
    expect(checkEntry(rent)).toEqual({ unitId: MSG.unit });
    expect(checkEntry({ ...rent, unitId: "u", unit: { isActive: false } })).toEqual({ unitId: MSG.unit });
    expect(checkEntry({ ...rent, unitId: "u", unit: null })).toEqual({ unitId: MSG.unit });
    expect(checkEntry({ ...rent, unitId: "u", unit: { isActive: true } })).toBeNull();
    expect(checkEntry({ ...base, unitId: "u", unit: { isActive: true } })).toEqual({ unitId: MSG.unitIncomeOnly });
  });

  it("requires a CLOSED, earlier reference month for ARREAR only", () => {
    const arrear = { ...base, kind: "INCOME" as const, category: cat("ARREAR", "INCOME"), unitId: "u", unit: { isActive: true }, periodMonth: "2026-11", txnDate: "2026-11-02", today: "2026-11-02" };
    expect(checkEntry(arrear)).toEqual({ referencePeriod: MSG.reference });
    expect(checkEntry({ ...arrear, referencePeriod: "2026-10", reference: { status: "OPEN", month: "2026-10" } })).toEqual({ referencePeriod: MSG.reference });
    expect(checkEntry({ ...arrear, referencePeriod: "2026-12", reference: { status: "CLOSED", month: "2026-12" } })).toEqual({ referencePeriod: MSG.reference });
    expect(checkEntry({ ...arrear, referencePeriod: "2026-01", reference: null })).toEqual({ referencePeriod: MSG.reference });
    expect(checkEntry({ ...arrear, referencePeriod: "2026-10", reference: { status: "CLOSED", month: "2026-10" } })).toBeNull();
    expect(checkEntry({ ...base, referencePeriod: "2026-09", reference: { status: "CLOSED", month: "2026-09" } })).toEqual({ referencePeriod: MSG.referenceNotAllowed });
  });

  it("allows From Reserve only on expenses and needs an active fund", () => {
    expect(checkEntry({ ...base, kind: "INCOME", category: cat("OTHER_INC", "INCOME"), fromReserve: true })).toEqual({ fromReserve: MSG.reserve });
    expect(checkEntry({ ...base, fund: null })).toEqual({ fundAccountId: MSG.fund });
    expect(checkEntry({ ...base, fund: { isActive: false } })).toEqual({ fundAccountId: MSG.fund });
  });

  it("refuses dates after tomorrow", () => {
    expect(checkEntry({ ...base, txnDate: "2026-10-21" })).toBeNull();
    expect(checkEntry({ ...base, txnDate: "2026-10-22" })).toEqual({ txnDate: MSG.future });
  });
});

describe("isAfterTomorrow", () => {
  it("handles month ends", () => {
    expect(isAfterTomorrow("2026-11-01", "2026-10-31")).toBe(false);
    expect(isAfterTomorrow("2026-11-02", "2026-10-31")).toBe(true);
  });
});
