import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as adjustments from "@/app/api/v1/adjustments/route";
import * as funds from "@/app/api/v1/fund-accounts/route";
import { prisma } from "@/lib/prisma";
import { createPeriod, setPeriodStatus } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

type World = Awaited<ReturnType<typeof ownersWorld>>;
const adjust = (login: Login, body: unknown, key?: string) => adjustments.POST(moneyPost("/adjustments", login, body, key), params({}));
const body = (w: World, extra: Record<string, unknown> = {}) => ({
  ownerId: w.owners.tanvir.id,
  amountPaisa: -500000,
  referenceMonth: "2026-09",
  reason: "June payout recorded against wrong owner",
  ...extra,
});
const fundTotals = async (login: Login) =>
  (await json(await funds.GET(apiRequest("/fund-accounts", { login }), params({})))).data.items.map((f: { balancePaisa: number }) => f.balancePaisa);

describe("POST /api/v1/adjustments (F14)", () => {
  it("posts a signed adjustment in the latest open month without touching funds", async () => {
    const w = await ownersWorld();
    const before = await fundTotals(w.adminLogin);
    const res = await adjust(w.adminLogin, body(w));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.entry).toMatchObject({ type: "ADJUSTMENT", amountPaisa: -500000, referenceMonth: "2026-09", month: "2026-10", fundAccountId: null, note: "June payout recorded against wrong owner" });
    expect(data.balancePaisa).toBe(305585);
    expect(await fundTotals(w.adminLogin)).toEqual(before);
    expect(await prisma.auditLog.count({ where: { action: "ledger.adjustment_created", entityId: data.entry.id } })).toBe(1);
    expect((await json(await adjust(w.adminLogin, body(w, { amountPaisa: 1000 })))).data.balancePaisa).toBe(306585);
  });

  it("validates amount, reference month and reason", async () => {
    const w = await ownersWorld();
    expect((await adjust(w.adminLogin, body(w, { amountPaisa: 0 }))).status).toBe(422);
    expect((await adjust(w.adminLogin, body(w, { reason: "" }))).status).toBe(422);
    await createPeriod(w.property.id, "2026-12", "CLOSED");
    await setPeriodStatus(w.oct.id, "OPEN");
    const late = await adjust(w.adminLogin, body(w, { referenceMonth: "2026-12" }));
    expect((await json(late)).error.details.fields.referenceMonth).toBeTruthy();
    expect((await adjust(w.adminLogin, body(w, { referenceMonth: "2025-01" }))).status).toBe(422);
  });

  it("is idempotent, needs an open month and is admin-only", async () => {
    const w = await ownersWorld();
    const key = randomUUID();
    expect(await json(await adjust(w.adminLogin, body(w), key))).toEqual(await json(await adjust(w.adminLogin, body(w), key)));
    expect(await prisma.ownerLedgerEntry.count({ where: { type: "ADJUSTMENT" } })).toBe(1);
    expect((await adjust(w.ownerLogin, body(w))).status).toBe(403);
    await setPeriodStatus(w.oct.id, "CLOSED");
    expect((await json(await adjust(w.adminLogin, body(w)))).error.code).toBe("NO_OPEN_PERIOD");
  });
});
