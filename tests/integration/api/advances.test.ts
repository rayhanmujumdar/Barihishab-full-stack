import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as advances from "@/app/api/v1/advances/route";
import { prisma } from "@/lib/prisma";
import { createFund, createLedgerEntry, createPeriod, setPeriodStatus } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
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
    expect(data.warnings[0]).toEqual({ code: "ADVANCE_OVER_LIMIT", limitPaisa: 2000000 });
  });

  it("uses the Settings multiplier and counts the advance already outstanding (§7.5)", async () => {
    const w = await world();
    const base = { propertyId: w.property.id, ownerId: w.owners.farzana.id, createdById: w.admin.id, type: "ENTITLEMENT" as const, amountPaisa: 3000000 };
    for (const month of ["2026-06", "2026-07", "2026-08"]) {
      const p = await createPeriod(w.property.id, month);
      await createLedgerEntry({ ...base, periodId: p.id });
      await setPeriodStatus(p.id, "CLOSED");
    }
    await prisma.property.update({ where: { id: w.property.id }, data: { settings: { advanceLimit: { multiplierPct: 200 } } } });
    // Settle Farzana to 0 (opening 870390 + 3 × 3000000 entitlements).
    await w.entry(w.owners.farzana.id, "ADJUSTMENT", -9870390, { referencePeriodId: w.oct.id });
    // Last 3 closed: Sep 0, Aug and Jul 3000000 → avg 2000000 × 2 = 4000000.
    const ok = (await json(await advance(w.adminLogin, body(w, { ownerId: w.owners.farzana.id, amountPaisa: 4000000 })))).data;
    expect(ok.entry.flagged).toBe(false);
    // 4000000 already outstanding + 1 > 4000000.
    const over = (await json(await advance(w.adminLogin, body(w, { ownerId: w.owners.farzana.id, amountPaisa: 1 })))).data;
    expect(over.entry.flagged).toBe(true);
    expect(over.warnings).toContainEqual({ code: "ADVANCE_OVER_LIMIT", limitPaisa: 4000000 });
  });

  it("warns when the owner is still owed money but saves the advance (G11)", async () => {
    const w = await world();
    const res = await advance(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id }));
    expect(res.status).toBe(201);
    expect((await json(res)).data.warnings).toContainEqual({ code: "OWNER_OWED", balancePaisa: 805585 });
  });

  it("counts a reopened-and-reclosed month's entitlement once", async () => {
    const w = await world();
    const p = await createPeriod(w.property.id, "2026-08");
    const base = { propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.admin.id, periodId: p.id };
    const first = await createLedgerEntry({ ...base, type: "ENTITLEMENT", amountPaisa: 3000000, voided: "Reopened" });
    await createLedgerEntry({ ...base, type: "REVERSAL", amountPaisa: -3000000, reversesId: first.id });
    await createLedgerEntry({ ...base, type: "ENTITLEMENT", amountPaisa: 3000000 });
    await setPeriodStatus(p.id, "CLOSED");
    // Last 3 closed: Sep (0) and Aug (3000000) → average 1500000 (6000000 → 3000000 if double counted).
    const { data } = await json(await advance(w.adminLogin, body(w, { amountPaisa: 1500001 })));
    expect(data.warnings).toContainEqual({ code: "ADVANCE_OVER_LIMIT", limitPaisa: 1500000 });
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

const list = (login: Login, query = "") => advances.GET(apiRequest(`/advances${query}`, { login }), params({}));

describe("GET /api/v1/advances (F11, G5, G6, §7.6)", () => {
  it("lists advances newest first with recovery status, source and the owner's balance now", async () => {
    const w = await world();
    const tanvir = (await json(await advance(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, amountPaisa: 300000, date: "2026-10-15", reason: "Medicine" })))).data.entry;
    const dup = (await json(await advance(w.adminLogin, body(w, { ownerId: w.owners.farzana.id, amountPaisa: 200000, date: "2026-10-16", reason: "Duplicate" })))).data.entry;
    await (await import("@/app/api/v1/ledger/[id]/void/route")).POST(apiRequest(`/ledger/${dup.id}/void`, { login: w.adminLogin, body: { reason: "Duplicate" } }), params({ id: dup.id }));
    await w.entry(w.owners.nasrin.id, "ENTITLEMENT", 3382760, { entryDate: "2026-10-31" });

    const d = (await json(await list(w.ownerLogin))).data;
    expect(d.advances.map((a: { ownerName: string; status: string; recoveredMonth: string | null; amountPaisa: number }) => [a.ownerName, a.amountPaisa, a.status, a.recoveredMonth])).toEqual([
      ["Farzana Haque", 200000, "VOID", null],
      ["Tanvir Ahmed", 300000, "RECOVERED", "2026-10"],
      ["Nasrin Ahmed", 500000, "RECOVERED", "2026-10"],
    ]);
    expect(d.advances[0]).toMatchObject({ voidReason: "Duplicate", origin: "DIRECT" });
    expect(d.advances[1]).toMatchObject({ id: tanvir.id, reason: "Medicine", date: "2026-10-15", month: "2026-10", ownerBalancePaisa: 505585, isSelf: false });
    expect(d.advances[2].ownerBalancePaisa).toBe(2882760);
    expect(d.summary).toEqual({ advancesOutstandingPaisa: 0, paidInYearPaisa: 800000, year: 2026, years: [2026] });
    expect(d.limit).toEqual({ multiplierPct: 100 });
  });

  it("judges recovery in recording order: a back-dated advance after a full payout is still OUTSTANDING", async () => {
    const w = await world();
    // Tanvir (owed 805585) is paid in full on the 15th, then an advance dated the 12th is recorded.
    await (await import("@/app/api/v1/payouts/route")).POST(moneyPost("/payouts", w.adminLogin, { ownerId: w.owners.tanvir.id, amountPaisa: 805585, date: "2026-10-15", fundAccountId: w.house.id, method: "CASH" }), params({}));
    await advance(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id, date: "2026-10-12", reason: "Back-dated" }));
    const row = (await json(await list(w.adminLogin, `?ownerId=${w.owners.tanvir.id}`))).data.advances[0];
    expect(row).toMatchObject({ reason: "Back-dated", status: "OUTSTANDING", ownerBalancePaisa: -500000 });
  });

  it("keeps an advance OUTSTANDING while the balance is negative and filters by owner and year", async () => {
    const w = await world();
    const d = (await json(await list(w.adminLogin, `?ownerId=${w.owners.nasrin.id}&year=2026`))).data;
    expect(d.advances).toHaveLength(1);
    expect(d.advances[0]).toMatchObject({ status: "OUTSTANDING", recoveredMonth: null, ownerBalancePaisa: -500000 });
    expect(d.summary).toMatchObject({ advancesOutstandingPaisa: 500000, paidInYearPaisa: 500000 });
    const other = (await json(await list(w.adminLogin, "?year=2025"))).data;
    expect(other.advances).toEqual([]);
    expect(other.summary).toMatchObject({ paidInYearPaisa: 0, year: 2025, years: [2026] });
  });

  it("refuses bad filters and anonymous callers", async () => {
    const w = await world();
    expect((await list(w.adminLogin, "?year=20x6")).status).toBe(422);
    expect((await list(w.adminLogin, "?ownerId=nope")).status).toBe(422);
    expect((await advances.GET(apiRequest("/advances"), params({}))).status).toBe(401);
  });
});
