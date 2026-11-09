import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as override from "@/app/api/v1/periods/[month]/reserve/route";
import * as settings from "@/app/api/v1/settings/reserve/route";
import { prisma } from "@/lib/prisma";
import { createPeriod, createTxn } from "../../helpers/factory";
import { boardData, distributionWorld, postClose } from "../../helpers/distribution";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const getRule = (login: Login) => settings.GET(apiRequest("/settings/reserve", { login }), params({}));
const putRule = (login: Login, body: unknown) => settings.PUT(apiRequest("/settings/reserve", { method: "PUT", login, body }), params({}));
const putOverride = (login: Login, month: string, body: unknown) => override.PUT(apiRequest(`/periods/${month}/reserve`, { method: "PUT", login, body }), params({ month }));

describe("reserve rule (F9, SET-02)", () => {
  it("saves a rule with before/after audit and refuses bad input and Owners", async () => {
    const w = await distributionWorld();
    expect((await json(await getRule(w.adminLogin))).data).toEqual({ rule: { mode: "PERCENT", percentBp: 500, startingPaisa: 0 }, balancePaisa: 0 });
    const res = await putRule(w.adminLogin, { mode: "FIXED", fixedPaisa: 2000000, startingPaisa: 100000 });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ rule: { mode: "FIXED", fixedPaisa: 2000000, startingPaisa: 100000 }, balancePaisa: 100000 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "settings.reserve_updated", entityId: w.property.id } });
    expect(audit.before).toMatchObject({ mode: "PERCENT", percentBp: 500 });
    expect(audit.after).toMatchObject({ mode: "FIXED", fixedPaisa: 2000000 });
    // Other settings keys survive.
    expect(((await prisma.property.findUniqueOrThrow({ where: { id: w.property.id } })).settings as { reserve: unknown }).reserve).toMatchObject({ mode: "FIXED" });
    for (const bad of [{ mode: "PERCENT", percentBp: 0, startingPaisa: 0 }, { mode: "PERCENT", percentBp: 10001, startingPaisa: 0 }, { mode: "FIXED", startingPaisa: 0 }, { mode: "OFF", startingPaisa: -1 }, { mode: "NOPE" }]) {
      expect((await putRule(w.adminLogin, bad)).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await putRule(w.ownerLogin, { mode: "OFF", startingPaisa: 0 })).status).toBe(403);
    expect((await getRule(w.ownerLogin)).status).toBe(403);
  });

  it("caps a fixed reserve at the surplus", async () => {
    const w = await distributionWorld();
    await putRule(w.adminLogin, { mode: "FIXED", fixedPaisa: 9000000, startingPaisa: 0 });
    expect((await boardData(w.ownerLogin, "2026-10")).staircase).toMatchObject({ reservePaisa: 8902000, distributablePaisa: 0 });
  });
});

describe("PUT /api/v1/periods/:month/reserve (G3)", () => {
  it("overrides and resets an open month's reserve, audited with the reason", async () => {
    const w = await distributionWorld();
    const res = await putOverride(w.adminLogin, "2026-10", { amountPaisa: 1000000, reason: "Pump replacement next month" });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ month: "2026-10", overridePaisa: 1000000, overrideReason: "Pump replacement next month" });
    const d = await boardData(w.ownerLogin, "2026-10");
    expect(d.staircase).toMatchObject({ reservePaisa: 1000000, reserveSource: "OVERRIDE", distributablePaisa: 7902000 });
    expect(d.reserve).toMatchObject({ overridePaisa: 1000000, overrideReason: "Pump replacement next month" });
    expect(await prisma.auditLog.count({ where: { action: "period.reserve_overridden", entityId: w.oct.id, reason: "Pump replacement next month" } })).toBe(1);

    expect((await putOverride(w.adminLogin, "2026-10", { amountPaisa: null })).status).toBe(200);
    expect((await boardData(w.ownerLogin, "2026-10")).staircase).toMatchObject({ reservePaisa: 445100, reserveSource: "RULE" });
    expect(await prisma.auditLog.count({ where: { action: "period.reserve_reset", entityId: w.oct.id } })).toBe(1);
  });

  it("refuses closed months, missing reasons, unknown months and Owners", async () => {
    const w = await distributionWorld();
    const closed = await putOverride(w.adminLogin, "2026-09", { amountPaisa: 0, reason: "x" });
    expect(closed.status).toBe(409);
    expect((await json(closed)).error.code).toBe("PERIOD_CLOSED");
    const noReason = await putOverride(w.adminLogin, "2026-10", { amountPaisa: 5 });
    expect(noReason.status).toBe(422);
    expect((await json(noReason)).error.details.fields.reason).toBe("Please write a reason — everyone can see it.");
    expect((await putOverride(w.adminLogin, "2026-10", { amountPaisa: -1, reason: "x" })).status).toBe(422);
    expect((await putOverride(w.adminLogin, "2019-01", { amountPaisa: 1, reason: "x" })).status).toBe(404);
    expect((await putOverride(w.adminLogin, "oct", { amountPaisa: 1, reason: "x" })).status).toBe(422);
    expect((await putOverride(w.ownerLogin, "2026-10", { amountPaisa: 1, reason: "x" })).status).toBe(403);
  });
});

describe("reserve balance (§7.4)", () => {
  it("= starting + reserve of closed months − reserve-paid expenses", async () => {
    const w = await distributionWorld();
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200); // keeps 445100
    const nov = await prisma.period.findFirstOrThrow({ where: { propertyId: w.property.id, month: new Date("2026-11-01T00:00:00Z") } });
    const base = { propertyId: w.property.id, periodId: nov.id, fundAccountId: w.cash.id, createdById: w.admin.id };
    await createTxn({ ...base, kind: "INCOME", categoryId: w.categories.OTHER_INC.id, amountPaisa: 9822000 }); // reserve 491100
    expect((await postClose(w.adminLogin, "2026-11")).status).toBe(200);
    await createPeriod(w.property.id, "2026-12").catch(() => undefined);
    const dec = await prisma.period.findFirstOrThrow({ where: { propertyId: w.property.id, month: new Date("2026-12-01T00:00:00Z") } });
    await createTxn({ ...base, periodId: dec.id, categoryId: w.categories.REPAIR.id, amountPaisa: 300000, fromReserve: true });
    expect((await json(await getRule(w.adminLogin))).data.balancePaisa).toBe(636200);
    expect((await boardData(w.ownerLogin, "2026-12")).reserve.balancePaisa).toBe(636200);
  });
});
