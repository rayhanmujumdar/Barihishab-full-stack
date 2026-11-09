import { describe, expect, it } from "vitest";
import { GET as listUsers, POST as createUserApi } from "@/app/api/v1/users/route";
import { GET as getUser, PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";

const p = params({});

async function admin() {
  const a = await createUser({ roles: ["SUPER_ADMIN"], firstName: "Boss" });
  return { a, login: await loginAs(a) };
}

const valid = {
  username: "karim_01",
  email: "karim@example.com",
  firstName: "Karim",
  lastName: "Uddin",
  phone: "01712345678",
  role: "OWNER",
  locale: "bn",
  houseResponsibility: "Electricity bill",
};

describe("POST /api/v1/users", () => {
  it("creates an INVITED user with role, invite token, queued email and two audit rows", async () => {
    const { a, login } = await admin();
    const res = await createUserApi(apiRequest("/users", { body: valid, login }), p);
    expect(res.status).toBe(201);
    const { user } = (await json(res)).data;
    expect(user).toMatchObject({ username: "karim_01", status: "INVITED", roles: ["OWNER"], houseResponsibility: "Electricity bill" });

    expect(await prisma.authToken.count({ where: { userId: user.id, type: "INVITE", usedAt: null, revokedAt: null } })).toBe(1);
    const mail = await prisma.emailOutbox.findFirstOrThrow({ where: { toUserId: user.id } });
    expect(mail).toMatchObject({ template: "INVITE", locale: "bn" });
    expect((mail.payload as { invitedBy: string }).invitedBy).toBe("Boss");
    const actions = (await prisma.auditLog.findMany({ where: { entityId: user.id } })).map((r) => r.action).sort();
    expect(actions).toEqual(["auth.invite.sent", "user.created"]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).createdById).toBe(a.id);
  });

  it("rejects duplicate username or email in any case with 409", async () => {
    const { login } = await admin();
    await createUser({ username: "karim_01", email: "taken@example.com" });
    const dupUser = await createUserApi(apiRequest("/users", { body: { ...valid, username: "KARIM_01", email: "new@example.com" }, login }), p);
    expect(dupUser.status).toBe(409);
    expect((await json(dupUser)).error.code).toBe("USERNAME_TAKEN");
    const dupEmail = await createUserApi(apiRequest("/users", { body: { ...valid, username: "other", email: "TAKEN@example.com" }, login }), p);
    expect((await json(dupEmail)).error.code).toBe("EMAIL_TAKEN");
  });

  it("returns 422 with details.fields for invalid username and phone", async () => {
    const { login } = await admin();
    const res = await createUserApi(apiRequest("/users", { body: { ...valid, username: "Ka", phone: "12345" }, login }), p);
    expect(res.status).toBe(422);
    const fields = (await json(res)).error.details.fields;
    expect(fields).toHaveProperty("username");
    expect(fields).toHaveProperty("phone");
  });

  it("stores the phone as WhatsApp when whatsappSameAsPhone is set", async () => {
    const { login } = await admin();
    const res = await createUserApi(apiRequest("/users", { body: { ...valid, phone: "+8801712345678", whatsappSameAsPhone: true }, login }), p);
    expect((await json(res)).data.user.whatsapp).toBe("+8801712345678");
  });

  it("rejects roles not enabled in v1", async () => {
    const { login } = await admin();
    const res = await createUserApi(apiRequest("/users", { body: { ...valid, role: "ACCOUNTANT" }, login }), p);
    expect(res.status).toBe(422);
  });

  it("forbids Owners", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    const res = await createUserApi(apiRequest("/users", { body: valid, login: await loginAs(owner) }), p);
    expect(res.status).toBe(403);
    expect(await prisma.user.count({ where: { username: "karim_01" } })).toBe(0);
  });
});

describe("GET /api/v1/users", () => {
  it("searches name, username, email and phone", async () => {
    const { login } = await admin();
    const k = await createUser({ username: "karim", phone: "01711111111", firstName: "Karim" });
    await createUser({ username: "salma", phone: "01822222222", firstName: "Salma" });
    for (const q of ["0171", "KARIM", "karim@example"]) {
      const res = await listUsers(apiRequest(`/users?q=${encodeURIComponent(q)}`, { login }), p);
      expect(res.status).toBe(200);
      const ids = (await json(res)).data.items.map((u: { id: string }) => u.id);
      expect(ids, q).toEqual([k.id]);
    }
  });

  it("filters by role and status", async () => {
    const { login } = await admin();
    const inv = await createUser({ status: "INVITED", password: null });
    const st = await listUsers(apiRequest("/users?status=INVITED", { login }), p);
    expect((await json(st)).data.items.map((u: { id: string }) => u.id)).toEqual([inv.id]);
    const rl = await listUsers(apiRequest("/users?role=SUPER_ADMIN", { login }), p);
    expect((await json(rl)).data.items).toHaveLength(1);
  });

  it("paginates with a cursor and never returns secrets", async () => {
    const { login } = await admin();
    for (let i = 0; i < 59; i++) await createUser({ password: null });
    const first = await json(await listUsers(apiRequest("/users?limit=50", { login }), p));
    expect(first.data.items).toHaveLength(50);
    expect(first.data.nextCursor).toBeTruthy();
    const second = await json(await listUsers(apiRequest(`/users?limit=50&cursor=${first.data.nextCursor}`, { login }), p));
    expect(second.data.items).toHaveLength(10);
    expect(second.data.nextCursor).toBeNull();
    const all = new Set([...first.data.items, ...second.data.items].map((u: { id: string }) => u.id));
    expect(all.size).toBe(60);
    expect(JSON.stringify(first)).not.toMatch(/argon2|tokenHash|failedLoginCount|tokenVersion/);
    expect(first.data.activeSuperAdminCount).toBe(1);
  });

  it("returns one user or 404", async () => {
    const { login } = await admin();
    const u = await createUser();
    const res = await getUser(apiRequest(`/users/${u.id}`, { login }), params({ id: u.id }));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({ user: { id: u.id }, roles: ["OWNER"] });
    const missing = await getUser(apiRequest(`/users/00000000-0000-4000-8000-000000000000`, { login }), params({ id: "00000000-0000-4000-8000-000000000000" }));
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("lets an admin change a user's email and audits before/after", async () => {
    const { login } = await admin();
    const u = await createUser({ email: "old@example.com" });
    const res = await patchUser(apiRequest(`/users/${u.id}`, { method: "PATCH", body: { email: "new@example.com" }, login }), params({ id: u.id }));
    expect(res.status).toBe(200);
    expect((await json(res)).data.user.email).toBe("new@example.com");
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: u.id, action: "user.updated" } });
    expect(row.before).toEqual({ email: "old@example.com" });
    expect(row.after).toEqual({ email: "new@example.com" });
  });
});
