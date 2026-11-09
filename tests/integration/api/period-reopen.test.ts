import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as preview from "@/app/api/v1/periods/[month]/close-preview/route";
import { prisma } from "@/lib/prisma";
import { createTxn } from "../../helpers/factory";
import { boardData, byName, distributionWorld, postClose, postReopen } from "../../helpers/distribution";
import { apiRequest, json, params } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const balances = async (ids: string[]) =>
  Object.fromEntries(
    await Promise.all(ids.map(async (id) => [id, Number((await prisma.ownerLedgerEntry.aggregate({ where: { ownerId: id }, _sum: { amountPaisa: true } }))._sum.amountPaisa ?? 0)])),
  );

describe("POST /api/v1/periods/:month/reopen (F7, DST-04)", () => {
  it("reverses entitlements and deductions, keeps originals visible, reactivates a repaid loan and records the reason", async () => {
    const w = await distributionWorld();
    await prisma.loan.update({ where: { id: w.loan.id }, data: { principalPaisa: BigInt(150000) } }); // the close pays it off
    const ids = Object.values(w.owners).map((o) => o.id);
    const before = await balances(ids);
    await postClose(w.adminLogin, "2026-10");
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: w.loan.id } })).status).toBe("REPAID");

    const res = await postReopen(w.adminLogin, "2026-10");
    expect(res.status).toBe(200);
    const board = (await json(res)).data;
    expect(board.month).toMatchObject({ status: "OPEN", reopenCount: 1 });
    expect(board.reopens).toEqual([{ at: expect.any(String), by: "Rayhan Ahmed", reason: "Plumber bill was missed" }]);

    const closeRows = await prisma.ownerLedgerEntry.findMany({ where: { periodId: w.oct.id, type: { in: ["ENTITLEMENT", "LOAN_DEDUCTION"] } } });
    expect(closeRows).toHaveLength(6);
    expect(closeRows.every((e) => e.voidedAt !== null && e.voidReason === "Plumber bill was missed")).toBe(true);
    const reversals = await prisma.ownerLedgerEntry.findMany({ where: { type: "REVERSAL", reversesId: { in: closeRows.map((e) => e.id) } } });
    expect(reversals).toHaveLength(6);
    expect(reversals.find((r) => r.loanId === w.loan.id)?.amountPaisa).toBe(BigInt(150000));

    expect(await balances(ids)).toEqual(before);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: w.loan.id } })).status).toBe("ACTIVE");
    const history = await prisma.periodReopen.findFirstOrThrow({ where: { periodId: w.oct.id } });
    expect(history.snapshotBefore).toMatchObject({ distributablePaisa: 8456900 });
    expect(await prisma.auditLog.count({ where: { action: "period.reopened", entityId: w.oct.id, reason: "Plumber bill was missed" } })).toBe(1);
    // The reopened month's board nets the voided pairs out.
    expect(byName(board.rows).tanvir).toMatchObject({ entitlementPaisa: 1268535, receivedPaisa: 0, otherPaisa: 805585 });
  });

  it("only reopens the latest closed month, needs a reason and an admin", async () => {
    const w = await distributionWorld();
    await postClose(w.adminLogin, "2026-10");
    const older = await postReopen(w.adminLogin, "2026-09");
    expect(older.status).toBe(409);
    expect((await json(older)).error.code).toBe("REOPEN_NOT_ALLOWED");
    expect((await postReopen(w.adminLogin, "2026-11")).status).toBe(409); // open month
    const blank = await postReopen(w.adminLogin, "2026-10", "  ");
    expect(blank.status).toBe(422);
    expect((await json(blank)).error.details.fields.reason).toBe("Please write a reason — everyone can see it.");
    expect((await postReopen(w.ownerLogin, "2026-10")).status).toBe(403);
    expect((await prisma.period.findUniqueOrThrow({ where: { id: w.oct.id } })).status).toBe("CLOSED");
  });

  it("keeps payouts made after the close", async () => {
    const w = await distributionWorld();
    await postClose(w.adminLogin, "2026-10");
    const nov = await prisma.period.findFirstOrThrow({ where: { propertyId: w.property.id, month: new Date("2026-11-01T00:00:00Z") } });
    const payout = await w.entry(w.owners.farzana.id, "PAYOUT", -1716080, { fundAccountId: w.cash.id, periodId: nov.id });
    await postReopen(w.adminLogin, "2026-10");
    expect((await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: payout.id } })).voidedAt).toBeNull();
    expect((await balances([w.owners.farzana.id]))[w.owners.farzana.id]).toBe(870390 - 1716080);
  });
});

describe("close and reopen run one at a time per house (Rules 1, 3, 5)", () => {
  it("never leaves an earlier month open behind a closed later month", async () => {
    const w = await distributionWorld();
    await postClose(w.adminLogin, "2026-10"); // November opens
    const [close, reopen] = await Promise.all([postClose(w.adminLogin, "2026-11"), postReopen(w.adminLogin, "2026-10")]);
    expect([close.status, reopen.status].filter((s) => s === 200)).toHaveLength(1);
    const status = async (m: string) => (await prisma.period.findFirstOrThrow({ where: { propertyId: w.property.id, month: new Date(`${m}-01T00:00:00Z`) } })).status;
    const [oct, nov] = [await status("2026-10"), await status("2026-11")];
    expect(oct === "OPEN" && nov === "CLOSED").toBe(false);
    // Whoever lost was refused with the matching rule.
    const lost = await json(close.status === 200 ? reopen : close);
    expect(["PREVIOUS_MONTH_OPEN", "REOPEN_NOT_ALLOWED"]).toContain(lost.error.code);
  });
});

describe("re-close before → after (F8, G6)", () => {
  it("shows the §6.3 changes in the preview and on the closed record", async () => {
    const w = await distributionWorld();
    await postClose(w.adminLogin, "2026-10");
    await postReopen(w.adminLogin, "2026-10");
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, categoryId: w.categories.REPAIR.id, amountPaisa: 500000 });

    const p = (await json(await preview.GET(apiRequest("/periods/2026-10/close-preview", { login: w.adminLogin }), params({ month: "2026-10" })))).data;
    expect(p.reopenCount).toBe(1);
    expect(p.changes.lines).toEqual([
      { key: "expensePaisa", beforePaisa: 1398000, afterPaisa: 1898000, diffPaisa: 500000 },
      { key: "reservePaisa", beforePaisa: 445100, afterPaisa: 420100, diffPaisa: -25000 },
      { key: "distributablePaisa", beforePaisa: 8456900, afterPaisa: 7981900, diffPaisa: -475000 },
    ]);
    const nasrin = p.changes.owners.find((o: { displayName: string }) => o.displayName === "Nasrin Ahmed");
    expect(nasrin).toEqual({ ownerId: w.owners.nasrin.id, displayName: "Nasrin Ahmed", beforePaisa: 3382760, afterPaisa: 3192760, diffPaisa: -190000 });

    expect((await postClose(w.adminLogin, "2026-10", 0)).status).toBe(409); // stale version
    const res = await postClose(w.adminLogin, "2026-10", 1);
    expect(res.status).toBe(200);
    const closed = await boardData(w.ownerLogin, "2026-10");
    expect(closed.month).toMatchObject({ status: "CLOSED", reopenCount: 1 });
    expect(closed.reopens).toHaveLength(1);
    expect(closed.changes.lines.map((l: { key: string }) => l.key)).toEqual(["expensePaisa", "reservePaisa", "distributablePaisa"]);
    expect(byName(closed.rows).nasrin).toMatchObject({ entitlementPaisa: 3192760 });
    expect(closed.footer).toMatchObject({ sumEntitlementsPaisa: 7981900, balanced: true });
  });
});
