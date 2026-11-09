import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/transactions/adjustments/route";
import * as one from "@/app/api/v1/transactions/[id]/route";
import { prisma } from "@/lib/prisma";
import { createPeriod, moneyWorld } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi, "2026-11-05T06:00:00Z"));
afterEach(() => vi.useRealTimers());

async function setup() {
  const w = await moneyWorld();
  await createPeriod(w.property.id, "2026-08", "CLOSED");
  await createPeriod(w.property.id, "2026-11");
  return { ...w, adminLogin: await loginAs(w.admin), ownerLogin: await loginAs(w.owner) };
}

const body = (w: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) => ({
  period: "2026-11",
  kind: "EXPENSE",
  amountPaisa: 120000,
  txnDate: "2026-11-04",
  fundAccountId: w.cash.id,
  description: "August gas bill was under-recorded",
  referencePeriod: "2026-08",
  reason: "Titas bill for August arrived late",
  ...extra,
});

describe("POST /api/v1/transactions/adjustments (LCK-02)", () => {
  it("records an expense adjustment in the Open month for an older Closed month", async () => {
    const w = await setup();
    const res = await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w)), params({}));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.transaction).toMatchObject({ period: "2026-11", referencePeriod: "2026-08", source: "ADJUSTMENT", category: { code: "ADJUSTMENT_EXP" } });
    expect(data.periodTotals.expensePaisa).toBe(120000);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "transaction.adjustment_created", entityId: data.transaction.id } });
    expect(log.reason).toBe("Titas bill for August arrived late");

    const detail = await json(await one.GET(apiRequest(`/transactions/${data.transaction.id}`, { login: w.ownerLogin }), params({ id: data.transaction.id })));
    expect(detail.data.referencePeriod).toBe("2026-08");
  });

  it("shows its reason on the created item of the detail history", async () => {
    const w = await setup();
    const { data } = await json(await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w)), params({})));
    const id = data.transaction.id;
    const detail = (await json(await one.GET(apiRequest(`/transactions/${id}`, { login: w.ownerLogin }), params({ id })))).data;
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({ action: "transaction.created", reason: "Titas bill for August arrived late" });
  });

  it("uses ADJUSTMENT_INC for income", async () => {
    const w = await setup();
    const res = await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w, { kind: "INCOME" })), params({}));
    expect((await json(res)).data.transaction.category.code).toBe("ADJUSTMENT_INC");
  });

  it("needs a Closed earlier reference month and a reason", async () => {
    const w = await setup();
    const open = await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w, { referencePeriod: "2026-10" })), params({}));
    expect((await json(open)).error.details.fields.referencePeriod).toBeTruthy();
    const noReason = await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w, { reason: "" })), params({}));
    expect(noReason.status).toBe(422);
    const later = await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w, { period: "2026-10", txnDate: "2026-10-30", referencePeriod: "2026-09" })), params({}));
    expect(later.status).toBe(201);
  });

  it("is forbidden to owners and replays with the same key", async () => {
    const w = await setup();
    expect((await POST(moneyPost("/transactions/adjustments", w.ownerLogin, body(w)), params({}))).status).toBe(403);
    const a = await json(await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w), "adj-key-1"), params({})));
    const b = await json(await POST(moneyPost("/transactions/adjustments", w.adminLogin, body(w), "adj-key-1"), params({})));
    expect(b).toEqual(a);
    expect(await prisma.houseTransaction.count()).toBe(1);
  });
});
