import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as refreshPage, POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { GET as getSession } from "@/app/api/v1/auth/session/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { POST as logoutAll } from "@/app/api/v1/auth/logout-all/route";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { apiRequest, cookieHeaderFrom, json, loginAs, ORIGIN, params, setCookies } from "../../helpers/http";

const p = params({});

afterEach(() => vi.useRealTimers());

async function loginViaApi(username: string, remember = true) {
  const res = await login(apiRequest("/auth/login", { body: { identifier: username, password: DEFAULT_PASSWORD, remember } }), p);
  expect(res.status).toBe(200);
  return { res, cookie: cookieHeaderFrom(res), cookies: setCookies(res) };
}

describe("POST /api/v1/auth/refresh", () => {
  it("rotates: new cookies, old refresh token dead", async () => {
    const user = await createUser();
    const first = await loginViaApi(user.username);
    const res = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: first.cookie }), p);
    expect(res.status).toBe(200);
    const next = setCookies(res);
    expect(next.bh_rt.value).not.toBe(first.cookies.bh_rt.value);
    expect(next.bh_rt.raw).toMatch(/Max-Age=2592000/);
    expect(await verifyAccessToken(next.bh_at.value)).toMatchObject({ sub: user.id });
    expect((await json(res)).data.csrfToken).toBe(next.bh_csrf.value);
  });

  it("refreshes with the real token when a shadow bh_rt is sent first, and deletes the shadow", async () => {
    const user = await createUser();
    const first = await loginViaApi(user.username);
    const shadow = `bh_rt=${encodeURIComponent("(httpOnly cookie, sent by the browser)")}; `;
    const res = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: shadow + first.cookie }), p);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toContain("bh_rt=; Path=/api/v1; Max-Age=0; SameSite=Lax");
  });

  it("detects reuse: 401, cookies cleared, whole family revoked, audited", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const user = await createUser();
    const first = await loginViaApi(user.username);
    const rotated = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: first.cookie }), p);
    expect(rotated.status).toBe(200);
    vi.setSystemTime(Date.now() + 60_000);
    const reuse = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: first.cookie }), p);
    expect(reuse.status).toBe(401);
    expect(setCookies(reuse).bh_rt.raw).toMatch(/Max-Age=0/);
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    const row = await prisma.auditLog.findFirst({ where: { entityId: user.id, action: "auth.logout_all", reason: "refresh_reuse" } });
    expect(row).not.toBeNull();
  });

  it("returns 401 and clears cookies for a deactivated user", async () => {
    const user = await createUser();
    const first = await loginViaApi(user.username);
    await prisma.user.update({ where: { id: user.id }, data: { status: "INACTIVE" } });
    const res = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: first.cookie }), p);
    expect(res.status).toBe(401);
    expect(setCookies(res).bh_at.raw).toMatch(/Max-Age=0/);
  });

  it("returns 401 without a refresh cookie", async () => {
    expect((await refresh(apiRequest("/auth/refresh", { method: "POST" }), p)).status).toBe(401);
  });

  it("page mode: redirects back to a safe next with fresh cookies", async () => {
    const user = await createUser();
    const first = await loginViaApi(user.username);
    const res = await refreshPage(
      new Request(`${ORIGIN}/api/v1/auth/refresh?next=%2Fadmin%2Fusers`, { headers: { cookie: first.cookie } }),
      p,
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/admin/users`);
    expect(setCookies(res).bh_at.value).toBeTruthy();
  });

  it("page mode: failure goes to /login with next, never back to the page", async () => {
    const res = await refreshPage(new Request(`${ORIGIN}/api/v1/auth/refresh?next=%2Fme`, { headers: { cookie: "bh_rt=bogus" } }), p);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/bn/login?next=%2Fbn%2Fme`);
    expect(setCookies(res).bh_rt.raw).toMatch(/Max-Age=0/);
  });

  it("page mode: rejects an external next", async () => {
    const user = await createUser();
    const first = await loginViaApi(user.username);
    const res = await refreshPage(new Request(`${ORIGIN}/api/v1/auth/refresh?next=%2F%2Fevil.example`, { headers: { cookie: first.cookie } }), p);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});

describe("GET /api/v1/auth/session", () => {
  it("returns user, roles, permissions and the CSRF token", async () => {
    const user = await createUser({ roles: ["SUPER_ADMIN"] });
    const login = await loginAs(user);
    const res = await getSession(apiRequest("/auth/session", { login }), p);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.user.id).toBe(user.id);
    expect(body.data.roles).toEqual(["SUPER_ADMIN"]);
    expect(body.data.permissions).toContain("user.create");
    expect(body.data.csrfToken).toBe(login.csrfToken);
  });

  it("returns 401 for anonymous callers", async () => {
    const res = await getSession(apiRequest("/auth/session"), p);
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHENTICATED");
  });
});

describe("logout", () => {
  it("revokes the current session, clears cookies, audits, returns 204", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const res = await logout(apiRequest("/auth/logout", { method: "POST", login }), p);
    expect(res.status).toBe(204);
    expect(setCookies(res).bh_rt.raw).toMatch(/Max-Age=0/);
    const r = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: login.cookie }), p);
    expect(r.status).toBe(401);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.logout" } })).toBe(1);
  });

  it("still logs out with only a refresh cookie (expired access token)", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const res = await logout(apiRequest("/auth/logout", { method: "POST", cookie: `bh_rt=${login.refreshToken}` }), p);
    expect(res.status).toBe(204);
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it("requires the CSRF token when authenticated by access token", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const res = await logout(apiRequest("/auth/logout", { method: "POST", login, csrf: false }), p);
    expect(res.status).toBe(403);
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });
});

describe("logout-all", () => {
  it("ends every session, including a second browser", async () => {
    const user = await createUser();
    const a = await loginAs(user);
    const b = await loginAs(user);
    const res = await logoutAll(apiRequest("/auth/logout-all", { method: "POST", login: a }), p);
    expect(res.status).toBe(204);
    const rb = await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: b.cookie }), p);
    expect(rb.status).toBe(401);
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.logout_all" } })).toBe(1);
  });

  it("requires the CSRF header", async () => {
    const user = await createUser();
    const a = await loginAs(user);
    const res = await logoutAll(apiRequest("/auth/logout-all", { method: "POST", login: a, csrf: false }), p);
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("CSRF_INVALID");
    expect(await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });
});
