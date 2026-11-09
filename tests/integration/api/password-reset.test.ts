import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as forgot } from "@/app/api/v1/auth/forgot/route";
import { GET as checkReset } from "@/app/api/v1/auth/reset/[token]/route";
import { POST as reset } from "@/app/api/v1/auth/reset/route";
import { POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { prisma } from "@/lib/prisma";
import { issueToken, RESET_TTL_MS } from "@/lib/auth/token-service";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { apiRequest, json, loginAs, ORIGIN, params, setCookies } from "../../helpers/http";

const p = params({});
const T0 = new Date("2026-11-09T00:00:00Z");
function freeze(ms = 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0.getTime() + ms));
}
afterEach(() => vi.useRealTimers());

const askReset = (email: string) => forgot(apiRequest("/auth/forgot", { body: { email } }), p);
const check = (token: string) => checkReset(new Request(`${ORIGIN}/api/v1/auth/reset/${token}`), params({ token }));
const doReset = (token: string, password: string, cookie?: string) =>
  reset(apiRequest("/auth/reset", { body: { token, password }, cookie }), p);

async function latestResetToken(userId: string) {
  // The raw token only exists in the queued email payload.
  const row = await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: userId, template: "RESET" }, orderBy: { createdAt: "desc" } });
  return (row.payload as { token: string }).token;
}

describe("POST /api/v1/auth/forgot", () => {
  it("answers 202 with an identical body for real, unknown and inactive emails", async () => {
    const active = await createUser({ email: "real@example.com" });
    await createUser({ email: "gone@example.com", status: "INACTIVE" });
    const bodies = [];
    for (const email of ["Real@Example.com", "nobody@example.com", "gone@example.com"]) {
      const res = await askReset(email);
      expect(res.status).toBe(202);
      bodies.push(await json(res));
    }
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(await prisma.emailOutbox.count({ where: { template: "RESET" } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { template: "RESET", toUserId: active.id } })).toBe(1);
  });

  it("voids older reset links when a new one is requested", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser({ email: "real@example.com" });
    await askReset("real@example.com");
    const first = await latestResetToken(user.id);
    vi.setSystemTime(Date.now() + 1000);
    await askReset("real@example.com");
    const second = await latestResetToken(user.id);
    expect(second).not.toBe(first);
    expect((await json(await check(first))).error.code).toBe("TOKEN_USED");
    expect((await check(second)).status).toBe(200);
  });

  it("queues at most 3 reset emails per account per hour, still answering 202", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser({ email: "real@example.com" });
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(Date.now() + 1000);
      expect((await askReset("real@example.com")).status).toBe(202);
    }
    expect(await prisma.emailOutbox.count({ where: { toUserId: user.id, template: "RESET" } })).toBe(3);
  });
});

describe("GET /api/v1/auth/reset/:token", () => {
  it("is valid for 1 hour", async () => {
    freeze();
    const user = await createUser();
    const token = await prisma.$transaction((tx) => issueToken(tx, { userId: user.id, type: "RESET", createdById: null }));
    expect((await json(await check(token))).data).toEqual({ valid: true });
    freeze(RESET_TTL_MS + 60_000);
    const res = await check(token);
    expect(res.status).toBe(410);
    expect((await json(res)).error.code).toBe("TOKEN_EXPIRED");
  });

  it("does not accept an invite token as a reset token", async () => {
    const user = await createUser();
    const token = await prisma.$transaction((tx) => issueToken(tx, { userId: user.id, type: "INVITE", createdById: null }));
    expect((await check(token)).status).toBe(410);
  });
});

describe("POST /api/v1/auth/reset", () => {
  it("sets the password, revokes all sessions, clears the lock, queues an email, starts a new session", async () => {
    const user = await createUser({ email: "real@example.com" });
    const otherBrowser = await loginAs(user);
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() + 600_000) } });
    await askReset("real@example.com");
    const token = await latestResetToken(user.id);

    const res = await doReset(token, "New!horse-battery-9");
    expect(res.status).toBe(204);
    const cookies = setCookies(res);
    const claims = await verifyAccessToken(cookies.bh_at.value);
    expect(claims?.sub).toBe(user.id);

    expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: otherBrowser.cookie }), p)).status).toBe(401);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
    expect(row.tokenVersion).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { toUserId: user.id, template: "PASSWORD_CHANGED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.password.reset" } })).toBe(1);

    const newLogin = await login(apiRequest("/auth/login", { body: { identifier: user.username, password: "New!horse-battery-9" } }), p);
    expect(newLogin.status).toBe(200);
    const oldLogin = await login(apiRequest("/auth/login", { body: { identifier: user.username, password: DEFAULT_PASSWORD } }), p);
    expect(oldLogin.status).toBe(401);
  });

  it("is single-use", async () => {
    const user = await createUser({ email: "real@example.com" });
    await askReset("real@example.com");
    const token = await latestResetToken(user.id);
    expect((await doReset(token, "New!horse-battery-9")).status).toBe(204);
    const again = await doReset(token, "Other!horse-battery-9");
    expect(again.status).toBe(410);
    expect((await json(again)).error.code).toBe("TOKEN_USED");
  });

  it("applies the password policy", async () => {
    const user = await createUser({ email: "real@example.com" });
    await askReset("real@example.com");
    const res = await doReset(await latestResetToken(user.id), "short");
    expect(res.status).toBe(422);
  });
});
