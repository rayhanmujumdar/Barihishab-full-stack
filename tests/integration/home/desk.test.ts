// Home read model — Bookkeeper's desk (Home PRD F5, G8, G9, Rule 8, Rule 10; main PRD §5.7).
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deskFigures } from "@/lib/home/desk";
import { listRequests } from "@/lib/requests/request-read";
import { prisma } from "@/lib/prisma";
import { createFund, createMoneyRequest, createUser } from "../../helpers/factory";
import { distributionWorld } from "../../helpers/distribution";
import { createLoanApi } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const inviteToken = (userId: string, expiresAt: Date, createdAt: Date) =>
  prisma.authToken.create({ data: { userId, type: "INVITE", tokenHash: randomBytes(32).toString("hex"), expiresAt, createdAt } });

describe("deskFigures — House fund (F5, PAY-04)", () => {
  it("totals only the active accounts", async () => {
    const w = await distributionWorld();
    await createFund(w.property.id, { name: "Old bKash", type: "WALLET", isActive: false });
    const d = await deskFigures(w.property.id);
    expect(d.fund.accounts.map((a) => a.name)).toEqual(["Cash — with Rayhan", "DBBL savings ·· 4471"]);
    // Cash: +1,03,000 income − 13,980 expenses − 5,000 advance − 35,000 loan.
    expect(d.fund.accounts[0].balancePaisa).toBe(4902000);
    expect(d.fund.totalPaisa).toBe(4902000);
  });
});

describe("deskFigures — Reconciliation (§5.7, G8)", () => {
  it("lists each part and flags owner openings that have no cash behind them", async () => {
    const w = await distributionWorld();
    const r = (await deskFigures(w.property.id)).reconciliation;
    expect(r.parts).toEqual({
      fundPaisa: 4902000,
      ownerBalancesPaisa: 805585 + 870390 - 500000,
      reservePaisa: 0,
      openNetPaisa: 10300000 - 1398000,
      deficitCarriedPaisa: 0,
      loansOutstandingPaisa: 3500000,
    });
    expect(r).toMatchObject({ status: "CHECK", mismatchPaisa: -(805585 + 870390) });
  });

  it("is BALANCED once the fund opening covers them, and stays balanced after a loan", async () => {
    const w = await distributionWorld();
    await prisma.fundAccount.update({ where: { id: w.cash.id }, data: { openingBalancePaisa: BigInt(805585 + 870390) } });
    expect((await deskFigures(w.property.id)).reconciliation).toMatchObject({ status: "BALANCED", mismatchPaisa: 0 });
    const res = await createLoanApi(w.adminLogin, {
      ownerId: w.owners.farzana.id,
      amountPaisa: 1000000,
      date: "2026-10-15",
      fundAccountId: w.cash.id,
      method: "CASH",
      referenceNo: null,
      reason: "Roof repair at her flat",
    });
    expect(res.status).toBe(201);
    expect((await deskFigures(w.property.id)).reconciliation).toMatchObject({ status: "BALANCED", parts: { loansOutstandingPaisa: 4500000 } });
  });

  it("counts expenses paid from the reserve against the reserve, not the open month", async () => {
    const w = await distributionWorld();
    await prisma.fundAccount.update({ where: { id: w.cash.id }, data: { openingBalancePaisa: BigInt(805585 + 870390 + 300000) } });
    await prisma.property.update({ where: { id: w.property.id }, data: { settings: { reserve: { mode: "PERCENT", percentBp: 500, startingPaisa: 300000 } } } });
    await prisma.houseTransaction.create({
      data: { propertyId: w.property.id, periodId: w.oct.id, kind: "EXPENSE", categoryId: w.categories.REPAIR.id, fundAccountId: w.cash.id, createdById: w.admin.id, amountPaisa: BigInt(100000), txnDate: new Date("2026-10-15T00:00:00Z"), fromReserve: true },
    });
    const r = (await deskFigures(w.property.id)).reconciliation;
    expect(r.parts).toMatchObject({ reservePaisa: 200000, openNetPaisa: 8902000 });
    expect(r.status).toBe("BALANCED");
  });
});

describe("deskFigures — counts (F5, G9, Rule 10)", () => {
  it("counts pending requests like the decision queue, and those waiting over 3 days", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id };
    await createMoneyRequest({ ...base, createdAt: new Date("2026-10-14T06:00:00Z") });
    await createMoneyRequest({ ...base, createdAt: new Date("2026-10-19T06:00:00Z") });
    await createMoneyRequest({ ...base, status: "APPROVED" });
    const d = await deskFigures(w.property.id);
    const queue = await listRequests(w.property.id, { userId: w.admin.id, viewAll: true });
    expect(d.pending).toEqual({ count: 2, over3Days: 1 });
    expect(queue.scope === "all" && queue.pending.length).toBe(d.pending.count);
  });

  it("counts invites waiting and the expired ones", async () => {
    const w = await distributionWorld(); // Sabrina is INVITED (no link yet).
    const other = await createUser({ roles: ["OWNER"], status: "INVITED", password: null });
    await inviteToken(other.id, new Date("2026-10-23T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));
    await inviteToken(w.invited.id, new Date("2026-10-19T00:00:00Z"), new Date("2026-10-16T00:00:00Z"));
    expect((await deskFigures(w.property.id)).invites).toEqual({ waiting: 2, expired: 1 });
    // A fresh link replaces the expired one.
    await inviteToken(w.invited.id, new Date("2026-10-23T00:00:00Z"), new Date("2026-10-20T00:00:00Z"));
    expect((await deskFigures(w.property.id)).invites).toEqual({ waiting: 2, expired: 0 });
  });

  it("counts Open + In review complaints of every visibility (Notices & Complaints §13)", async () => {
    const w = await distributionWorld();
    expect((await deskFigures(w.property.id)).openComplaints).toBe(0);
    const base = { propertyId: w.property.id, title: "Bill", body: "Looks high to me.", createdById: w.owner.id };
    await prisma.complaint.create({ data: { ...base, status: "OPEN" } });
    await prisma.complaint.create({ data: { ...base, status: "IN_REVIEW", visibility: "ADMIN" } });
    await prisma.complaint.create({ data: { ...base, status: "RESOLVED" } });
    expect((await deskFigures(w.property.id)).openComplaints).toBe(2);
  });
});
