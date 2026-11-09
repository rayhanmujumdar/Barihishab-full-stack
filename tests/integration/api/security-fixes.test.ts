import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { GET as refreshPage, POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
import { POST as createUserApi } from "@/app/api/v1/users/route";
import { GET as inspectInvite } from "@/app/api/v1/auth/invite/[token]/route";
import { GET as getMe } from "@/app/api/v1/me/route";
import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth/token-service";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { readJson } from "@/lib/api/body";
import { z } from "zod";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { apiRequest, json, loginAs, ORIGIN, params, setCookies } from "../../helpers/http";

const p = params({});
afterEach(() => vi.useRealTimers());

describe("security review fixes", () => {
  it("caps grace-window siblings: a 4th replay of a rotated token is treated as theft (M1)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser();
    const login = await loginAs(user);
    expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p)).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p)).status, `sibling ${i + 1}`).toBe(200);
    }
    const fourth = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p);
    expect(fourth.status).toBe(401);
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("parallel refreshes of the same token all succeed instead of logging the user out", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const results = await Promise.all(
      [0, 1, 2].map(() => refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    for (const r of results) expect(setCookies(r).bh_rt.value).toBeTruthy();
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(3);
  });

  it("logout kills the family including any sibling", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser();
    const login = await loginAs(user);
    const r1 = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p);
    await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p);
    const fresh = setCookies(r1);
    const res = await logout(apiRequest("/auth/logout", { method: "POST", cookie: `bh_rt=${fresh.bh_rt.value}` }), p);
    expect(res.status).toBe(204);
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("GET refresh refuses cross-site navigations without rotating (M2)", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const res = await refreshPage(
      new Request(`${ORIGIN}/api/v1/auth/refresh?next=%2Fme`, { headers: { cookie: login.cookie, "sec-fetch-site": "cross-site" } }),
      p,
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: login.sessionId } })).rotatedAt).toBeNull();
  });

  it("changing an invited user's email kills the old link and re-invites (M4)", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const al = await loginAs(admin);
    const created = await json(await createUserApi(apiRequest("/users", { body: { username: "typo_user", email: "typo@example.com", role: "OWNER" }, login: al }), p));
    const id = created.data.user.id;
    const oldToken = ((await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: id } })).payload as { token: string }).token;
    const res = await patchUser(apiRequest(`/users/${id}`, { method: "PATCH", body: { email: "right@example.com" }, login: al }), params({ id }));
    expect(res.status).toBe(200);
    const inspect = (t: string) => inspectInvite(new Request(`${ORIGIN}/api/v1/auth/invite/${t}`), params({ token: t }));
    expect((await inspect(oldToken)).status).toBe(410);
    const latest = await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: id }, orderBy: { createdAt: "desc" } });
    expect(latest.toEmail).toBe("right@example.com");
    expect((await inspect((latest.payload as { token: string }).token)).status).toBe(200);
  });

  it("changing an active user's email voids open reset links", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const u = await createUser({ email: "a@example.com" });
    await prisma.$transaction((tx) => issueToken(tx, { userId: u.id, type: "RESET", createdById: null }));
    await patchUser(apiRequest(`/users/${u.id}`, { method: "PATCH", body: { email: "b@example.com" }, login: await loginAs(admin) }), params({ id: u.id }));
    expect(await prisma.authToken.count({ where: { userId: u.id, usedAt: null, revokedAt: null } })).toBe(0);
  });

  it("every authenticated route is strict by default (M6)", async () => {
    const u = await createUser();
    const login = await loginAs(u);
    await prisma.user.update({ where: { id: u.id }, data: { status: "INACTIVE" } });
    expect((await getMe(apiRequest("/me", { login }), p)).status).toBe(401);
  });

  it("rejects oversized bodies before parsing", async () => {
    const big = new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({ a: "x".repeat(70_000) }), headers: { "content-type": "application/json" } });
    const parsed = await readJson(big, z.object({ a: z.string() }));
    expect(parsed.ok).toBe(false);
  });

  it("prunes stale rate-limit rows", async () => {
    await prisma.rateLimit.create({ data: { key: "old", count: 1, windowStart: new Date(Date.now() - 3 * 86400_000) } });
    await prisma.rateLimit.create({ data: { key: "new", count: 1, windowStart: new Date() } });
    expect(await pruneRateLimits()).toBe(1);
    expect(await prisma.rateLimit.count()).toBe(1);
  });
});

describe("rate limits on the other public auth endpoints (AUTH-04)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ["forgot", () => import("@/app/api/v1/auth/forgot/route"), { email: "x@example.com" }],
    ["reset", () => import("@/app/api/v1/auth/reset/route"), { token: "nope", password: "Gh7!tree-river" }],
    ["accept-invite", () => import("@/app/api/v1/auth/accept-invite/route"), { token: "nope", password: "Gh7!tree-river", locale: "bn" }],
  ] as const)("%s answers 429 after 10 requests per minute from one IP", async (name, load, body) => {
    vi.stubEnv("TRUST_PROXY", "true");
    const { POST } = await load();
    const call = () => POST(apiRequest(`/auth/${name}`, { body, headers: { "x-forwarded-for": "203.0.113.50" } }), p);
    for (let i = 0; i < 10; i++) expect((await call()).status, `request ${i + 1}`).not.toBe(429);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("password change voids open reset links", () => {
  it("a reset link mailed before the change can no longer be used", async () => {
    const { POST: changePassword } = await import("@/app/api/v1/me/password/route");
    const user = await createUser();
    const token = await prisma.$transaction((tx) => issueToken(tx, { userId: user.id, type: "RESET", createdById: null }));
    const res = await changePassword(
      apiRequest("/me/password", { body: { currentPassword: DEFAULT_PASSWORD, newPassword: "New!horse-battery-9" }, login: await loginAs(user) }),
      p,
    );
    expect(res.status).toBe(204);
    const { inspectToken } = await import("@/lib/auth/token-service");
    expect((await inspectToken(token, "RESET")).status).toBe("USED");
  });
});
