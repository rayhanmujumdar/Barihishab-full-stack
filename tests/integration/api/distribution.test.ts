import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeReminder } from "@/lib/distribution/distribution-service";
import { prisma } from "@/lib/prisma";
import { createPeriod, createProperty, createTxn, createUser, setReserveRule } from "../../helpers/factory";
import { boardData, byName, distributionWorld, postClose, readBoard } from "../../helpers/distribution";
import { apiRequest, json, loginAs } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("GET /api/v1/distribution (F1–F4, DST-01, DST-05)", () => {
  it("previews October like §11.1 for an Owner", async () => {
    const w = await distributionWorld();
    const res = await readBoard(w.ownerLogin, "2026-10");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const d = (await json(res)).data;
    expect(d.month).toMatchObject({ key: "2026-10", status: "OPEN", closedBy: null, mustCloseFirst: null, firstMonth: false });
    expect(d.staircase).toMatchObject({ incomePaisa: 10300000, expensePaisa: 1398000, reservePaisa: 445100, reserveSource: "RULE", previousDeficitPaisa: 0, distributablePaisa: 8456900, deficitCarriedPaisa: 0 });
    const r = byName(d.rows);
    expect(Object.keys(r)).toEqual(["nasrin", "rayhan", "tanvir", "farzana", "sabrina"]);
    expect(r.nasrin).toMatchObject({ entitlementPaisa: 3382760, balancePaisa: -500000, balanceLabel: "ADVANCE", afterClosePaisa: 2882760, advancePaisa: 500000, isViewer: true, units: 40, sharePercent: 40 });
    expect(r.tanvir).toMatchObject({ entitlementPaisa: 1268535, loanDeductionPaisa: 500000, balancePaisa: 805585, afterClosePaisa: 1574120, loanOutstandingPaisa: 3500000, otherPaisa: 805585 });
    expect(r.farzana).toMatchObject({ entitlementPaisa: 845690, afterClosePaisa: 1716080 });
    expect(d.totals).toMatchObject({ entitlementPaisa: 8456900, loanDeductionPaisa: 500000, advancePaisa: 500000 });
    expect(d.footer).toEqual({
      sumEntitlementsPaisa: 8456900,
      distributablePaisa: 8456900,
      balanced: true,
      shares: [
        { name: "Nasrin", units: 40 },
        { name: "Rayhan", units: 25 },
        { name: "Tanvir", units: 15 },
        { name: "Farzana", units: 10 },
        { name: "Sabrina", units: 10 },
      ],
      rounding: "largest-remainder",
    });
    expect(d.reserve).toMatchObject({ rule: { mode: "PERCENT", percentBp: 500 }, overridePaisa: null, balancePaisa: 0 });
    expect(d.months).toEqual([
      { key: "2026-10", status: "OPEN" },
      { key: "2026-09", status: "CLOSED" },
    ]);
    expect(d.paidAfterClose).toBeNull();
  });

  it("defaults to the oldest open month and points at the month to close first", async () => {
    const w = await distributionWorld();
    await createPeriod(w.property.id, "2026-11");
    expect((await boardData(w.ownerLogin)).month.key).toBe("2026-10");
    expect((await boardData(w.ownerLogin, "2026-11")).month.mustCloseFirst).toBe("2026-10");
  });

  it("carries the deficit of an open previous month and excludes voided and reserve-paid entries", async () => {
    const w = await distributionWorld();
    const nov = await createPeriod(w.property.id, "2026-11");
    const base = { propertyId: w.property.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, periodId: w.oct.id, categoryId: w.categories.REPAIR.id, amountPaisa: 10000000 }); // Oct net −1098000
    await createTxn({ ...base, periodId: w.oct.id, categoryId: w.categories.REPAIR.id, amountPaisa: 300000, fromReserve: true });
    await createTxn({ ...base, periodId: w.oct.id, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, amountPaisa: 100000, voided: "Typo" });
    await createTxn({ ...base, periodId: nov.id, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, amountPaisa: 2000000 });
    const oct = await boardData(w.ownerLogin, "2026-10");
    expect(oct.staircase).toMatchObject({ incomePaisa: 10300000, expensePaisa: 11398000, reserveSpentPaisa: 300000, reservePaisa: 0, distributablePaisa: 0, deficitCarriedPaisa: 1098000 });
    expect(oct.rows.every((r: { entitlementPaisa: number }) => r.entitlementPaisa === 0)).toBe(true);
    const nov2 = await boardData(w.ownerLogin, "2026-11");
    // Nov surplus 2000000 → reserve 100000 → 1900000 − 1098000.
    expect(nov2.staircase).toMatchObject({ previousDeficitPaisa: 1098000, previousDeficitMonth: "2026-10", reservePaisa: 100000, distributablePaisa: 802000 });
  });

  it("lists a 0-unit owner who had activity and cancels a same-month void pair", async () => {
    const w = await distributionWorld();
    const former = await prisma.owner.create({ data: { propertyId: w.property.id, displayName: "Kamal Former", initials: "KF", sortOrder: 9 } });
    await w.entry(former.id, "PAYOUT", -200000, { fundAccountId: w.cash.id });
    const p = await w.entry(w.owners.farzana.id, "PAYOUT", -500000, { fundAccountId: w.cash.id, voided: "Wrong owner" });
    await w.entry(w.owners.farzana.id, "REVERSAL", 500000, { fundAccountId: w.cash.id, reversesId: p.id });
    const r = byName((await boardData(w.adminLogin, "2026-10")).rows);
    expect(r.kamal).toMatchObject({ units: 0, sharePercent: null, entitlementPaisa: 0, receivedPaisa: 200000 });
    expect(r.farzana).toMatchObject({ receivedPaisa: 0, otherPaisa: 870390 });
  });

  it("keeps a closed month's snapshot after the rule and shares change (G11)", async () => {
    const w = await distributionWorld();
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    await setReserveRule(w.property.id, { mode: "OFF" });
    await prisma.shareSetItem.updateMany({ where: { shareSetId: w.sets.jun.id, ownerId: w.owners.nasrin.id }, data: { units: 90 } });
    const d = await boardData(w.ownerLogin, "2026-10");
    expect(d.month).toMatchObject({ status: "CLOSED", closedBy: "Rayhan Ahmed", isLatestClosed: true });
    expect(d.staircase).toMatchObject({ reservePaisa: 445100, distributablePaisa: 8456900 });
    expect(d.reserve.rule).toEqual({ mode: "PERCENT", percentBp: 500 });
    expect(d.footer.shares[0]).toEqual({ name: "Nasrin", units: 40 });
    expect(byName(d.rows).nasrin).toMatchObject({ entitlementPaisa: 3382760, balancePaisa: 2882760, afterClosePaisa: null });
    expect(d.footer.balanced).toBe(true);
  });

  it("reads a month closed before Distribution existed from its posted rows", async () => {
    const w = await distributionWorld();
    const d = await boardData(w.ownerLogin, "2026-09");
    expect(d.month).toMatchObject({ status: "CLOSED", closedBy: null });
    expect(d.totals.entitlementPaisa).toBe(0);
    expect(d.footer.sumEntitlementsPaisa).toBe(0);
    // Tanvir's instalment would be "skipped" in a live preview, but no close ever ran for this month.
    expect(d.skippedLoans).toEqual([]);
  });

  it("lists payouts recorded after the latest close for the reopen warning", async () => {
    const w = await distributionWorld();
    await postClose(w.adminLogin, "2026-10");
    vi.setSystemTime(new Date("2026-10-20T06:00:01Z")); // just after the close
    const nov = await prisma.period.findFirstOrThrow({ where: { propertyId: w.property.id, month: new Date("2026-11-01T00:00:00Z") } });
    await w.entry(w.owners.farzana.id, "PAYOUT", -845690, { fundAccountId: w.cash.id, periodId: nov.id, entryDate: "2026-11-02" });
    const d = await boardData(w.adminLogin, "2026-10");
    expect(d.paidAfterClose).toEqual({ items: [{ ownerId: w.owners.farzana.id, displayName: "Farzana Haque", type: "PAYOUT", amountPaisa: 845690, date: "2026-11-02" }], totalPaisa: 845690 });
  });

  it("answers 401, 404, 422 and an empty house", async () => {
    const w = await distributionWorld();
    expect((await readBoard(null as never)).status).toBe(401);
    expect((await readBoard(w.ownerLogin, "2019-01")).status).toBe(404);
    expect((await readBoard(w.ownerLogin, "2026-13")).status).toBe(422);
    await prisma.$executeRawUnsafe(`UPDATE properties SET created_at = now() + interval '1 day' WHERE id = '${w.property.id}'`);
    await createProperty();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const res = await (await import("@/app/api/v1/distribution/route")).GET(apiRequest("/distribution", { login: await loginAs(admin) }), { params: Promise.resolve({}) });
    expect((await json(res)).data).toEqual({ month: null });
  });
});

describe("closeReminder (F14 P1)", () => {
  it("names the earlier open month and its unpaid units; nothing while only the current month is open", async () => {
    const w = await distributionWorld();
    expect(await closeReminder(w.property.id)).toBeNull(); // clock: 20 Oct, October is current
    vi.setSystemTime(new Date("2026-11-03T03:00:00Z"));
    expect(await closeReminder(w.property.id)).toEqual({ month: "2026-10", unpaid: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }] });
  });
});
