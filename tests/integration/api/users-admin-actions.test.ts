import { describe, expect, it } from "vitest";
import { PUT as putRoles } from "@/app/api/v1/users/[id]/roles/route";
import { POST as deactivate } from "@/app/api/v1/users/[id]/deactivate/route";
import { POST as reactivate } from "@/app/api/v1/users/[id]/reactivate/route";
import { POST as resendInvite } from "@/app/api/v1/users/[id]/resend-invite/route";
import { POST as revokeInvite } from "@/app/api/v1/users/[id]/revoke-invite/route";
import { POST as revokeSessions } from "@/app/api/v1/users/[id]/revoke-sessions/route";
import { GET as listUsers, POST as createUserApi } from "@/app/api/v1/users/route";
import { GET as getUser, PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
import { GET as inspectInvite } from "@/app/api/v1/auth/invite/[token]/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { GET as audit } from "@/app/api/v1/audit/route";
import { prisma } from "@/lib/prisma";
import { setRoles } from "@/lib/users/admin-service";
import { revokeSession } from "@/lib/auth/session-service";
import { POST as changePassword } from "@/app/api/v1/me/password/route";
import { GET as listMySessions } from "@/app/api/v1/me/sessions/route";
import { DELETE as deleteMySession } from "@/app/api/v1/me/sessions/[id]/route";
import { issueToken } from "@/lib/auth/token-service";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { apiRequest, json, loginAs, ORIGIN, params } from "../../helpers/http";

const p = params({});
const at = (id: string) => params({ id });

async function admin() {
  const a = await createUser({ roles: ["SUPER_ADMIN"] });
  return { a, login: await loginAs(a) };
}

describe("PUT /api/v1/users/:id/roles", () => {
  it("refuses to demote the last active Super Admin", async () => {
    const { a } = await admin();
    // Another admin acting is impossible when there is one; call as the same admin on themselves → own-admin rule first.
    const res = await setRoles({ targetId: a.id, roles: ["OWNER"], actor: { id: "00000000-0000-4000-8000-000000000001" } });
    expect(res).toEqual({ ok: false, code: "LAST_SUPER_ADMIN" });
    expect((await prisma.userRole.findMany({ where: { userId: a.id } })).map((r) => r.role)).toEqual(["SUPER_ADMIN"]);
  });

  it("refuses to let a Super Admin remove their own admin role", async () => {
    const { a, login } = await admin();
    await createUser({ roles: ["SUPER_ADMIN"] });
    const res = await putRoles(apiRequest(`/users/${a.id}/roles`, { method: "PUT", body: { roles: ["OWNER"] }, login }), at(a.id));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("CANNOT_REMOVE_OWN_ADMIN");
  });

  it("changes roles, revokes the target's sessions, bumps token_version and audits", async () => {
    const { login } = await admin();
    const owner = await createUser({ roles: ["OWNER"] });
    const ownerLogin = await loginAs(owner);
    const res = await putRoles(apiRequest(`/users/${owner.id}/roles`, { method: "PUT", body: { roles: ["OWNER", "SUPER_ADMIN"] }, login }), at(owner.id));
    expect(res.status).toBe(200);
    expect((await json(res)).data.user.roles.sort()).toEqual(["OWNER", "SUPER_ADMIN"]);
    expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: ownerLogin.cookie }), p)).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).tokenVersion).toBe(1);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: owner.id, action: "user.role.changed" } });
    expect(row.before).toEqual({ roles: ["OWNER"] });
    expect((row.after as { roles: string[] }).roles.sort()).toEqual(["OWNER", "SUPER_ADMIN"]);
  });

  it("lets exactly one of two concurrent demotions of the last two admins succeed", async () => {
    const a = await createUser({ roles: ["SUPER_ADMIN"] });
    const b = await createUser({ roles: ["SUPER_ADMIN"] });
    const results = await Promise.all([
      setRoles({ targetId: b.id, roles: ["OWNER"], actor: { id: a.id } }),
      setRoles({ targetId: a.id, roles: ["OWNER"], actor: { id: b.id } }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "LAST_SUPER_ADMIN")).toHaveLength(1);
    expect(await prisma.userRole.count({ where: { role: "SUPER_ADMIN" } })).toBe(1);
  });

  it("rejects roles not enabled in v1", async () => {
    const { login } = await admin();
    const owner = await createUser();
    const res = await putRoles(apiRequest(`/users/${owner.id}/roles`, { method: "PUT", body: { roles: ["VIEWER"] }, login }), at(owner.id));
    expect(res.status).toBe(422);
  });
});

describe("deactivate / reactivate", () => {
  it("requires a reason", async () => {
    const { login } = await admin();
    const owner = await createUser();
    const res = await deactivate(apiRequest(`/users/${owner.id}/deactivate`, { body: { reason: "  " }, login }), at(owner.id));
    expect(res.status).toBe(422);
  });

  it("logs the user out everywhere, kills open tokens, and blocks login", async () => {
    const { login: adminLogin } = await admin();
    const owner = await createUser();
    const ownerLogin = await loginAs(owner);
    const token = await prisma.$transaction((tx) => issueToken(tx, { userId: owner.id, type: "RESET", createdById: null }));
    const res = await deactivate(apiRequest(`/users/${owner.id}/deactivate`, { body: { reason: "moved abroad" }, login: adminLogin }), at(owner.id));
    expect(res.status).toBe(200);
    expect((await json(res)).data.user.status).toBe("INACTIVE");
    expect((await refresh(apiRequest("/auth/refresh", { method: "POST", cookie: ownerLogin.cookie }), p)).status).toBe(401);
    expect(await prisma.authToken.count({ where: { userId: owner.id, revokedAt: null, usedAt: null } })).toBe(0);
    void token;
    const l = await login(apiRequest("/auth/login", { body: { identifier: owner.username, password: DEFAULT_PASSWORD } }), p);
    expect(l.status).toBe(401);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: owner.id, action: "user.deactivated" } });
    expect(row.reason).toBe("moved abroad");
  });

  it("refuses to deactivate the last active Super Admin", async () => {
    const { a, login } = await admin();
    const res = await deactivate(apiRequest(`/users/${a.id}/deactivate`, { body: { reason: "test" }, login }), at(a.id));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("LAST_SUPER_ADMIN");
  });

  it("reactivates to ACTIVE when a password exists, else INVITED", async () => {
    const { login } = await admin();
    const withPw = await createUser({ status: "INACTIVE" });
    const noPw = await createUser({ status: "INACTIVE", password: null });
    const r1 = await reactivate(apiRequest(`/users/${withPw.id}/reactivate`, { body: { reason: "back" }, login }), at(withPw.id));
    expect((await json(r1)).data.user.status).toBe("ACTIVE");
    const r2 = await reactivate(apiRequest(`/users/${noPw.id}/reactivate`, { body: { reason: "back" }, login }), at(noPw.id));
    expect((await json(r2)).data.user.status).toBe("INVITED");
    expect(await prisma.auditLog.count({ where: { action: "user.reactivated", entityId: withPw.id } })).toBe(1);
  });
});

describe("invites", () => {
  async function invitedUser(loginA: Awaited<ReturnType<typeof loginAs>>) {
    const res = await createUserApi(apiRequest("/users", { body: { username: "karim", email: "karim@example.com", role: "OWNER", locale: "en" }, login: loginA }), p);
    const { user } = (await json(res)).data;
    const mail = await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: user.id } });
    return { user, token: (mail.payload as { token: string }).token };
  }
  const inspect = (token: string) => inspectInvite(new Request(`${ORIGIN}/api/v1/auth/invite/${token}`), params({ token }));

  it("resend kills the old link and issues a new one", async () => {
    const { login } = await admin();
    const { user, token } = await invitedUser(login);
    const res = await resendInvite(apiRequest(`/users/${user.id}/resend-invite`, { method: "POST", login }), at(user.id));
    expect(res.status).toBe(202);
    expect((await json(await inspect(token))).error.code).toBe("TOKEN_USED");
    const mails = await prisma.emailOutbox.findMany({ where: { toUserId: user.id }, orderBy: { createdAt: "desc" } });
    expect(mails).toHaveLength(2);
    expect((await inspect((mails[0].payload as { token: string }).token)).status).toBe(200);
  });

  it("resend answers 409 NOT_INVITED for an active user", async () => {
    const { login } = await admin();
    const active = await createUser();
    const res = await resendInvite(apiRequest(`/users/${active.id}/resend-invite`, { method: "POST", login }), at(active.id));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("NOT_INVITED");
  });

  it("revoke makes the link dead at once", async () => {
    const { login } = await admin();
    const { user, token } = await invitedUser(login);
    const res = await revokeInvite(apiRequest(`/users/${user.id}/revoke-invite`, { method: "POST", login }), at(user.id));
    expect(res.status).toBe(204);
    expect((await json(await inspect(token))).error.code).toBe("TOKEN_USED");
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.invite.revoked" } })).toBe(1);
  });
});

describe("force logout", () => {
  it("revokes every session of the target", async () => {
    const { login } = await admin();
    const owner = await createUser();
    await loginAs(owner);
    await loginAs(owner);
    const res = await revokeSessions(apiRequest(`/users/${owner.id}/revoke-sessions`, { method: "POST", login }), at(owner.id));
    expect(res.status).toBe(204);
    expect(await prisma.authSession.count({ where: { userId: owner.id, revokedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: owner.id, action: "user.sessions.revoked" } })).toBe(1);
  });
});

describe("authorization on every admin endpoint", () => {
  it("returns 403 with no data to an Owner and 401 to anonymous callers", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    const target = await createUser();
    const ownerLogin = await loginAs(owner);
    const id = target.id;
    const calls: [string, (r: Request) => Promise<Response>, Parameters<typeof apiRequest>[1]][] = [
      ["GET /users", (r) => listUsers(r, p), {}],
      ["POST /users", (r) => createUserApi(r, p), { body: { username: "zz_top", email: "z@example.com", role: "OWNER" } }],
      ["GET /users/:id", (r) => getUser(r, at(id)), {}],
      ["PATCH /users/:id", (r) => patchUser(r, at(id)), { method: "PATCH", body: { firstName: "X" } }],
      ["PUT roles", (r) => putRoles(r, at(id)), { method: "PUT", body: { roles: ["SUPER_ADMIN"] } }],
      ["deactivate", (r) => deactivate(r, at(id)), { body: { reason: "x" } }],
      ["reactivate", (r) => reactivate(r, at(id)), { body: { reason: "x" } }],
      ["resend-invite", (r) => resendInvite(r, at(id)), { method: "POST" }],
      ["revoke-invite", (r) => revokeInvite(r, at(id)), { method: "POST" }],
      ["revoke-sessions", (r) => revokeSessions(r, at(id)), { method: "POST" }],
      ["GET /audit", (r) => audit(r, p), {}],
    ];
    for (const [name, handler, opts] of calls) {
      const forbidden = await handler(apiRequest("/x", { ...opts, login: ownerLogin }));
      expect(forbidden.status, name).toBe(403);
      const body = await json(forbidden);
      expect(body.data, name).toBeUndefined();
      expect(body.error.code, name).toBe("FORBIDDEN");

      const anon = await handler(apiRequest("/x", { ...opts, origin: undefined }));
      expect(anon.status, `${name} anon`).toBe(401);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).firstName).not.toBe("X");
  });
});

describe("strict revocation on the real sensitive routes (auth-session: Immediate revocation)", () => {
  type Case = [string, (r: Request) => Promise<Response>, Parameters<typeof apiRequest>[1]];
  function cases(targetId: string, sessionId: string): Case[] {
    return [
      ["GET /users", (r) => listUsers(r, p), {}],
      ["POST /users", (r) => createUserApi(r, p), { body: { username: "zz_top", email: "z@example.com", role: "OWNER" } }],
      ["GET /users/:id", (r) => getUser(r, at(targetId)), {}],
      ["PATCH /users/:id", (r) => patchUser(r, at(targetId)), { method: "PATCH", body: { firstName: "X" } }],
      ["PUT roles", (r) => putRoles(r, at(targetId)), { method: "PUT", body: { roles: ["SUPER_ADMIN"] } }],
      ["deactivate", (r) => deactivate(r, at(targetId)), { body: { reason: "x" } }],
      ["reactivate", (r) => reactivate(r, at(targetId)), { body: { reason: "x" } }],
      ["resend-invite", (r) => resendInvite(r, at(targetId)), { method: "POST" }],
      ["revoke-invite", (r) => revokeInvite(r, at(targetId)), { method: "POST" }],
      ["revoke-sessions", (r) => revokeSessions(r, at(targetId)), { method: "POST" }],
      ["GET /audit", (r) => audit(r, p), {}],
      ["POST /me/password", (r) => changePassword(r, p), { body: { currentPassword: DEFAULT_PASSWORD, newPassword: "New!horse-battery-9" } }],
      ["GET /me/sessions", (r) => listMySessions(r, p), {}],
      ["DELETE /me/sessions/:id", (r) => deleteMySession(r, at(sessionId)), { method: "DELETE" }],
    ];
  }

  async function expectAll401(login: Awaited<ReturnType<typeof loginAs>>, targetId: string) {
    for (const [name, handler, opts] of cases(targetId, login.sessionId)) {
      const res = await handler(apiRequest("/x", { ...opts, login }));
      expect(res.status, name).toBe(401);
      expect((await json(res)).error.code, name).toBe("UNAUTHENTICATED");
    }
  }

  it("rejects a Super Admin whose session was revoked, even with an unexpired access token", async () => {
    await createUser({ roles: ["SUPER_ADMIN"] }); // keeps the last-admin rule out of the way
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const target = await createUser();
    const login = await loginAs(admin);
    await revokeSession(login.sessionId, "test");
    await expectAll401(login, target.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).firstName).not.toBe("X");
  });

  it("rejects a Super Admin whose token_version moved (demoted / password changed elsewhere)", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const target = await createUser();
    const login = await loginAs(admin);
    await prisma.user.update({ where: { id: admin.id }, data: { tokenVersion: { increment: 1 } } });
    await expectAll401(login, target.id);
  });

  it("rejects a Super Admin who was deactivated", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const target = await createUser();
    const login = await loginAs(admin);
    await prisma.user.update({ where: { id: admin.id }, data: { status: "INACTIVE" } });
    await expectAll401(login, target.id);
  });
});

describe("PATCH /api/v1/users/:id errors", () => {
  it("answers 409 for a taken email or username, 422 for bad fields, 404 for an unknown id", async () => {
    const { login } = await admin();
    await createUser({ username: "taken", email: "taken@example.com" });
    const u = await createUser();
    const patch = (body: unknown, id = u.id) => patchUser(apiRequest(`/users/${id}`, { method: "PATCH", body, login }), at(id));
    expect((await json(await patch({ email: "TAKEN@example.com" }))).error.code).toBe("EMAIL_TAKEN");
    expect((await json(await patch({ username: "TAKEN" }))).error.code).toBe("USERNAME_TAKEN");
    const bad = await patch({ phone: "12345" });
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.fields).toHaveProperty("phone");
    expect((await patch({ firstName: "X" }, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await patch({ firstName: "X" }, "not-a-uuid")).status).toBe(404);
  });
});

describe("user search", () => {
  it("doesn't match every phone when the query is only separators", async () => {
    const { login } = await admin();
    await createUser({ username: "has_phone", phone: "01711111111" });
    const res = await listUsers(apiRequest(`/users?q=${encodeURIComponent("-")}`, { login }), p);
    expect((await json(res)).data.items.map((x: { username: string }) => x.username)).not.toContain("has_phone");
  });
});
