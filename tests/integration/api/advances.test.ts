import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as advances from "@/app/api/v1/advances/route";
import { prisma } from "@/lib/prisma";
import { createFund, createLedgerEntry, createPeriod, setPeriodStatus } from "../../helpers/factory";
import { json, params, type Login } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

/** Sample house plus a well-funded account (the sample Cash box is negative). */
async function world() {
  const w = await ownersWorld();
  return { ...w, house: await createFund(w.property.id, { name: "House cash", openingPaisa: 50000000 }) };
}
type World = Awaited<ReturnType<typeof world>>;
const advance = (login: Login, body: unknown) => advances.POST(moneyPost("/advances", login, body), params({}));
const body = (w: World, extra: Record<string, unknown> = {}) => ({
  ownerId: w.owners.nasrin.id,
  amountPaisa: 500000,
  date: "2026-10-12",
  fundAccountId: w.house.id,
  method: "CASH",
  reason: "Eye check-up",
  ...extra,
});

describe("POST /api/v1/advances (F12, ADV-01)", () => {
  it("records an advance with its reason", async () => {
    const w = await world();
    const res = await advance(w.adminLogin, body(w));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.entry).toMatchObject({ type: "ADVANCE", amountPaisa: -500000, note: "Eye check-up", isSelf: false, flagged: false });
    expect(data).toMatchObject({ balancePaisa: -1000000, warnings: [] });
    expect(await prisma.auditLog.count({ where: { action: "ledger.advance_created", entityId: data.entry.id } })).toBe(1);
  });

  it("requires a reason", async () => {
    const w = await world();
    const res = await advance(w.adminLogin, body(w, { reason: " " }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields.reason).toBeTruthy();
  });

  it("tags a Super Admin's advance to themself as Self", async () => {
    const w = await world();
    const { data } = await json(await advance(w.adminLogin, body(w, { ownerId: w.owners.rayhan.id })));
    expect(data.entry.isSelf).toBe(true);
  });

  it("flags an advance above the average of the last 3 closed months' entitlements", async () => {
    const w = await world();
    const base = { propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.admin.id, type: "ENTITLEMENT" as const, amountPaisa: 3000000 };
    for (const month of ["2026-06", "2026-07", "2026-08"]) {
      const p = await createPeriod(w.property.id, month);
      await createLedgerEntry({ ...base, periodId: p.id });
      await setPeriodStatus(p.id, "CLOSED");
    }
    // Sep (closed, 0 entitlement) is one of the last 3 → avg of 0, 3000000, 3000000.
    const { data } = await json(await advance(w.adminLogin, body(w, { amountPaisa: 2500000 })));
    expect(data.entry.flagged).toBe(true);
    expect(data.warnings).toEqual([{ code: "ADVANCE_OVER_LIMIT", limitPaisa: 2000000 }]);
  });

  it("never flags before any entitlement exists", async () => {
    const w = await world();
    const { data } = await json(await advance(w.adminLogin, body(w, { amountPaisa: 9000000 })));
    expect(data.entry.flagged).toBe(false);
  });

  it("refuses when no month is open, and owners", async () => {
    const w = await world();
    expect((await advance(w.ownerLogin, body(w))).status).toBe(403);
    await setPeriodStatus(w.oct.id, "CLOSED");
    expect((await json(await advance(w.adminLogin, body(w)))).error.code).toBe("NO_OPEN_PERIOD");
  });
});
