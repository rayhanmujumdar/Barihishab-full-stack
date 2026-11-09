import { describe, expect, it } from "vitest";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { revokeSession } from "@/lib/auth/session-service";
import { createUser } from "../../helpers/factory";
import { apiRequest, json, loginAs } from "../../helpers/http";

const listUsers = withAuth(async (_req, { auth }) => ok({ userId: auth.userId }), {
  permission: "user.list",
  strict: true,
});
const readMe = withAuth(async (_req, { auth }) => ok({ userId: auth.userId, permissions: auth.permissions }));
const mutateMe = withAuth(async () => ok({ done: true }), { permission: "profile.update.self" });

describe("withAuth guard", () => {
  it("returns 401 UNAUTHENTICATED without a token", async () => {
    const res = await readMe(apiRequest("/me"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 for a garbage token", async () => {
    const res = await readMe(apiRequest("/me", { cookie: "bh_at=garbage" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("ignores a shadow bh_at sent first (e.g. planted by the Swagger UI at /api/v1)", async () => {
    const user = await createUser({ roles: ["OWNER"] });
    const login = await loginAs(user);
    const shadow = `bh_at=${encodeURIComponent("(httpOnly cookie, sent by the browser)")}; `;
    const res = await readMe(apiRequest("/me", { cookie: shadow + login.cookie }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("passes the auth context with permissions to the handler", async () => {
    const user = await createUser({ roles: ["OWNER"] });
    const login = await loginAs(user);
    const res = await readMe(apiRequest("/me", { login }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.userId).toBe(user.id);
    expect(body.data.permissions).toContain("profile.update.self");
  });

  it("returns 403 FORBIDDEN when the permission is missing, without running the handler", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    const res = await listUsers(apiRequest("/users", { login: await loginAs(owner) }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.data).toBeUndefined();
  });

  it("strict mode rejects a revoked session even with an unexpired access token", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const login = await loginAs(admin);
    expect((await listUsers(apiRequest("/users", { login }), { params: Promise.resolve({}) })).status).toBe(200);
    await revokeSession(login.sessionId, "logout_all");
    const res = await listUsers(apiRequest("/users", { login }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("strict mode rejects a token whose token_version is stale", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const login = await loginAs(admin);
    await prisma.user.update({ where: { id: admin.id }, data: { tokenVersion: { increment: 1 } } });
    const res = await listUsers(apiRequest("/users", { login }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("strict mode rejects an inactive user", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const login = await loginAs(admin);
    await prisma.user.update({ where: { id: admin.id }, data: { status: "INACTIVE" } });
    const res = await listUsers(apiRequest("/users", { login }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("requires a valid CSRF token on mutations", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    const login = await loginAs(owner);
    const noCsrf = await mutateMe(apiRequest("/me", { method: "PATCH", body: {}, login, csrf: false }), { params: Promise.resolve({}) });
    expect(noCsrf.status).toBe(403);
    expect((await json(noCsrf)).error.code).toBe("CSRF_INVALID");
    const wrong = await mutateMe(apiRequest("/me", { method: "PATCH", body: {}, login, csrf: "bad" }), { params: Promise.resolve({}) });
    expect(wrong.status).toBe(403);
    const good = await mutateMe(apiRequest("/me", { method: "PATCH", body: {}, login }), { params: Promise.resolve({}) });
    expect(good.status).toBe(200);
  });

  it("hides internal errors behind 500 INTERNAL_ERROR", async () => {
    const boom = withAuth(async () => {
      throw new Error("db password=hunter2 leaked");
    });
    const owner = await createUser();
    const res = await boom(apiRequest("/me", { login: await loginAs(owner) }), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toContain("hunter2");
  });
});
