import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as auditList } from "@/app/api/v1/audit/route";
import { POST as createUserApi } from "@/app/api/v1/users/route";
import { PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
import { PUT as putRoles } from "@/app/api/v1/users/[id]/roles/route";
import { POST as deactivate } from "@/app/api/v1/users/[id]/deactivate/route";
import { POST as reactivate } from "@/app/api/v1/users/[id]/reactivate/route";
import { POST as revokeInvite } from "@/app/api/v1/users/[id]/revoke-invite/route";
import { POST as revokeSessions } from "@/app/api/v1/users/[id]/revoke-sessions/route";
import { POST as acceptInvite } from "@/app/api/v1/auth/accept-invite/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { POST as logoutAll } from "@/app/api/v1/auth/logout-all/route";
import { POST as forgot } from "@/app/api/v1/auth/forgot/route";
import { POST as reset } from "@/app/api/v1/auth/reset/route";
import { POST as changePassword } from "@/app/api/v1/me/password/route";
import { POST as presignAvatar } from "@/app/api/v1/avatars/presign/route";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createProperty, createUser, DEFAULT_PASSWORD } from "../../helpers/factory";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";
import { apiRequest, json, loginAs, params } from "../../helpers/http";

const p = params({});
const at = (id: string) => params({ id });
const IP = { "x-forwarded-for": "203.0.113.7" };

afterEach(() => vi.unstubAllEnvs());

describe("audit trail", () => {
  it("writes all 18 auth/user actions with IP and user agent, and never stores secrets", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    // audit_logs is append-only and shared across files: only count rows from this test.
    const { _max } = await prisma.auditLog.aggregate({ _max: { id: true } });
    const lastIdBefore = _max.id ?? BigInt(0);
    const store = useFakeStorage();
    await createProperty(); // profile photos are stored under the current property
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    await createUser({ roles: ["SUPER_ADMIN"] }); // second admin so demotion paths are allowed
    const adminLogin = await loginAs(admin);
    const req = (path: string, opts: Parameters<typeof apiRequest>[1] = {}) => apiRequest(path, { headers: IP, ...opts });

    // user.created + auth.invite.sent
    const created = await json(await createUserApi(req("/users", { body: { username: "karim", email: "karim@example.com", role: "OWNER", locale: "en" }, login: adminLogin }), p));
    const karimId = created.data.user.id;
    const invite = await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: karimId } });
    const inviteToken = (invite.payload as { token: string }).token;

    // auth.invite.accepted
    expect((await acceptInvite(req("/auth/accept-invite", { body: { token: inviteToken, password: DEFAULT_PASSWORD, locale: "en" } }), p)).status).toBe(200);

    // auth.login.success / auth.login.failed / auth.locked
    expect((await login(req("/auth/login", { body: { identifier: "karim", password: DEFAULT_PASSWORD } }), p)).status).toBe(200);
    const victim = await createUser();
    for (let i = 0; i < 5; i++) {
      await login(apiRequest("/auth/login", { body: { identifier: victim.username, password: "nope-nope" }, headers: { "x-forwarded-for": `198.51.100.${i}` } }), p);
    }

    // auth.logout / auth.logout_all
    const karim = await prisma.user.findUniqueOrThrow({ where: { id: karimId }, include: { roles: true } });
    expect((await logout(req("/auth/logout", { method: "POST", login: await loginAs(karim) }), p)).status).toBe(204);
    expect((await logoutAll(req("/auth/logout-all", { method: "POST", login: await loginAs(karim) }), p)).status).toBe(204);

    // auth.password.changed / auth.password.reset
    const k2 = await loginAs(karim);
    expect((await changePassword(req("/me/password", { body: { currentPassword: DEFAULT_PASSWORD, newPassword: "Second!pass-word-2" }, login: k2 }), p)).status).toBe(204);
    await forgot(req("/auth/forgot", { body: { email: "karim@example.com" } }), p);
    const resetMail = await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: karimId, template: "RESET" } });
    expect((await reset(req("/auth/reset", { body: { token: (resetMail.payload as { token: string }).token, password: "Third!pass-word-3" } }), p)).status).toBe(204);

    // user.updated / user.role.changed / user.sessions.revoked / user.deactivated / user.reactivated
    expect((await patchUser(req(`/users/${karimId}`, { method: "PATCH", body: { profession: "Engineer" }, login: adminLogin }), at(karimId))).status).toBe(200);
    expect((await putRoles(req(`/users/${karimId}/roles`, { method: "PUT", body: { roles: ["OWNER", "SUPER_ADMIN"] }, login: adminLogin }), at(karimId))).status).toBe(200);
    expect((await revokeSessions(req(`/users/${karimId}/revoke-sessions`, { method: "POST", login: adminLogin }), at(karimId))).status).toBe(204);
    expect((await deactivate(req(`/users/${karimId}/deactivate`, { body: { reason: "test" }, login: adminLogin }), at(karimId))).status).toBe(200);
    expect((await reactivate(req(`/users/${karimId}/reactivate`, { body: { reason: "test" }, login: adminLogin }), at(karimId))).status).toBe(200);

    // user.avatar.updated / user.avatar.removed
    const signed = await json(await presignAvatar(req("/avatars/presign", { body: { fileName: "k.png", mime: "image/png", size: 64 }, login: adminLogin }), p));
    store.put((await prisma.attachment.findUniqueOrThrow({ where: { id: signed.data.avatarId } })).storageKey, fileBytes("png", 64));
    expect((await patchUser(req(`/users/${karimId}`, { method: "PATCH", body: { avatarId: signed.data.avatarId }, login: adminLogin }), at(karimId))).status).toBe(200);
    expect((await patchUser(req(`/users/${karimId}`, { method: "PATCH", body: { avatarId: null }, login: adminLogin }), at(karimId))).status).toBe(200);
    store.reset();

    // auth.invite.revoked
    const other = await json(await createUserApi(req("/users", { body: { username: "salma", email: "salma@example.com", role: "OWNER" }, login: adminLogin }), p));
    expect((await revokeInvite(req(`/users/${other.data.user.id}/revoke-invite`, { method: "POST", login: adminLogin }), at(other.data.user.id))).status).toBe(204);

    const rows = await prisma.auditLog.findMany({ where: { id: { gt: lastIdBefore } } });
    const seen = new Set(rows.map((r) => r.action));
    const authActions = AUDIT_ACTIONS.filter((a) => a.startsWith("auth.") || a.startsWith("user."));
    expect(authActions).toHaveLength(18);
    for (const action of authActions) expect(seen.has(action), action).toBe(true);
    for (const r of rows.filter((r) => r.entityId === karimId)) {
      expect(r.ip, r.action).toBe("203.0.113.7");
      expect(r.userAgent, r.action).toBe("vitest-agent");
    }

    const dump = JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(dump).not.toMatch(/argon2|tokenHash|token_hash/);
    expect(dump).not.toContain(inviteToken);
    expect(dump).not.toContain(DEFAULT_PASSWORD);
    expect(dump).not.toContain("Second!pass-word-2");
    expect(dump).not.toContain(adminLogin.refreshToken);
  });

  it("lists auth/user actions newest first with filters and pagination", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const login = await loginAs(admin);
    const target = await createUser();
    await prisma.auditLog.createMany({
      data: [
        { action: "auth.login.success", entityType: "user", entityId: target.id, actorId: target.id },
        { action: "payout.created", entityType: "payout", entityId: "p1" },
        { action: "user.updated", entityType: "user", entityId: target.id, actorId: admin.id },
        { action: "auth.logout", entityType: "user", entityId: target.id, actorId: target.id },
      ],
    });
    // audit_logs is append-only, so rows from earlier tests exist: scope by entity.
    const res = await auditList(apiRequest(`/audit?category=auth&entityId=${target.id}`, { login }), p);
    expect(res.status).toBe(200);
    const items = (await json(res)).data.items;
    expect(items.map((i: { action: string }) => i.action)).toEqual(["auth.logout", "user.updated", "auth.login.success"]);
    expect(items[1].actorName).toBeTruthy();

    const byActor = await json(await auditList(apiRequest(`/audit?category=auth&entityId=${target.id}&actorId=${admin.id}`, { login }), p));
    expect(byActor.data.items.map((i: { action: string }) => i.action)).toEqual(["user.updated"]);

    const page1 = await json(await auditList(apiRequest(`/audit?entityId=${target.id}&limit=2`, { login }), p));
    expect(page1.data.items.map((i: { action: string }) => i.action)).toEqual(["auth.logout", "user.updated"]);
    const page2 = await json(await auditList(apiRequest(`/audit?entityId=${target.id}&limit=2&cursor=${page1.data.nextCursor}`, { login }), p));
    expect(page2.data.items.map((i: { action: string }) => i.action)).toEqual(["auth.login.success"]);
    expect(page2.data.nextCursor).toBeNull();
  });

  it("forbids Owners", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    const res = await auditList(apiRequest("/audit?category=auth", { login: await loginAs(owner) }), p);
    expect(res.status).toBe(403);
  });
});
