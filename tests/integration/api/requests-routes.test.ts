import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as listRoute from "@/app/api/v1/requests/route";
import * as disburseRoute from "@/app/api/v1/requests/[id]/disburse/route";
import { apiRequest, json, params } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { advanceBody, approve, detail, formContext, list, requestsWorld, submitted } from "../../helpers/requests";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("/api/v1/requests route contract", () => {
  it("answers GETs uncached in the success envelope", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.ownerLogin);
    for (const res of [await list(w.ownerLogin), await detail(w.ownerLogin, id), await formContext(w.ownerLogin)]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect((await json(res)).success).toBe(true);
    }
  });

  it("needs the CSRF token on writes", async () => {
    const w = await requestsWorld();
    const res = await listRoute.POST(apiRequest("/requests", { login: w.ownerLogin, body: advanceBody(), csrf: false }), params({}));
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("CSRF_INVALID");
  });

  it("needs an Idempotency-Key to disburse", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.ownerLogin);
    await approve(w.adminLogin, id);
    const res = await disburseRoute.POST(apiRequest(`/requests/${id}/disburse`, { login: w.adminLogin, body: { date: "2026-10-20", fundAccountId: w.cash.id, method: "CASH" } }), params({ id }));
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toHaveProperty("Idempotency-Key");
  });

  it("rejects unknown body fields", async () => {
    const w = await requestsWorld();
    const res = await listRoute.POST(apiRequest("/requests", { login: w.ownerLogin, body: { ...advanceBody(), status: "APPROVED" } }), params({}));
    expect(res.status).toBe(422);
  });
});
