import { describe, expect, it } from "vitest";
import {
  approveCheck,
  canTransition,
  finishesWithin,
  formatRequestNumber,
  grantImpact,
  isOverdue,
  planInstalment,
  REQUEST_ACTIONS,
  REQUEST_STATUSES,
  reminderKinds,
  shortReason,
  visibleTo,
  type RequestAction,
  type RequestStatus,
} from "./requests";

describe("canTransition", () => {
  const allowed: Record<RequestAction, RequestStatus[]> = {
    approve: ["PENDING"],
    reject: ["PENDING"],
    edit: ["PENDING"],
    cancel: ["PENDING", "APPROVED"],
    withdraw: ["APPROVED"],
    disburse: ["APPROVED"],
  };

  it("allows exactly the lifecycle in PRD §4", () => {
    for (const action of REQUEST_ACTIONS) {
      for (const status of REQUEST_STATUSES) {
        expect(canTransition(status, action), `${status} ${action}`).toBe(allowed[action].includes(status));
      }
    }
  });
});

describe("approveCheck", () => {
  it("accepts the requested amount without a note", () => {
    expect(approveCheck(800000, 800000, null)).toBeNull();
  });

  it("accepts ৳1 and a lower amount with a note", () => {
    expect(approveCheck(800000, 100, "Only a token")).toBeNull();
    expect(approveCheck(800000, 600000, "Reduced — bank balance is low until rent clears")).toBeNull();
  });

  it("refuses 0, below ৳1 and above the requested amount", () => {
    const msg = { amountPaisa: "Approve between ৳1 and ৳8,000." };
    expect(approveCheck(800000, 0, "x")).toEqual(msg);
    expect(approveCheck(800000, 99, "x")).toEqual(msg);
    expect(approveCheck(800000, 800001, null)).toEqual(msg);
  });

  it("needs a note when lower", () => {
    expect(approveCheck(800000, 600000, null)).toEqual({ note: "Explain why the amount is lower." });
    expect(approveCheck(800000, 600000, "   ")).toEqual({ note: "Explain why the amount is lower." });
  });
});

describe("formatRequestNumber", () => {
  it("pads to three digits and grows when needed", () => {
    expect(formatRequestNumber(2026, 14)).toBe("R-2026-014");
    expect(formatRequestNumber(2027, 1)).toBe("R-2027-001");
    expect(formatRequestNumber(2026, 1000)).toBe("R-2026-1000");
  });
});

describe("isOverdue", () => {
  it("is true only for PENDING requests past their needed-by date", () => {
    expect(isOverdue({ status: "PENDING", neededBy: "2026-10-15" }, "2026-10-20")).toBe(true);
    expect(isOverdue({ status: "PENDING", neededBy: "2026-10-20" }, "2026-10-20")).toBe(false);
    expect(isOverdue({ status: "APPROVED", neededBy: "2026-10-15" }, "2026-10-20")).toBe(false);
  });
});

describe("planInstalment", () => {
  it("reads the first number of the plan in paisa", () => {
    expect(planInstalment("৳4,000 per month from entitlement")).toBe(400000);
    expect(planInstalment("৪,০০০ টাকা প্রতি মাসে")).toBe(400000);
    expect(planInstalment("2500.50 monthly")).toBe(250050);
  });

  it("returns null without a usable number", () => {
    expect(planInstalment("Manual")).toBeNull();
    expect(planInstalment(null)).toBeNull();
    expect(planInstalment("0 per month")).toBeNull();
  });
});

describe("finishesWithin", () => {
  it("checks the months needed against the limit", () => {
    expect(finishesWithin(2000000, 400000, 24)).toBe(true);
    expect(finishesWithin(2000000, 50000, 24)).toBe(false);
    expect(finishesWithin(2400000, 100000, 24)).toBe(true);
    expect(finishesWithin(2000000, null, 24)).toBeNull();
  });
});

describe("grantImpact", () => {
  const holders = [
    { ownerId: "nasrin", units: 8 },
    { ownerId: "rayhan", units: 5 },
    { ownerId: "tanvir", units: 3 },
    { ownerId: "farzana", units: 2 },
    { ownerId: "sabrina", units: 2 },
  ];
  // Surplus 9752000 with a 5 % reserve → distributable 9264400 (§11.3).
  const month = { incomePaisa: 12000000, expensePaisa: 2248000, reserveSpentPaisa: 0, previousDeficitPaisa: 0, rule: { mode: "PERCENT" as const, percentBp: 500 } };

  it("follows §11.3: ৳6,000 grant costs ৳5,700 of the distributable", () => {
    const r = grantImpact(month, holders, 600000);
    expect(r.distributableBeforePaisa).toBe(9264400);
    expect(r.distributableAfterPaisa).toBe(8694400);
    expect(r.dropPaisa).toBe(570000);
    expect(r.owners).toEqual([
      { ownerId: "nasrin", dropPaisa: 228000 },
      { ownerId: "rayhan", dropPaisa: 142500 },
      { ownerId: "tanvir", dropPaisa: 85500 },
      { ownerId: "farzana", dropPaisa: 57000 },
      { ownerId: "sabrina", dropPaisa: 57000 },
    ]);
    expect(r.perTenPctPaisa).toBe(57000);
  });

  it("never drops more than the distributable there is", () => {
    const r = grantImpact({ ...month, incomePaisa: 2348000 }, holders, 600000);
    expect(r.distributableBeforePaisa).toBe(95000);
    expect(r.dropPaisa).toBe(95000);
  });

  it("without shares nobody loses anything", () => {
    expect(grantImpact(month, [], 600000).perTenPctPaisa).toBe(57000);
    expect(grantImpact(month, [], 600000).owners).toEqual([]);
  });
});

describe("reminderKinds", () => {
  it("flags pending for more than 3 days", () => {
    expect(reminderKinds({ status: "PENDING", askedOn: "2026-10-15", neededBy: "2026-10-30" }, "2026-10-18")).toEqual([]);
    expect(reminderKinds({ status: "PENDING", askedOn: "2026-10-15", neededBy: "2026-10-30" }, "2026-10-19")).toEqual(["PENDING_3_DAYS"]);
  });

  it("flags approved and unpaid past needed-by", () => {
    expect(reminderKinds({ status: "APPROVED", askedOn: "2026-10-01", neededBy: "2026-10-20" }, "2026-10-20")).toEqual([]);
    expect(reminderKinds({ status: "APPROVED", askedOn: "2026-10-01", neededBy: "2026-10-20" }, "2026-10-21")).toEqual(["APPROVED_PAST_DUE"]);
    expect(reminderKinds({ status: "DISBURSED", askedOn: "2026-10-01", neededBy: "2026-10-02" }, "2026-10-21")).toEqual([]);
  });
});

describe("shortReason", () => {
  it("keeps short reasons and cuts long ones to 80 characters", () => {
    expect(shortReason("Car service")).toBe("Car service");
    const long = "x".repeat(100);
    expect(shortReason(long)).toHaveLength(80);
    expect(shortReason(long).endsWith("…")).toBe(true);
    expect(shortReason("  spaced   out  ")).toBe("spaced out");
  });
});

describe("visibleTo", () => {
  const req = (status: RequestStatus) => ({ status, ownerUserId: "u-owner", createdById: "u-owner" });

  it("gives Super Admins everything", () => {
    expect(visibleTo(req("PENDING"), { userId: "admin", viewAll: true })).toBe("full");
  });

  it("gives the owner and the creator their own requests in full", () => {
    expect(visibleTo(req("REJECTED"), { userId: "u-owner", viewAll: false })).toBe("full");
    expect(visibleTo({ status: "PENDING", ownerUserId: null, createdById: "u-rec" }, { userId: "u-rec", viewAll: false })).toBe("full");
  });

  it("shows other owners only disbursed requests, limited", () => {
    expect(visibleTo(req("DISBURSED"), { userId: "other", viewAll: false })).toBe("limited");
    for (const s of ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "WITHDRAWN"] as const) {
      expect(visibleTo(req(s), { userId: "other", viewAll: false }), s).toBe("none");
    }
  });
});
