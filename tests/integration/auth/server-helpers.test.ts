import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../helpers/factory";
import { loginAs } from "../../helpers/http";

// lib/auth/server.ts is the page-loader side of auth; fake the Next request APIs.
const jar = new Map<string, string>();
const hdrs = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => ({ get: (name: string) => hdrs.get(name) ?? null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/root-params", () => ({ lang: async () => "en" }));

const { getViewer, requirePagePermission, requireViewer } = await import("@/lib/auth/server");

beforeEach(() => {
  jar.clear();
  hdrs.clear();
});

async function redirectOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as { url?: string }).url;
  }
  return undefined;
}

describe("page auth helpers", () => {
  it("returns the strictly validated viewer with permissions", async () => {
    const owner = await createUser({ roles: ["OWNER"], firstName: "Karim" });
    const login = await loginAs(owner);
    jar.set("bh_at", login.accessToken);
    const viewer = await getViewer();
    expect(viewer).toMatchObject({ id: owner.id, sessionId: login.sessionId, roles: ["OWNER"], firstName: "Karim" });
    expect(viewer!.permissions).toContain("profile.update.self");
  });

  it("returns null when the session was revoked, the user deactivated or token_version moved", async () => {
    const u = await createUser();
    const login = await loginAs(u);
    jar.set("bh_at", login.accessToken);
    await prisma.authSession.update({ where: { id: login.sessionId }, data: { revokedAt: new Date() } });
    expect(await getViewer()).toBeNull();
  });

  it("redirects anonymous visitors to the localized /login with the current path", async () => {
    hdrs.set("x-pathname", "/en/admin/users");
    expect(await redirectOf(requireViewer())).toBe("/en/login?next=%2Fen%2Fadmin%2Fusers");
    hdrs.set("x-pathname", "/en");
    expect(await redirectOf(requireViewer())).toBe("/en/login");
  });

  it("tries one refresh when a stale access token and a refresh cookie exist", async () => {
    const u = await createUser();
    const login = await loginAs(u);
    await prisma.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } } });
    jar.set("bh_at", login.accessToken);
    jar.set("bh_rt", login.refreshToken);
    hdrs.set("x-pathname", "/en/me");
    expect(await redirectOf(requireViewer())).toBe("/api/v1/auth/refresh?next=%2Fen%2Fme");
  });

  it("requirePagePermission returns null for a missing permission and the viewer otherwise", async () => {
    const owner = await createUser({ roles: ["OWNER"] });
    jar.set("bh_at", (await loginAs(owner)).accessToken);
    expect(await requirePagePermission("user.list")).toBeNull();
  });

  it("requirePagePermission returns the viewer when the permission is held", async () => {
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    jar.set("bh_at", (await loginAs(admin)).accessToken);
    expect(await requirePagePermission("user.list")).toMatchObject({ id: admin.id });
  });

  it("returns null for a deactivated user or a stale token_version", async () => {
    const u = await createUser();
    const login = await loginAs(u);
    jar.set("bh_at", login.accessToken);
    await prisma.user.update({ where: { id: u.id }, data: { status: "INACTIVE" } });
    expect(await getViewer()).toBeNull();

    const v = await createUser();
    const l2 = await loginAs(v);
    jar.set("bh_at", l2.accessToken);
    await prisma.user.update({ where: { id: v.id }, data: { tokenVersion: { increment: 1 } } });
    expect(await getViewer()).toBeNull();
  });
});
