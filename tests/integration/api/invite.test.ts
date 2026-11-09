import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as inspectInvite } from "@/app/api/v1/auth/invite/[token]/route";
import { POST as acceptInvite } from "@/app/api/v1/auth/accept-invite/route";
import { prisma } from "@/lib/prisma";
import { issueToken, INVITE_TTL_MS } from "@/lib/auth/token-service";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { createUser } from "../../helpers/factory";
import { apiRequest, json, ORIGIN, params, setCookies } from "../../helpers/http";

const T0 = new Date("2026-11-09T00:00:00Z");
function freeze(ms = 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0.getTime() + ms));
}
afterEach(() => vi.useRealTimers());

async function invited() {
  const admin = await createUser({ roles: ["SUPER_ADMIN"], firstName: "Bookkeeper" });
  const user = await createUser({ status: "INVITED", password: null, firstName: "Karim", username: "karim", locale: "bn" });
  const token = await prisma.$transaction((tx) => issueToken(tx, { userId: user.id, type: "INVITE", createdById: admin.id }));
  return { admin, user, token };
}

const inspect = (token: string) =>
  inspectInvite(new Request(`${ORIGIN}/api/v1/auth/invite/${token}`), params({ token }));
const accept = (body: unknown) => acceptInvite(apiRequest("/auth/accept-invite", { body }), params({}));

describe("GET /api/v1/auth/invite/:token", () => {
  it("returns first name, username, inviter and expiry for a valid invite", async () => {
    freeze();
    const { token } = await invited();
    const res = await inspect(token);
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({
      firstName: "Karim",
      username: "karim",
      invitedBy: "Bookkeeper",
      expiresAt: new Date(T0.getTime() + INVITE_TTL_MS).toISOString(),
      locale: "bn",
    });
  });

  it("returns 410 TOKEN_EXPIRED with the inviter's name after 72 h", async () => {
    freeze();
    const { token } = await invited();
    freeze(72 * 3600_000 + 1000);
    const res = await inspect(token);
    expect(res.status).toBe(410);
    const body = await json(res);
    expect(body.error.code).toBe("TOKEN_EXPIRED");
    expect(body.error.details.invitedBy).toBe("Bookkeeper");
  });

  it("returns 410 TOKEN_USED for a used or revoked invite", async () => {
    const { token, user } = await invited();
    await prisma.authToken.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    const res = await inspect(token);
    expect(res.status).toBe(410);
    expect((await json(res)).error.code).toBe("TOKEN_USED");
  });

  it("does not reveal whether an unknown token ever existed", async () => {
    const res = await inspect("x".repeat(43));
    expect(res.status).toBe(410);
    const body = await json(res);
    expect(body.error.code).toBe("TOKEN_EXPIRED");
    expect(body.error.details).toBeUndefined();
  });
});

describe("POST /api/v1/auth/accept-invite", () => {
  it("activates the user, saves the password and locale, logs them in", async () => {
    const { token, user } = await invited();
    const res = await accept({ token, password: "Gh7!tree-river", locale: "en" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.user).toMatchObject({ id: user.id, status: "ACTIVE", locale: "en" });

    const cookies = setCookies(res);
    expect(await verifyAccessToken(cookies.bh_at.value)).toMatchObject({ sub: user.id });
    expect(cookies.bh_rt.raw).not.toMatch(/Max-Age/); // remember = false

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.status).toBe("ACTIVE");
    expect(row.passwordChangedAt).not.toBeNull();
    const t = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(t.usedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.invite.accepted" } })).toBe(1);
  });

  it("works only once", async () => {
    const { token } = await invited();
    expect((await accept({ token, password: "Gh7!tree-river", locale: "bn" })).status).toBe(200);
    const again = await accept({ token, password: "Another!pass-99", locale: "bn" });
    expect(again.status).toBe(410);
    expect((await json(again)).error.code).toBe("TOKEN_USED");
  });

  it("rejects a weak password with 422 and keeps the invite usable", async () => {
    const { token, user } = await invited();
    const res = await accept({ token, password: "karim", locale: "bn" });
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toHaveProperty("password");
    const res2 = await accept({ token, password: "password123", locale: "bn" });
    expect(res2.status).toBe(422);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("INVITED");
  });

  it("rejects an expired invite", async () => {
    freeze();
    const { token } = await invited();
    freeze(INVITE_TTL_MS + 1);
    const res = await accept({ token, password: "Gh7!tree-river", locale: "bn" });
    expect(res.status).toBe(410);
    expect((await json(res)).error.code).toBe("TOKEN_EXPIRED");
  });

  it("issuing a new invite revokes the old one", async () => {
    const { token, user } = await invited();
    const fresh = await prisma.$transaction((tx) => issueToken(tx, { userId: user.id, type: "INVITE", createdById: null }));
    expect((await inspect(token)).status).toBe(410);
    expect((await inspect(fresh)).status).toBe(200);
  });
});
