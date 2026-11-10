import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/email/outbox/status/route";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";

const p = params({});
const path = "/email/outbox/status";

describe("GET /api/v1/email/outbox/status", () => {
  it("gives a Super Admin the outbox health without addresses or provider text", async () => {
    const login = await loginAs(await createUser({ roles: ["SUPER_ADMIN"] }));
    await prisma.emailOutbox.create({
      data: {
        template: "INVITE",
        toEmail: "hidden.person@example.com",
        locale: "en",
        payload: {},
        dedupeKey: "st-1",
        status: "FAILED",
        attempts: 1,
        lastError: "SENDER_NOT_VERIFIED: The gmail.com domain is not verified",
      },
    });
    await prisma.emailOutbox.create({
      data: { template: "RESET", toEmail: "x@example.com", locale: "en", payload: {}, dedupeKey: "st-2", nextAttemptAt: new Date(Date.now() - 15 * 60_000) },
    });

    const res = await GET(apiRequest(path, { login }), p);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const { data } = await json(res);
    expect(data).toMatchObject({ queued: 1, stalled: true, failedLast7Days: 1, lastFailure: { template: "INVITE", failureCode: "SENDER_NOT_VERIFIED" } });
    expect(JSON.stringify(data)).not.toMatch(/hidden\.person|gmail/);
  });

  it("forbids an Owner and rejects anonymous callers", async () => {
    const owner = await loginAs(await createUser({ roles: ["OWNER"] }));
    const forbidden = await GET(apiRequest(path, { login: owner }), p);
    expect(forbidden.status).toBe(403);
    expect((await json(forbidden)).error.code).toBe("FORBIDDEN");
    expect((await GET(apiRequest(path), p)).status).toBe(401);
  });
});
