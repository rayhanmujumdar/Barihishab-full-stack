import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as voidRoute from "@/app/api/v1/ledger/[id]/void/route";
import { balanceOf } from "@/lib/master-data/fund-service";
import { prisma } from "@/lib/prisma";
import { createPeriod, setPeriodStatus } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

const auditControl = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...mod,
    audit: (...args: Parameters<typeof mod.audit>) => (auditControl.fail ? Promise.reject(new Error("audit down")) : mod.audit(...args)),
  };
});

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const doVoid = (login: Login, id: string, reason = "Recorded for the wrong owner") =>
  voidRoute.POST(apiRequest(`/ledger/${id}/void`, { login, body: { reason } }), params({ id }));
const balance = async (ownerId: string) => Number((await prisma.ownerLedgerEntry.aggregate({ where: { ownerId }, _sum: { amountPaisa: true } }))._sum.amountPaisa ?? 0);

async function world() {
  const w = await ownersWorld();
  const payout = await w.entry(w.owners.farzana.id, "PAYOUT", -500000, { fundAccountId: w.cash.id });
  return { ...w, payout };
}

describe("POST /api/v1/ledger/:id/void (F13)", () => {
  it("posts a reversal in the latest open month and restores balance and fund", async () => {
    const w = await world();
    const cashBefore = await balanceOf(prisma, w.property.id, w.cash.id);
    const res = await doVoid(w.adminLogin, w.payout.id);
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.entry).toMatchObject({ id: w.payout.id, voided: true, voidReason: "Recorded for the wrong owner" });
    expect(data.reversal).toMatchObject({ type: "REVERSAL", amountPaisa: 500000, reversesId: w.payout.id, fundAccountId: w.cash.id, month: "2026-10", date: "2026-10-20" });
    expect(data.balancePaisa).toBe(870390);
    expect(await balance(w.owners.farzana.id)).toBe(870390);
    expect(await balanceOf(prisma, w.property.id, w.cash.id)).toBe(cashBefore + 500000);
    expect(await prisma.auditLog.findFirst({ where: { action: "ledger.voided", entityId: w.payout.id } })).toMatchObject({ reason: "Recorded for the wrong owner" });
  });

  it("voids an original whose month is now closed, posting in the open month", async () => {
    const w = await world();
    const nov = await createPeriod(w.property.id, "2026-11");
    await setPeriodStatus(w.oct.id, "CLOSED");
    const { data } = await json(await doVoid(w.adminLogin, w.payout.id));
    expect(data.reversal.month).toBe("2026-11");
    expect(nov.id).toBeTruthy();
  });

  it("refuses twice, non-voidable types and blank reasons", async () => {
    const w = await world();
    await doVoid(w.adminLogin, w.payout.id);
    expect((await json(await doVoid(w.adminLogin, w.payout.id))).error.code).toBe("ALREADY_VOIDED");
    const ent = await w.entry(w.owners.farzana.id, "ENTITLEMENT", 100);
    expect((await json(await doVoid(w.adminLogin, ent.id))).error.code).toBe("NOT_VOIDABLE");
    const opening = await prisma.ownerLedgerEntry.findFirstOrThrow({ where: { ownerId: w.owners.tanvir.id, type: "OPENING" } });
    expect((await json(await doVoid(w.adminLogin, opening.id))).error.code).toBe("NOT_VOIDABLE");
    const rev = await prisma.ownerLedgerEntry.findFirstOrThrow({ where: { type: "REVERSAL" } });
    expect((await json(await doVoid(w.adminLogin, rev.id))).error.code).toBe("NOT_VOIDABLE");
    const adv = await prisma.ownerLedgerEntry.findFirstOrThrow({ where: { type: "ADVANCE" } });
    const blank = await doVoid(w.adminLogin, adv.id, "  ");
    expect(blank.status).toBe(422);
    expect((await json(blank)).error.details.fields.reason).toBe("Please write a reason — everyone can see it.");
  });

  it("needs an open month, 404s unknown ids and is admin-only", async () => {
    const w = await world();
    expect((await doVoid(w.ownerLogin, w.payout.id)).status).toBe(403);
    expect((await doVoid(w.adminLogin, "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b")).status).toBe(404);
    expect((await doVoid(w.adminLogin, "bad")).status).toBe(404);
    await setPeriodStatus(w.oct.id, "CLOSED");
    expect((await json(await doVoid(w.adminLogin, w.payout.id))).error.code).toBe("NO_OPEN_PERIOD");
  });

  it("produces one reversal when two voids race", async () => {
    const w = await world();
    const res = await Promise.all([doVoid(w.adminLogin, w.payout.id), doVoid(w.adminLogin, w.payout.id)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.ownerLedgerEntry.count({ where: { reversesId: w.payout.id } })).toBe(1);
  });

  it("rolls back when the audit insert fails", async () => {
    const w = await world();
    auditControl.fail = true;
    try {
      expect((await doVoid(w.adminLogin, w.payout.id)).status).toBe(500);
    } finally {
      auditControl.fail = false;
    }
    expect(await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: w.payout.id } })).toMatchObject({ voidedAt: null });
    expect(await prisma.ownerLedgerEntry.count({ where: { reversesId: w.payout.id } })).toBe(0);
  });
});

