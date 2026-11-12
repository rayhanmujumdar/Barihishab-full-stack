import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, can, permissionsFor } from "./permissions";

const OWNER_KEYS = [
  "profile.update.self",
  "profile.password.self",
  "session.manage.self",
  "audit.view.financial",
  "transaction.view",
  "attachment.view",
  "owner.view",
  "distribution.view",
  "loan.view",
  "request.create",
  "request.view",
  "report.view",
  "notice.view",
  "complaint.view",
  "complaint.create",
];

const MONEY_WRITE_KEYS = [
  "transaction.create",
  "transaction.update",
  "transaction.void",
  "transaction.adjust",
  "category.manage",
  "unit.manage",
  "fund.manage",
  // Owners PRD §4
  "owner.manage",
  "share.manage",
  "payout.create",
  "advance.create",
  "ledger.void",
  "ledger.adjust",
  // Distribution PRD §4
  "period.close",
  "period.reopen",
  "reserve.override",
  "loan.manage",
  // Advances & Loans PRD §4
  "loan.create",
  "loan.repay",
  // Requests PRD §5
  "request.view.all",
  "request.decide",
  "request.disburse",
  "request.record",
  // Notices & Complaints PRD §5
  "notice.manage",
  "complaint.view.all",
  "complaint.decide",
] as const;

describe("ROLE_PERMISSIONS", () => {
  it("gives SUPER_ADMIN all 51 v1 permission keys", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(51);
    expect(new Set(ROLE_PERMISSIONS.SUPER_ADMIN)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it("gives OWNER exactly the fifteen self-service and read-only money keys", () => {
    expect([...ROLE_PERMISSIONS.OWNER].sort()).toEqual([...OWNER_KEYS].sort());
  });

  it("keeps every money write key away from OWNER", () => {
    for (const key of MONEY_WRITE_KEYS) {
      expect(can({ roles: ["OWNER"] }, key), key).toBe(false);
      expect(can({ roles: ["SUPER_ADMIN"] }, key), key).toBe(true);
    }
  });

  it("gives P3 roles no permissions yet", () => {
    expect(ROLE_PERMISSIONS.ACCOUNTANT).toEqual([]);
    expect(ROLE_PERMISSIONS.VIEWER).toEqual([]);
  });
});

describe("permissionsFor", () => {
  it("returns the union across roles without duplicates", () => {
    const perms = permissionsFor(["OWNER", "SUPER_ADMIN"]);
    expect(perms).toHaveLength(51);
    expect(new Set(perms).size).toBe(perms.length);
  });

  it("returns nothing for no roles and ignores unknown roles", () => {
    expect(permissionsFor([])).toEqual([]);
    expect(permissionsFor(["GHOST" as never])).toEqual([]);
  });
});

describe("can", () => {
  it("checks by permission name, never role name", () => {
    expect(can({ roles: ["OWNER"] }, "profile.update.self")).toBe(true);
    expect(can({ roles: ["OWNER"] }, "user.create")).toBe(false);
    expect(can({ roles: ["SUPER_ADMIN"] }, "user.create")).toBe(true);
    expect(can({ roles: ["VIEWER"] }, "audit.view.financial")).toBe(false);
  });

  it("accepts a precomputed permission list (client-side hints)", () => {
    expect(can({ permissions: ["user.list"] }, "user.list")).toBe(true);
    expect(can({ permissions: [] }, "user.list")).toBe(false);
  });

  it("denies unknown roles and subjects without roles or permissions", () => {
    expect(can({ roles: ["GHOST" as never] }, "profile.update.self")).toBe(false);
    expect(can({}, "profile.update.self")).toBe(false);
  });

  it("denies a null or anonymous user", () => {
    expect(can(null, "profile.update.self")).toBe(false);
    expect(can(undefined, "profile.update.self")).toBe(false);
  });
});
