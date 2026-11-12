import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as preview from "@/app/api/v1/periods/[month]/close-preview/route";
import * as fundsRoute from "@/app/api/v1/fund-accounts/route";
import * as openingRoute from "@/app/api/v1/owners/[id]/opening/route";
import { POST as createTxnRoute } from "@/app/api/v1/transactions/route";
import { prisma } from "@/lib/prisma";
import { createLoan, createLoanMovement, createPeriod, createShareSet, createTxn } from "../../helpers/factory";
import { boardData, byName, distributionWorld, postClose, type DistWorld } from "../../helpers/distribution";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const getPreview = (login: Login, month: string) => preview.GET(apiRequest(`/periods/${month}/close-preview`, { login }), params({ month }));
const entitlements = (periodId: string) => prisma.ownerLedgerEntry.findMany({ where: { periodId, type: "ENTITLEMENT", voidedAt: null } });
const cashBalance = async (w: DistWorld) => {
  const body = await json(await fundsRoute.GET(apiRequest("/fund-accounts", { login: w.adminLogin }), params({})));
  return body.data.items.find((f: { id: string }) => f.id === w.cash.id).balancePaisa as number;
};

describe("GET /api/v1/periods/:month/close-preview (F5, G1, G2, DST-02)", () => {
  it("passes the must-pass checks for October and warns about Flat 3A, bills and the month not being over", async () => {
    const w = await distributionWorld();
    await prisma.attachment.create({
      data: { propertyId: w.property.id, storageKey: "bill", fileName: "bill.png", mime: "image/png", sizeBytes: 10, uploadedById: w.admin.id, entityId: w.txns.elec.id, linkedAt: new Date() },
    });
    const d = (await json(await getPreview(w.adminLogin, "2026-10"))).data;
    expect(d.canClose).toBe(true);
    expect(d.reopenCount).toBe(0);
    expect(d.mustPass.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(d.warnings).toEqual([
      { code: "UNPAID_RENT", units: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }] },
      { code: "MISSING_BILLS", count: 1 },
      { code: "MONTH_NOT_OVER", nextMonth: "2026-11" },
    ]);
    expect(d.whatHappens).toEqual({
      entitlementCount: 5,
      entitlementTotalPaisa: 8456900,
      ownerCount: 5,
      deductions: [{ ownerId: w.owners.tanvir.id, displayName: "Tanvir Ahmed", amountPaisa: 500000 }],
      skipped: [],
      nextMonthOpens: "2026-11",
    });
    expect(d.changes).toBeNull();
  });

  it("warns, never blocks, about open complaints on the month (Notices & Complaints C8, Rule 15)", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, title: "Bill looks high", body: "Was the reading checked?", createdById: w.owner.id, linkType: "ENTRY" as const, linkId: w.txns.elec.id, periodId: w.oct.id };
    await prisma.complaint.create({ data: { ...base, status: "IN_REVIEW", visibility: "ADMIN" } });
    await prisma.complaint.create({ data: { ...base, status: "RESOLVED" } });
    const d = (await json(await getPreview(w.adminLogin, "2026-10"))).data;
    expect(d.warnings).toContainEqual({ code: "OPEN_COMPLAINTS", count: 1 });
    expect(d.canClose).toBe(true);
  });

  it("fails the shares check without shares, warns about no income, skipped instalments and a negative reserve", async () => {
    const w = await distributionWorld();
    const nov = await createPeriod(w.property.id, "2026-11");
    await createShareSet(w.property.id, w.admin.id, "2026-11", { [w.owners.nasrin.id]: 0 }, { reason: "Everyone sold" });
    await createTxn({ propertyId: w.property.id, periodId: nov.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.REPAIR.id, amountPaisa: 50000, fromReserve: true });
    const d = (await json(await getPreview(w.adminLogin, "2026-11"))).data;
    expect(d.canClose).toBe(false);
    expect(d.mustPass.filter((c: { ok: boolean }) => !c.ok).map((c: { code: string }) => c.code)).toEqual(["SHARES", "PREVIOUS_CLOSED"]);
    expect(d.mustPass.find((c: { code: string }) => c.code === "PREVIOUS_CLOSED").month).toBe("2026-10");
    expect(d.warnings.map((x: { code: string }) => x.code)).toEqual(["NO_INCOME", "UNPAID_RENT", "MISSING_BILLS", "MONTH_NOT_OVER", "RESERVE_NEGATIVE"]);
    expect(d.whatHappens.skipped).toEqual([{ ownerId: w.owners.tanvir.id, displayName: "Tanvir Ahmed" }]);
  });

  it("is refused to Owners and answers 404 / 422", async () => {
    const w = await distributionWorld();
    expect((await getPreview(w.ownerLogin, "2026-10")).status).toBe(403);
    expect((await getPreview(w.adminLogin, "2019-01")).status).toBe(404);
    expect((await getPreview(w.adminLogin, "10-2026")).status).toBe(422);
  });
});

describe("POST /api/v1/periods/:month/close (F5, F6, F11, DST-03)", () => {
  it("posts entitlements and the instalment, saves the snapshot, locks the month and opens the next", async () => {
    const w = await distributionWorld();
    const fundBefore = await cashBalance(w);
    const res = await postClose(w.adminLogin, "2026-10");
    expect(res.status).toBe(200);
    const board = (await json(res)).data;
    expect(board.month).toMatchObject({ key: "2026-10", status: "CLOSED", closedBy: "Rayhan Ahmed", isLatestClosed: true });

    const posted = await entitlements(w.oct.id);
    expect(posted).toHaveLength(5);
    expect(posted.reduce((s, e) => s + Number(e.amountPaisa), 0)).toBe(8456900);
    expect(posted.every((e) => e.entryDate.toISOString().slice(0, 10) === "2026-10-31")).toBe(true);
    const ded = await prisma.ownerLedgerEntry.findMany({ where: { periodId: w.oct.id, type: "LOAN_DEDUCTION" } });
    expect(ded.map((d) => [d.ownerId, Number(d.amountPaisa), d.loanId])).toEqual([[w.owners.tanvir.id, -500000, w.loan.id]]);

    const oct = await prisma.period.findUniqueOrThrow({ where: { id: w.oct.id } });
    expect(oct.status).toBe("CLOSED");
    expect(oct.snapshot).toMatchObject({ v: 1, incomePaisa: 10300000, reservePaisa: 445100, distributablePaisa: 8456900, deficitCarriedPaisa: 0 });
    expect(await prisma.period.findFirst({ where: { propertyId: w.property.id, month: new Date("2026-11-01T00:00:00Z"), status: "OPEN" } })).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "period.closed", entityId: w.oct.id } });
    expect(audit.after).toMatchObject({ month: "2026-10", distributablePaisa: 8456900 });

    const r = byName(board.rows);
    expect(r.tanvir).toMatchObject({ entitlementPaisa: 1268535, loanDeductionPaisa: 500000, balancePaisa: 1574120, loanOutstandingPaisa: 3000000 });
    expect(r.farzana).toMatchObject({ balancePaisa: 1716080, balanceLabel: "OWED" });
    expect(await cashBalance(w)).toBe(fundBefore); // entitlements and deductions move no cash
  });

  it("posts close entries with origin CLOSE and takes no instalment from a loan disbursed this month (Advances & Loans §7.3)", async () => {
    const w = await distributionWorld();
    const fresh = await createLoan({ propertyId: w.property.id, ownerId: w.owners.farzana.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 1000000, installmentPaisa: 200000, disbursedOn: "2026-10-05" });
    const p = (await json(await getPreview(w.adminLogin, "2026-10"))).data;
    expect(JSON.stringify(p)).not.toContain(fresh.id);
    await postClose(w.adminLogin, "2026-10");
    const posted = await prisma.ownerLedgerEntry.findMany({ where: { periodId: w.oct.id, type: { in: ["ENTITLEMENT", "LOAN_DEDUCTION"] } } });
    expect(posted.every((e) => e.origin === "CLOSE")).toBe(true);
    expect(posted.filter((e) => e.type === "LOAN_DEDUCTION").map((e) => e.loanId)).toEqual([w.loan.id]);
    expect(((await prisma.period.findUniqueOrThrow({ where: { id: w.oct.id } })).snapshot as { skippedLoans: unknown[] }).skippedLoans).toEqual([]);
  });

  it("caps the instalment at the outstanding left after a cash repayment", async () => {
    const w = await distributionWorld();
    await createLoanMovement({ propertyId: w.property.id, loanId: w.loan.id, periodId: w.oct.id, createdById: w.admin.id, fundAccountId: w.cash.id, type: "CASH_REPAYMENT", amountPaisa: -3300000 });
    await postClose(w.adminLogin, "2026-10");
    expect(await prisma.ownerLedgerEntry.findFirst({ where: { type: "LOAN_DEDUCTION", periodId: w.oct.id, amountPaisa: BigInt(-200000) } })).not.toBeNull();
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: w.loan.id } })).status).toBe("REPAID");
  });

  it("closes a zero-distributable month with no entitlements and records the deficit", async () => {
    const w = await distributionWorld();
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.REPAIR.id, amountPaisa: 13680000 });
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    expect(await entitlements(w.oct.id)).toHaveLength(0);
    expect(await prisma.ownerLedgerEntry.count({ where: { type: "LOAN_DEDUCTION" } })).toBe(0);
    expect((await prisma.period.findUniqueOrThrow({ where: { id: w.oct.id } })).snapshot).toMatchObject({ distributablePaisa: 0, deficitCarriedPaisa: 4778000 });
    expect((await boardData(w.ownerLogin, "2026-11")).staircase.previousDeficitPaisa).toBe(4778000);
  });

  it("marks a loan paid off by its last instalment REPAID without moving the fund", async () => {
    const w = await distributionWorld();
    await w.entry(w.owners.tanvir.id, "LOAN_DEDUCTION", -3350000, { loanId: w.loan.id });
    const fundBefore = await cashBalance(w);
    await postClose(w.adminLogin, "2026-10");
    expect(await prisma.ownerLedgerEntry.findFirst({ where: { type: "LOAN_DEDUCTION", periodId: w.oct.id, amountPaisa: BigInt(-150000) } })).not.toBeNull();
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: w.loan.id } })).status).toBe("REPAID");
    expect(await cashBalance(w)).toBe(fundBefore);
  });

  it("locks the month: no new expense, no opening change", async () => {
    const w = await distributionWorld();
    await postClose(w.adminLogin, "2026-10");
    const exp = await createTxnRoute(
      moneyPost("/transactions", w.adminLogin, { period: "2026-10", kind: "EXPENSE", categoryId: w.categories.ELEC.id, amountPaisa: 1000, txnDate: "2026-10-12", fundAccountId: w.cash.id }),
      params({}),
    );
    expect(exp.status).toBe(409);
    expect((await json(exp)).error.code).toBe("PERIOD_CLOSED");
    const opening = await openingRoute.PUT(apiRequest(`/owners/${w.owners.rayhan.id}/opening`, { method: "PUT", login: w.adminLogin, body: { amountPaisa: 100 } }), params({ id: w.owners.rayhan.id }));
    expect((await json(opening)).error.code).toBe("OPENING_LOCKED");
  });

  it("refuses an out-of-order close, a stale version, missing shares and Owners — writing nothing", async () => {
    const w = await distributionWorld();
    await createPeriod(w.property.id, "2026-11");
    const order = await postClose(w.adminLogin, "2026-11");
    expect(order.status).toBe(409);
    expect((await json(order)).error).toMatchObject({ code: "PREVIOUS_MONTH_OPEN", details: { month: "2026-10" } });
    const stale = await postClose(w.adminLogin, "2026-10", 3);
    expect((await json(stale)).error.code).toBe("PERIOD_CHANGED");
    expect((await postClose(w.ownerLogin, "2026-10")).status).toBe(403);
    expect((await postClose(w.adminLogin, "2019-01")).status).toBe(404);

    await createShareSet(w.property.id, w.admin.id, "2026-10", { [w.owners.nasrin.id]: 0 }, { reason: "Everyone sold" });
    const blocked = await postClose(w.adminLogin, "2026-10");
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).error).toMatchObject({ code: "CLOSE_BLOCKED", details: { failed: ["SHARES"] } });
    expect(await prisma.ownerLedgerEntry.count({ where: { type: "ENTITLEMENT" } })).toBe(0);
    expect((await prisma.period.findUniqueOrThrow({ where: { id: w.oct.id } })).status).toBe("OPEN");
  });

  it("two simultaneous closes produce one close and one clear refusal (G12)", async () => {
    const w = await distributionWorld();
    const [a, b] = await Promise.all([postClose(w.adminLogin, "2026-10"), postClose(w.adminLogin, "2026-10")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const refused = await json(a.status === 409 ? a : b);
    expect(refused.error).toMatchObject({ code: "PERIOD_ALREADY_CLOSED", details: { month: "2026-10", closedBy: "Rayhan Ahmed" } });
    expect(await entitlements(w.oct.id)).toHaveLength(5);
  });
});
