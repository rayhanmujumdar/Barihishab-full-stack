import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/hash";
import { hashToken, verifyAccessToken } from "@/lib/auth/tokens";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { apiRequest, json, params, setCookies } from "../../helpers/http";

const call = (body: unknown, opts: Parameters<typeof apiRequest>[1] = {}) =>
  login(apiRequest("/auth/login", { body, ...opts }), params({}));

const T0 = new Date("2026-11-09T00:00:00Z");
function freeze(ms = 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0.getTime() + ms));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/v1/auth/login", () => {
  it("logs in with the username in any letter case and sets both cookies", async () => {
    const user = await createUser({ username: "rahim", roles: ["OWNER"] });
    const res = await call({ identifier: "RaHiM", password: DEFAULT_PASSWORD, remember: true });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.user).toMatchObject({ id: user.id, username: "rahim" });
    expect(body.data.roles).toEqual(["OWNER"]);
    expect(body.data.permissions).toContain("profile.update.self");
    expect(JSON.stringify(body)).not.toMatch(/argon2|password"/);

    const cookies = setCookies(res);
    expect(cookies.bh_at.raw).toMatch(/HttpOnly/);
    expect(cookies.bh_rt.raw).toMatch(/Max-Age=2592000/);
    const claims = await verifyAccessToken(cookies.bh_at.value);
    expect(claims).toMatchObject({ sub: user.id, roles: ["OWNER"] });
    const session = await prisma.authSession.findUniqueOrThrow({ where: { id: claims!.sid } });
    expect(session.tokenHash).toBe(hashToken(cookies.bh_rt.value));
  });

  it("logs in with the email in any letter case; without remember me the refresh cookie is session-only", async () => {
    await createUser({ email: "rahim@example.com" });
    const res = await call({ identifier: "Rahim@Example.com", password: DEFAULT_PASSWORD, remember: false });
    expect(res.status).toBe(200);
    expect(setCookies(res).bh_rt.raw).not.toMatch(/Max-Age/);
  });

  it("records success: counter reset, last_login_at, audit with IP and user agent", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 2 } });
    await call({ identifier: user.username, password: DEFAULT_PASSWORD }, { headers: { "x-forwarded-for": "5.6.7.8" } });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lastLoginAt).not.toBeNull();
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "auth.login.success" } });
    expect(row).toMatchObject({ actorId: user.id, ip: "5.6.7.8", userAgent: "vitest-agent" });
  });

  it("returns the same 401 body for unknown user, wrong password, inactive and invited accounts", async () => {
    const active = await createUser();
    const inactive = await createUser({ status: "INACTIVE" });
    const invited = await createUser({ status: "INVITED", password: null });
    const bodies = [];
    for (const [identifier, password] of [
      ["nobody_here", DEFAULT_PASSWORD],
      [active.username, "wrong-password"],
      [inactive.username, DEFAULT_PASSWORD],
      [invited.username, DEFAULT_PASSWORD],
    ]) {
      const res = await call({ identifier, password });
      expect(res.status).toBe(401);
      expect(res.headers.getSetCookie()).toHaveLength(0);
      bodies.push(await json(res));
    }
    for (const b of bodies) expect(b).toEqual({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Username/email or password is wrong." } });
    const failed = await prisma.auditLog.findMany({ where: { action: "auth.login.failed", entityId: active.id } });
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ actorId: null, userAgent: "vitest-agent" });
  });

  it("hints attempts left after the 3rd failure and locks on the 5th", async () => {
    freeze();
    const user = await createUser();
    const wrong = () => call({ identifier: user.username, password: "wrong-password" });
    expect((await json(await wrong())).error.details).toBeUndefined();
    await wrong();
    expect((await json(await wrong())).error.details).toEqual({ attemptsLeft: 2 });
    expect((await json(await wrong())).error.details).toEqual({ attemptsLeft: 1 });
    const fifth = await wrong();
    expect(fifth.status).toBe(423);
    const body = await json(fifth);
    expect(body.error.code).toBe("ACCOUNT_LOCKED");
    expect(body.error.details.retryAfter).toBe(900);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.lockedUntil).toEqual(new Date(T0.getTime() + 15 * 60_000));
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.locked" } })).toBe(1);
  });

  it("refuses the correct password during a lock and accepts it after 15 minutes", async () => {
    freeze();
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(T0.getTime() + 15 * 60_000) } });
    freeze(10 * 60_000);
    const locked = await call({ identifier: user.username, password: DEFAULT_PASSWORD });
    expect(locked.status).toBe(423);
    expect((await json(locked)).error.details.retryAfter).toBe(300);
    expect(locked.headers.getSetCookie()).toHaveLength(0);
    freeze(15 * 60_000 + 1000);
    expect((await call({ identifier: user.username, password: DEFAULT_PASSWORD })).status).toBe(200);
  });

  it("re-hashes a password stored with outdated parameters", async () => {
    const user = await createUser();
    const { hash } = await import("@node-rs/argon2");
    const weak = await hash(DEFAULT_PASSWORD, { algorithm: 2, memoryCost: 4096, timeCost: 1, parallelism: 1 });
    await prisma.account.updateMany({ where: { userId: user.id }, data: { password: weak } });
    expect((await call({ identifier: user.username, password: DEFAULT_PASSWORD })).status).toBe(200);
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.password).toMatch(/m=19456,t=2,p=1/);
    expect(account.password).not.toBe(await hashPassword(DEFAULT_PASSWORD));
  });

  it("rejects a foreign Origin with 403 CSRF_INVALID", async () => {
    const user = await createUser();
    const res = await call({ identifier: user.username, password: DEFAULT_PASSWORD }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("CSRF_INVALID");
  });

  it("returns 422 for a malformed body", async () => {
    const res = await call({ identifier: "", password: 5 });
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields).toHaveProperty("password");
  });

  it("rate limits 10 requests per minute per IP", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    for (let i = 0; i < 10; i++) {
      await call({ identifier: `ghost${i}`, password: "x-password" }, { headers: { "x-forwarded-for": "7.7.7.7" } });
    }
    const res = await call({ identifier: "ghost99", password: "x-password" }, { headers: { "x-forwarded-for": "7.7.7.7" } });
    expect(res.status).toBe(429);
    expect((await json(res)).error.code).toBe("RATE_LIMITED");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("rate limits 5 attempts per minute per identifier across IPs", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    for (let i = 0; i < 5; i++) {
      await call({ identifier: "Target_User", password: "x-password" }, { headers: { "x-forwarded-for": `10.0.0.${i}` } });
    }
    const res = await call({ identifier: "target_user", password: "x-password" }, { headers: { "x-forwarded-for": "10.0.0.99" } });
    expect(res.status).toBe(429);
  });
});
