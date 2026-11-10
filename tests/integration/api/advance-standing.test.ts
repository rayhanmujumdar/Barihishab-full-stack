import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/v1/advances/by-owner/route";
import { prisma } from "@/lib/prisma";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { loansWorld } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const standing = async (login: Login) => (await json(await route.GET(apiRequest("/advances/by-owner", { login }), params({})))).data;

describe("GET /api/v1/advances/by-owner (F13, F14)", () => {
  it("shows Tanvir's loan, advance outstanding and limit use (§11.4)", async () => {
    const w = await loansWorld();
    await w.closedMonth("2026-07", { [w.owners.tanvir.id]: 1121040 });
    await w.closedMonth("2026-08", { [w.owners.tanvir.id]: 1304160 });
    // September (already closed in the sample) gets its entitlement through a reopened-style insert.
    await prisma.period.update({ where: { id: w.sep.id }, data: { status: "OPEN" } });
    await w.entry(w.owners.tanvir.id, "ENTITLEMENT", 1305585, { periodId: w.sep.id });
    await prisma.period.update({ where: { id: w.sep.id }, data: { status: "CLOSED" } });
    await w.entry(w.owners.tanvir.id, "ADVANCE", -805585 - 1121040 - 1304160 - 1305585 - 200000, { fundAccountId: w.cash.id, entryDate: "2026-10-14" });
    const voided = await w.entry(w.owners.tanvir.id, "ADVANCE", -1, { fundAccountId: w.cash.id, entryDate: "2026-10-18", voided: "Typo" });
    await w.entry(w.owners.tanvir.id, "REVERSAL", 1, { fundAccountId: w.cash.id, reversesId: voided.id });

    const d = await standing(w.ownerLogin);
    expect(d.owners.map((o: { displayName: string }) => o.displayName)).toEqual(["Nasrin Ahmed", "Rayhan Ahmed", "Tanvir Ahmed", "Farzana Haque", "Sabrina Ahmed"]);
    const t = d.owners.find((o: { ownerId: string }) => o.ownerId === w.owners.tanvir.id);
    expect(t).toEqual({
      ownerId: w.owners.tanvir.id,
      displayName: "Tanvir Ahmed",
      loanOutstandingPaisa: 3500000,
      activeLoans: 1,
      balancePaisa: -200000,
      advanceOutstandingPaisa: 200000,
      averageEntitlementPaisa: 1243595,
      limitPaisa: 1243595,
      limitUsedPct: 16,
      lastAdvanceDate: "2026-10-14",
      latestActiveLoan: { id: w.loan.id, number: 1, outstandingPaisa: 3500000 },
    });
    expect(d.multiplierPct).toBe(100);
  });

  it("has no limit without closed entitlements", async () => {
    const w = await loansWorld();
    const d = await standing(w.adminLogin);
    const n = d.owners.find((o: { ownerId: string }) => o.ownerId === w.owners.nasrin.id);
    expect(n).toMatchObject({ advanceOutstandingPaisa: 500000, limitPaisa: null, limitUsedPct: null, lastAdvanceDate: "2026-10-12", loanOutstandingPaisa: 0, activeLoans: 0, latestActiveLoan: null });
  });
});
