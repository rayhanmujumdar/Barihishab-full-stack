import { describe, expect, it } from "vitest";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/me/route";
import { POST as changePassword } from "@/app/api/v1/me/password/route";
import { GET as listSessions } from "@/app/api/v1/me/sessions/route";
import { DELETE as deleteSession } from "@/app/api/v1/me/sessions/[id]/route";
import { POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { prisma } from "@/lib/prisma";
import { verifyUserPassword } from "@/lib/auth/credentials";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { apiRequest, json, loginAs, params, setCookies } from "../../helpers/http";

const p = params({});

describe("GET /api/v1/me", () => {
  it("returns the caller's profile, roles and permissions without secrets", async () => {
    const owner = await createUser({ roles: ["OWNER"], phone: "01712345678" });
    const res = await getMe(apiRequest("/me", { login: await loginAs(owner) }), p);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.profile).toMatchObject({ id: owner.id, phone: "01712345678" });
    expect(body.data.roles).toEqual(["OWNER"]);
    expect(body.data.permissions).toHaveLength(11); // RBAC-02: 6 auth/money keys + owner.view + distribution.view + loan.view + request.create + request.view
    expect(JSON.stringify(body)).not.toMatch(/argon2|tokenVersion|failedLoginCount/);
  });

  it("returns 401 for anonymous callers", async () => {
    expect((await getMe(apiRequest("/me"), p)).status).toBe(401);
  });
});

describe("PATCH /api/v1/me", () => {
  it("lets an Owner update their phone and audits before/after", async () => {
    const owner = await createUser({ roles: ["OWNER"], phone: "01712345678" });
    const res = await patchMe(apiRequest("/me", { method: "PATCH", body: { phone: "01812345678" }, login: await loginAs(owner) }), p);
    expect(res.status).toBe(200);
    expect((await json(res)).data.profile.phone).toBe("01812345678");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: owner.id, action: "user.updated" } });
    expect(row.before).toEqual({ phone: "01712345678" });
    expect(row.after).toEqual({ phone: "01812345678" });
  });

  it("forbids an Owner from changing email or username, and changes nothing", async () => {
    const owner = await createUser({ roles: ["OWNER"], phone: "01712345678" });
    const login = await loginAs(owner);
    const res = await patchMe(apiRequest("/me", { method: "PATCH", body: { email: "new@example.com", phone: "01812345678" }, login }), p);
    expect(res.status).toBe(403);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(row.email).toBe(owner.email);
    expect(row.phone).toBe("01712345678");
  });

  it("lets a Super Admin change their own username", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const res = await patchMe(apiRequest("/me", { method: "PATCH", body: { username: "new_name" }, login: await loginAs(admin) }), p);
    expect(res.status).toBe(200);
    expect((await json(res)).data.profile.username).toBe("new_name");
  });

  it("rejects an invalid Bangladesh phone number and a taken username", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    await createUser({ username: "taken" });
    const login = await loginAs(admin);
    const bad = await patchMe(apiRequest("/me", { method: "PATCH", body: { phone: "12345" }, login }), p);
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.fields).toHaveProperty("phone");
    const taken = await patchMe(apiRequest("/me", { method: "PATCH", body: { username: "TAKEN" }, login }), p);
    expect(taken.status).toBe(409);
    expect((await json(taken)).error.code).toBe("USERNAME_TAKEN");
  });

  it("copies the phone into WhatsApp when whatsappSameAsPhone is set", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    const res = await patchMe(
      apiRequest("/me", { method: "PATCH", body: { phone: "+8801712345678", whatsappSameAsPhone: true }, login: await loginAs(owner) }),
      p,
    );
    expect((await json(res)).data.profile.whatsapp).toBe("+8801712345678");
  });
});

describe("POST /api/v1/me/password", () => {
  it("rejects a wrong current password with 401 and counts it toward the lock", async () => {
    const user = await createUser();
    const res = await changePassword(
      apiRequest("/me/password", { body: { currentPassword: "wrong-one", newPassword: "New!horse-battery-9" }, login: await loginAs(user) }),
      p,
    );
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("INVALID_CREDENTIALS");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginCount).toBe(1);
    expect((await verifyUserPassword(user.id, DEFAULT_PASSWORD)).valid).toBe(true);
  });

  it("changes the password, keeps this device, ends the others, queues an email", async () => {
    const user = await createUser();
    const here = await loginAs(user);
    const other = await loginAs(user);
    const res = await changePassword(
      apiRequest("/me/password", { body: { currentPassword: DEFAULT_PASSWORD, newPassword: "New!horse-battery-9" }, login: here }),
      p,
    );
    expect(res.status).toBe(204);
    const cookies = setCookies(res);
    expect(cookies.bh_at.value).toBeTruthy();

    expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: other.cookie }), p)).status).toBe(401);
    const hereNext = `bh_rt=${cookies.bh_rt.value}`;
    expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: hereNext }), p)).status).toBe(200);

    expect((await verifyUserPassword(user.id, "New!horse-battery-9")).valid).toBe(true);
    expect(await prisma.emailOutbox.count({ where: { toUserId: user.id, template: "PASSWORD_CHANGED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.password.changed" } })).toBe(1);
  });

  it("applies the password policy", async () => {
    const user = await createUser();
    const res = await changePassword(
      apiRequest("/me/password", { body: { currentPassword: DEFAULT_PASSWORD, newPassword: "password123" }, login: await loginAs(user) }),
      p,
    );
    expect(res.status).toBe(422);
  });
});

describe("own sessions", () => {
  it("lists active sessions with exactly one marked current", async () => {
    const user = await createUser();
    const a = await loginAs(user);
    await loginAs(user);
    const res = await listSessions(apiRequest("/me/sessions", { login: a }), p);
    expect(res.status).toBe(200);
    const items = (await json(res)).data;
    expect(items).toHaveLength(2);
    expect(items.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(items.find((s: { current: boolean }) => s.current).id).toBe(a.sessionId);
    expect(Object.keys(items[0]).sort()).toEqual(["browser", "createdAt", "current", "device", "id", "ip", "lastSeenAt"]);
  });

  it("revokes one of the caller's sessions", async () => {
    const user = await createUser();
    const a = await loginAs(user);
    const b = await loginAs(user);
    const res = await deleteSession(apiRequest(`/me/sessions/${b.sessionId}`, { method: "DELETE", login: a }), params({ id: b.sessionId }));
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: b.sessionId } })).revokedAt).not.toBeNull();
  });

  it("returns 404 for another user's session and leaves it alone", async () => {
    const me = await createUser();
    const them = await createUser();
    const mine = await loginAs(me);
    const theirs = await loginAs(them);
    const res = await deleteSession(apiRequest(`/me/sessions/${theirs.sessionId}`, { method: "DELETE", login: mine }), params({ id: theirs.sessionId }));
    expect(res.status).toBe(404);
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: theirs.sessionId } })).revokedAt).toBeNull();
  });

  it("clears cookies when revoking the current session", async () => {
    const user = await createUser();
    const a = await loginAs(user);
    const res = await deleteSession(apiRequest(`/me/sessions/${a.sessionId}`, { method: "DELETE", login: a }), params({ id: a.sessionId }));
    expect(res.status).toBe(204);
    expect(setCookies(res).bh_at.raw).toMatch(/Max-Age=0/);
  });
});

describe("change password lockout", () => {
  it("locks the account after 5 wrong current passwords and then answers 423", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const attempt = () =>
      changePassword(apiRequest("/me/password", { body: { currentPassword: "nope-nope", newPassword: "New!horse-battery-9" }, login }), p);
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const locked = await attempt();
    expect(locked.status).toBe(423);
    expect((await json(locked)).error.details.retryAfter).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.locked" } })).toBe(1);
  });

  it("starts a fresh session for this device when no refresh cookie is sent", async () => {
    const user = await createUser();
    const login = await loginAs(user);
    const res = await changePassword(
      apiRequest("/me/password", {
        body: { currentPassword: DEFAULT_PASSWORD, newPassword: "New!horse-battery-9" },
        cookie: `bh_at=${login.accessToken}; bh_csrf=${login.csrfToken}`,
        headers: { "x-csrf-token": login.csrfToken },
      }),
      p,
    );
    expect(res.status).toBe(204);
    expect(setCookies(res).bh_rt.value).toBeTruthy();
    expect((await prisma.authSession.findUniqueOrThrow({ where: { id: login.sessionId } })).revokedAt).not.toBeNull();
  });
});
