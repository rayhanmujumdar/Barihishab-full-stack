// Home read model — current month and personal figures (Home PRD F2–F4, F12, Rule 1–3).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDistribution } from "@/lib/distribution/distribution-service";
import { buildSnapshot, computeMonth, loadOwners, loadPeriods } from "@/lib/distribution/month-data";
import { houseThisMonth } from "@/lib/home/dashboard";
import { homeMonth } from "@/lib/home/month";
import { meFigures, myRequest } from "@/lib/home/me";
import { prisma } from "@/lib/prisma";
import { createLedgerEntry, createMoneyRequest, createPeriod, createProperty, createUser } from "../../helpers/factory";
import { byName, distributionWorld } from "../../helpers/distribution";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("homeMonth (Rule 1, G1)", () => {
  it("is the latest open month with the house name", async () => {
    const w = await distributionWorld();
    await prisma.property.update({ where: { id: w.property.id }, data: { name: "Ahmed Villa" } });
    const m = await homeMonth(w.property.id);
    expect(m.houseName).toBe("Ahmed Villa");
    expect(m.month).toEqual({ key: "2026-10", open: true, firstMonth: false });
  });

  it("falls back to the latest closed month when none is open", async () => {
    const w = await distributionWorld();
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    expect((await homeMonth(w.property.id)).month).toMatchObject({ key: "2026-10", open: false });
  });

  it("is null without periods and flags the first month", async () => {
    const p = await createProperty();
    expect((await homeMonth(p.id)).month).toBeNull();
    await createPeriod(p.id, "2026-10");
    expect((await homeMonth(p.id)).month).toEqual({ key: "2026-10", open: true, firstMonth: true });
  });

  it("returns the staircase Distribution shows for the month", async () => {
    const w = await distributionWorld();
    const m = await homeMonth(w.property.id);
    expect(m.staircase).toMatchObject({ incomePaisa: 10300000, expensePaisa: 1398000, reservePaisa: 445100, previousDeficitPaisa: 0, distributablePaisa: 8456900 });
  });
});

describe("meFigures (F2, F3, G3, G14)", () => {
  it("matches the Distribution row for Nasrin (PRD §9)", async () => {
    const w = await distributionWorld();
    await w.entry(w.owners.nasrin.id, "PAYOUT", -3481560, { fundAccountId: w.cash.id, entryDate: "2026-10-05" });
    const me = await meFigures(w.property.id, w.owner.id);
    const board = await getDistribution(w.property.id, "2026-10", w.owner.id);
    const row = byName(board && board.month ? board.rows : []).nasrin;
    expect(me).toMatchObject({
      ownerId: w.owners.nasrin.id,
      balancePaisa: row.balancePaisa,
      balanceLabel: "ADVANCE",
      sharePercent: 40,
      entitlementPreviewPaisa: 3382760,
      receivedPaisa: 3481560,
      advancesPaisa: 500000,
      loanOutstandingPaisa: 0,
      loan: null,
    });
    expect(me!.balancePaisa).toBe(-500000 - 3481560);
  });

  it("is null for a user with no owner record", async () => {
    const w = await distributionWorld();
    const stranger = await createUser({ roles: ["SUPER_ADMIN"] });
    expect(await meFigures(w.property.id, stranger.id)).toBeNull();
  });

  it("excludes a voided payout and its reversal", async () => {
    const w = await distributionWorld();
    const p = await w.entry(w.owners.nasrin.id, "PAYOUT", -1000000, { fundAccountId: w.cash.id, voided: "Wrong amount" });
    await w.entry(w.owners.nasrin.id, "REVERSAL", 1000000, { fundAccountId: w.cash.id, reversesId: p.id });
    const me = await meFigures(w.property.id, w.owner.id);
    expect(me).toMatchObject({ receivedPaisa: 0, balancePaisa: -500000 });
  });

  it("shows Tanvir's loan line with the next deduction", async () => {
    const w = await distributionWorld();
    const user = await createUser({ roles: ["OWNER"], firstName: "Tanvir" });
    await prisma.owner.update({ where: { id: w.owners.tanvir.id }, data: { userId: user.id } });
    const me = await meFigures(w.property.id, user.id);
    expect(me).toMatchObject({ loanOutstandingPaisa: 3500000, balanceLabel: "OWED", sharePercent: 15 });
    expect(me!.loan).toEqual({ number: w.loan.number, outstandingPaisa: 3500000, nextDeductionPaisa: 500000, nextDeductionMonth: "2026-10" });
  });

  it("has no entitlement preview without a share or once the month is closed", async () => {
    const w = await distributionWorld();
    const user = await createUser({ roles: ["OWNER"] });
    const p = w.property.id;
    const kamal = await prisma.owner.create({ data: { propertyId: p, userId: user.id, displayName: "Kamal", initials: "KA", sortOrder: 9 } });
    await createLedgerEntry({ propertyId: p, ownerId: kamal.id, periodId: w.oct.id, createdById: w.admin.id, type: "OPENING", amountPaisa: 1000 });
    expect(await meFigures(p, user.id)).toMatchObject({ sharePercent: null, entitlementPreviewPaisa: null, balancePaisa: 1000, balanceLabel: "OWED" });
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    expect((await meFigures(p, w.owner.id))!.entitlementPreviewPaisa).toBeNull();
  });
});

describe("a closed month read from its snapshot (Rule 1, F12)", () => {
  it("keeps the month's shares and ledger rows, drops the preview and hides the staircase", async () => {
    const w = await distributionWorld();
    const p = w.property.id;
    const periods = await loadPeriods(prisma, p);
    const f = await computeMonth(prisma, p, periods, periods.findIndex((x) => x.key === "2026-10"), await loadOwners(prisma, p));
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED", snapshot: buildSnapshot(f, null) } });
    const m = await homeMonth(p);
    expect(m.month).toEqual({ key: "2026-10", open: false, firstMonth: false });
    expect(m.ctx?.snap).not.toBeNull();
    expect(m.staircase?.distributablePaisa).toBe(8456900);
    expect(await meFigures(p, w.owner.id, m)).toMatchObject({ sharePercent: 40, entitlementPreviewPaisa: null, advancesPaisa: 500000, receivedPaisa: 0, balancePaisa: -500000 });
    expect(await houseThisMonth(p, m)).toBeNull();
  });
});

describe("myRequest (F4)", () => {
  it("is the newest pending or approved request", async () => {
    const w = await distributionWorld();
    const base = { propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id };
    await createMoneyRequest({ ...base, amountPaisa: 200000, status: "DISBURSED", createdAt: new Date("2026-10-01T00:00:00Z") });
    const r = await createMoneyRequest({ ...base, amountPaisa: 1000000, status: "PENDING", createdAt: new Date("2026-10-18T00:00:00Z") });
    expect(await myRequest(w.property.id, w.owners.nasrin.id)).toEqual({
      id: r.id,
      type: "ADVANCE",
      status: "PENDING",
      amountRequestedPaisa: 1000000,
      amountApprovedPaisa: null,
      once: false,
    });
  });

  it("shows an unseen rejection once, then nothing", async () => {
    const w = await distributionWorld();
    const r = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id, status: "REJECTED" });
    await prisma.moneyRequest.update({ where: { id: r.id }, data: { decisionUnseen: true } });
    expect(await myRequest(w.property.id, w.owners.nasrin.id)).toMatchObject({ id: r.id, status: "REJECTED", once: true });
    await prisma.moneyRequest.update({ where: { id: r.id }, data: { decisionUnseen: false } });
    expect(await myRequest(w.property.id, w.owners.nasrin.id)).toBeNull();
  });

  it("ignores other owners' requests", async () => {
    const w = await distributionWorld();
    await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.farzana.id, createdById: w.admin.id, status: "PENDING" });
    expect(await myRequest(w.property.id, w.owners.nasrin.id)).toBeNull();
  });
});
