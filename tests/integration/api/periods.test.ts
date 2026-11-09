import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/periods/route";
import { ensureCurrentPeriod } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { createPeriod, createProperty, createUser } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";

afterEach(() => vi.useRealTimers());

const freeze = (iso: string) => vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });

describe("GET /api/v1/periods", () => {
  it("opens the current Asia/Dhaka month on first read (PER-01)", async () => {
    await createProperty();
    const owner = await loginAs(await createUser({ roles: ["OWNER"] }));
    freeze("2026-10-31T18:05:00Z"); // 1 Nov 00:05 in Dhaka
    const res = await GET(apiRequest("/periods", { login: owner }), params({}));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.items).toEqual([expect.objectContaining({ month: "2026-11", status: "OPEN" })]);
    expect(body.data.latestOpen).toBe("2026-11");
  });

  it("never reopens an existing CLOSED current month", async () => {
    const property = await createProperty();
    await createPeriod(property.id, "2026-11", "CLOSED");
    const owner = await loginAs(await createUser({ roles: ["OWNER"] }));
    freeze("2026-11-05T06:00:00Z");
    const body = await json(await GET(apiRequest("/periods", { login: owner }), params({})));
    expect(body.data.items).toEqual([expect.objectContaining({ month: "2026-11", status: "CLOSED" })]);
    expect(body.data.latestOpen).toBeNull();
  });

  it("lists newest first with the latest open month", async () => {
    const property = await createProperty();
    await createPeriod(property.id, "2026-09", "CLOSED");
    await createPeriod(property.id, "2026-10");
    const owner = await loginAs(await createUser({ roles: ["OWNER"] }));
    freeze("2026-11-02T06:00:00Z");
    const body = await json(await GET(apiRequest("/periods", { login: owner }), params({})));
    expect(body.data.items.map((p: { month: string }) => p.month)).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(body.data.latestOpen).toBe("2026-11");
  });

  it("creates exactly one row under concurrent opening", async () => {
    const property = await createProperty();
    freeze("2026-11-02T06:00:00Z");
    await Promise.all(Array.from({ length: 5 }, () => ensureCurrentPeriod(property.id)));
    expect(await prisma.period.count()).toBe(1);
  });

  it("requires a session", async () => {
    await createProperty();
    const res = await GET(apiRequest("/periods"), params({}));
    expect(res.status).toBe(401);
  });
});
