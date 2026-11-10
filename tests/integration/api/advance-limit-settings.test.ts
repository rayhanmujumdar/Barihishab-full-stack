import { describe, expect, it } from "vitest";
import * as route from "@/app/api/v1/settings/advance-limit/route";
import { prisma } from "@/lib/prisma";
import { moneyWorld } from "../../helpers/factory";
import { apiRequest, json, loginAs, params, type Login } from "../../helpers/http";

const get = (login: Login) => route.GET(apiRequest("/settings/advance-limit", { login }), params({}));
const put = (login: Login, body: unknown) => route.PUT(apiRequest("/settings/advance-limit", { method: "PUT", login, body }), params({}));

describe("GET/PUT /api/v1/settings/advance-limit (F14, SET-02)", () => {
  it("defaults to 1× and saves another multiplier with an audit row", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    expect((await json(await get(admin))).data).toEqual({ multiplierPct: 100 });
    const res = await put(admin, { multiplierPct: 150 });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ multiplierPct: 150 });
    expect((await json(await get(admin))).data).toEqual({ multiplierPct: 150 });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "settings.advance_limit_updated", entityId: w.property.id } });
    expect(row).toMatchObject({ before: { multiplierPct: 100 }, after: { multiplierPct: 150 } });
  });

  it("refuses other values and Owners", async () => {
    const w = await moneyWorld();
    const admin = await loginAs(w.admin);
    expect((await put(admin, { multiplierPct: 120 })).status).toBe(422);
    expect((await json(await get(admin))).data).toEqual({ multiplierPct: 100 });
    const owner = await loginAs(w.owner);
    expect((await put(owner, { multiplierPct: 200 })).status).toBe(403);
    expect((await get(owner)).status).toBe(403);
  });
});
