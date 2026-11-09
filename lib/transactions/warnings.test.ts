import { describe, expect, it } from "vitest";
import { buildWarnings } from "./warnings";

const base = { rentAlreadyRecorded: false, possibleDuplicate: false, fundAccountId: "f", fundBalancePaisa: 100, txnDate: "2026-10-12", periodMonth: "2026-10" };

describe("buildWarnings", () => {
  it("is empty for a normal entry", () => {
    expect(buildWarnings(base)).toEqual([]);
  });

  it("flags a second rent, duplicates and a negative fund (INC-03, DUP-02, FND-01)", () => {
    expect(buildWarnings({ ...base, rentAlreadyRecorded: true, possibleDuplicate: true, fundBalancePaisa: -300000 })).toEqual([
      { code: "RENT_ALREADY_RECORDED" },
      { code: "POSSIBLE_DUPLICATE" },
      { code: "FUND_NEGATIVE", fundAccountId: "f", balancePaisa: -300000 },
    ]);
  });

  it("warns past 45 days from the month, not at 45", () => {
    expect(buildWarnings({ ...base, txnDate: "2026-12-15" })).toEqual([]);
    expect(buildWarnings({ ...base, txnDate: "2026-12-16" })).toEqual([{ code: "DATE_FAR_FROM_PERIOD" }]);
    expect(buildWarnings({ ...base, txnDate: "2026-08-16" })).toEqual([{ code: "DATE_FAR_FROM_PERIOD" }]);
  });
});
