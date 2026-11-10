// Profile photo API (add-profile-photo): presign, /me, /users create & edit.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as presign from "@/app/api/v1/avatars/presign/route";
import * as file from "@/app/api/v1/attachments/[id]/file/route";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/me/route";
import { GET as listUsers, POST as createUserApi } from "@/app/api/v1/users/route";
import { PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
import { prisma } from "@/lib/prisma";
import { createProperty, createUser } from "../../helpers/factory";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";
import { apiRequest, json, loginAs, params, type Login } from "../../helpers/http";

const p = params({});
let store: ReturnType<typeof useFakeStorage>;
beforeEach(() => {
  store = useFakeStorage();
});
afterEach(() => store.reset());

async function world() {
  const property = await createProperty();
  const admin = await createUser({ roles: ["SUPER_ADMIN"], firstName: "Boss" });
  const owner = await createUser({ roles: ["OWNER"], phone: "01712345678" });
  return { property, admin, owner, adminLogin: await loginAs(admin), ownerLogin: await loginAs(owner) };
}

const presignReq = (login: Login, body: Record<string, unknown>, opts: { csrf?: boolean } = {}) =>
  presign.POST(apiRequest("/avatars/presign", { login, body, csrf: opts.csrf }), p);

/** Presign through the API and "PUT" the bytes; returns the avatarId. */
async function photo(login: Login, kind: "png" | "pdf" = "png") {
  const res = await presignReq(login, { fileName: "me.png", mime: "image/png", size: 64 });
  expect(res.status).toBe(201);
  const { avatarId } = (await json(res)).data;
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id: avatarId } });
  store.put(row.storageKey, fileBytes(kind, 64));
  return avatarId as string;
}

const patch = (login: Login, body: Record<string, unknown>) => patchMe(apiRequest("/me", { method: "PATCH", body, login }), p);
const fileOf = (login: Login, url: string) => {
  const id = url.split("/")[4];
  return file.GET(apiRequest(`/attachments/${id}/file`, { login }), params({ id }));
};

describe("POST /api/v1/avatars/presign", () => {
  it("gives an Owner a presigned PUT for a JPEG photo", async () => {
    const w = await world();
    const res = await presignReq(w.ownerLogin, { fileName: "me.jpg", mime: "image/jpeg", size: 180000 });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data).toMatchObject({ avatarId: expect.any(String), uploadUrl: expect.stringContaining("/avatar/"), headers: { "Content-Type": "image/jpeg" }, expiresAt: expect.any(String) });
    const { uploadUrl, ...rest } = body.data;
    expect(uploadUrl).toBeTruthy();
    expect(JSON.stringify(rest)).not.toContain("s3.test");
  });

  it("rejects PDFs (422) and photos over 2 MB (413)", async () => {
    const w = await world();
    const pdf = await presignReq(w.ownerLogin, { fileName: "x.pdf", mime: "application/pdf", size: 100 });
    expect(pdf.status).toBe(422);
    expect((await json(pdf)).error.details.fields.mime).toBeTruthy();
    const big = await presignReq(w.ownerLogin, { fileName: "x.jpg", mime: "image/jpeg", size: 3_000_000 });
    expect(big.status).toBe(413);
    expect((await json(big)).error.code).toBe("FILE_TOO_LARGE");
  });

  it("needs a session and the CSRF header", async () => {
    const w = await world();
    expect((await presign.POST(apiRequest("/avatars/presign", { body: { fileName: "a.png", mime: "image/png", size: 10 } }), p)).status).toBe(401);
    expect((await presignReq(w.ownerLogin, { fileName: "a.png", mime: "image/png", size: 10 }, { csrf: false })).status).toBe(403);
  });

  it("is rate limited per user like bill presigns", async () => {
    const w = await world();
    for (let i = 0; i < 30; i++) expect((await presignReq(w.ownerLogin, { fileName: "a.png", mime: "image/png", size: 10 })).status).toBe(201);
    const res = await presignReq(w.ownerLogin, { fileName: "a.png", mime: "image/png", size: 10 });
    expect(res.status).toBe(429);
  });
});

describe("PATCH /api/v1/me avatarId", () => {
  it("lets an Owner set, replace and remove their own photo", async () => {
    const w = await world();
    const p1 = await photo(w.ownerLogin);
    const set = await patch(w.ownerLogin, { avatarId: p1 });
    expect(set.status).toBe(200);
    const url1 = (await json(set)).data.profile.avatarUrl as string;
    expect(url1).toBe(`/api/v1/attachments/${p1}/file`);
    expect((await fileOf(w.ownerLogin, url1)).status).toBe(200);

    const p2 = await photo(w.ownerLogin);
    const replaced = await patch(w.ownerLogin, { avatarId: p2 });
    expect((await json(replaced)).data.profile.avatarUrl).toBe(`/api/v1/attachments/${p2}/file`);
    expect((await fileOf(w.ownerLogin, url1)).status).toBe(404);

    const removed = await patch(w.ownerLogin, { avatarId: null });
    expect(removed.status).toBe(200);
    expect((await json(removed)).data.profile.avatarUrl).toBeNull();
    const actions = (await prisma.auditLog.findMany({ where: { entityId: w.owner.id, action: { startsWith: "user.avatar" } }, orderBy: { createdAt: "asc" } })).map((r) => r.action);
    expect(actions).toEqual(["user.avatar.updated", "user.avatar.updated", "user.avatar.removed"]);
    // The photo change never lands in the generic user.updated diff.
    expect(await prisma.auditLog.count({ where: { entityId: w.owner.id, action: "user.updated" } })).toBe(0);
  });

  it("shows avatarUrl on GET /me", async () => {
    const w = await world();
    await patch(w.ownerLogin, { avatarId: await photo(w.ownerLogin) });
    expect((await json(await getMe(apiRequest("/me", { login: w.ownerLogin }), p))).data.profile.avatarUrl).toMatch(/^\/api\/v1\/attachments\//);
  });

  it("rolls back the photo when another field fails validation", async () => {
    const w = await world();
    const id = await photo(w.ownerLogin);
    const res = await patch(w.ownerLogin, { avatarId: id, phone: "12345" });
    expect(res.status).toBe(422);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } });
    expect(user).toMatchObject({ avatarAttachmentId: null, phone: "01712345678" });
  });

  it("rejects spoofed bytes and someone else's upload with details.fields.avatarId", async () => {
    const w = await world();
    const spoofed = await photo(w.ownerLogin, "pdf");
    const a = await patch(w.ownerLogin, { avatarId: spoofed });
    expect(a.status).toBe(422);
    expect((await json(a)).error.details.fields.avatarId).toBeTruthy();

    const theirs = await photo(w.adminLogin);
    const b = await patch(w.ownerLogin, { avatarId: theirs });
    expect(b.status).toBe(422);
    expect((await json(b)).error.details.fields.avatarId).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } })).avatarAttachmentId).toBeNull();
  });
});

const newUser = { username: "karim_01", email: "karim@example.com", firstName: "Karim", phone: "01712345678", role: "OWNER", locale: "bn" };

describe("Super Admin sets a user's photo", () => {
  it("creates an INVITED user with a photo", async () => {
    const w = await world();
    const avatarId = await photo(w.adminLogin);
    const res = await createUserApi(apiRequest("/users", { body: { ...newUser, avatarId }, login: w.adminLogin }), p);
    expect(res.status).toBe(201);
    const { user } = (await json(res)).data;
    expect(user).toMatchObject({ status: "INVITED", avatarUrl: `/api/v1/attachments/${avatarId}/file` });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "user.avatar.updated" } });
    expect(log.actorId).toBe(w.admin.id);
  });

  it("creates nothing and queues no invite when the photo fails verification", async () => {
    const w = await world();
    const avatarId = await photo(w.adminLogin, "pdf");
    const res = await createUserApi(apiRequest("/users", { body: { ...newUser, avatarId }, login: w.adminLogin }), p);
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fields.avatarId).toBeTruthy();
    expect(await prisma.user.count({ where: { username: "karim_01" } })).toBe(0);
    expect(await prisma.emailOutbox.count({ where: { template: "INVITE", toEmail: "karim@example.com" } })).toBe(0);
  });

  it("lets a Super Admin replace and remove an Owner's photo", async () => {
    const w = await world();
    const avatarId = await photo(w.adminLogin);
    const set = await patchUser(apiRequest(`/users/${w.owner.id}`, { method: "PATCH", body: { avatarId }, login: w.adminLogin }), params({ id: w.owner.id }));
    expect(set.status).toBe(200);
    expect((await json(set)).data.user.avatarUrl).toBe(`/api/v1/attachments/${avatarId}/file`);
    const removed = await patchUser(apiRequest(`/users/${w.owner.id}`, { method: "PATCH", body: { avatarId: null }, login: w.adminLogin }), params({ id: w.owner.id }));
    expect(removed.status).toBe(200);
    expect((await json(removed)).data.user.avatarUrl).toBeNull();
  });

  it("forbids an Owner from setting another user's photo", async () => {
    const w = await world();
    const avatarId = await photo(w.ownerLogin);
    const res = await patchUser(apiRequest(`/users/${w.admin.id}`, { method: "PATCH", body: { avatarId }, login: w.ownerLogin }), params({ id: w.admin.id }));
    expect(res.status).toBe(403);
  });

  it("includes avatarUrl in the user list", async () => {
    const w = await world();
    await patch(w.ownerLogin, { avatarId: await photo(w.ownerLogin) });
    const res = await listUsers(apiRequest("/users", { login: w.adminLogin }), p);
    const items = (await json(res)).data.items as { id: string; avatarUrl: string | null }[];
    expect(items.find((u) => u.id === w.owner.id)?.avatarUrl).toMatch(/^\/api\/v1\/attachments\//);
    expect(items.find((u) => u.id === w.admin.id)?.avatarUrl).toBeNull();
  });
});
