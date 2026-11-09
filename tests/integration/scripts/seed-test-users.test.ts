import { describe, expect, it } from "vitest";
import { verifyUserPassword } from "@/lib/auth/credentials";
import { prisma } from "@/lib/prisma";
import { runTestUserSeed, TEST_USERS } from "@/scripts/seed-test-users";
import { createOwner, createProperty, createShareSet, createUser } from "../../helpers/factory";

const OWNER_COUNT = TEST_USERS.filter((u) => u.owner).length;

async function counts() {
  return {
    users: await prisma.user.count(),
    roles: await prisma.userRole.count(),
    owners: await prisma.owner.count(),
    shareSets: await prisma.shareSet.count(),
  };
}

describe("seed:test-users", () => {
  it("creates one ACTIVE login per test user with the shared password", async () => {
    const result = await runTestUserSeed({});
    expect(result.users).toHaveLength(TEST_USERS.length);
    expect(result.password.length).toBeGreaterThanOrEqual(16); // random per run when not pinned

    for (const u of TEST_USERS) {
      const user = await prisma.user.findUniqueOrThrow({ where: { username: u.username }, include: { roles: true } });
      expect(user.status).toBe("ACTIVE");
      expect(user.roles.map((r) => r.role).sort()).toEqual([...u.roles].sort());
      expect((await verifyUserPassword(user.id, result.password)).valid).toBe(true);
    }
  });

  it("links owners to OWNER logins and gives them units while keeping existing owners' units", async () => {
    const property = await createProperty();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const existing = await createOwner(property.id, { displayName: "Existing Owner" });
    await createShareSet(property.id, admin.id, "2026-01", { [existing.id]: 40 });

    const result = await runTestUserSeed({});
    expect(result.shareSetCreated).toBe(true);

    const owners = await prisma.owner.findMany({ where: { userId: { not: null } }, include: { user: true } });
    expect(owners).toHaveLength(OWNER_COUNT);
    const active = await prisma.shareSet.findFirstOrThrow({ where: { replacedAt: null }, orderBy: { effectiveFrom: "desc" }, include: { items: true } });
    const units = Object.fromEntries(active.items.map((i) => [i.ownerId, i.units]));
    expect(units[existing.id]).toBe(40);
    for (const o of owners) expect(units[o.id]).toBe(TEST_USERS.find((u) => u.username === o.user!.username)!.owner!.units);
  });

  it("is idempotent and resets a locked/changed test user", async () => {
    await runTestUserSeed({});
    const before = await counts();
    await prisma.user.update({ where: { username: "test.viewer" }, data: { status: "INACTIVE", failedLoginCount: 9 } });

    const again = await runTestUserSeed({});
    expect(again.users.every((u) => !u.created)).toBe(true);
    expect(again.shareSetCreated).toBe(false);
    expect(await counts()).toEqual(before);
    expect(await prisma.user.findUniqueOrThrow({ where: { username: "test.viewer" } })).toMatchObject({ status: "ACTIVE", failedLoginCount: 0 });
  });

  it("uses a pinned password from TEST_USERS_PASSWORD", async () => {
    const result = await runTestUserSeed({ TEST_USERS_PASSWORD: "pinned-local-pass-123" });
    expect(result.password).toBe("pinned-local-pass-123");
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: "test.admin" } });
    expect((await verifyUserPassword(admin.id, "pinned-local-pass-123")).valid).toBe(true);
    await expect(runTestUserSeed({ TEST_USERS_PASSWORD: "short" })).rejects.toThrow(/at least 12/);
  });

  it("refuses to run in production", async () => {
    await expect(runTestUserSeed({ NODE_ENV: "production" })).rejects.toThrow(/production/);
  });

  it("refuses a non-local database unless explicitly allowed", async () => {
    const before = await counts();
    const remote = "postgresql://u:p@db.example.com:5432/barihishab";
    await expect(runTestUserSeed({ DATABASE_URL: remote })).rejects.toThrow(/local database/);
    await expect(runTestUserSeed({ DATABASE_URL: "not a url" })).rejects.toThrow(/local database/);
    expect(await counts()).toEqual(before);
    // An explicit opt-in still works (e.g. a disposable staging box).
    await expect(runTestUserSeed({ DATABASE_URL: remote, ALLOW_TEST_USERS_SEED: "true" })).resolves.toMatchObject({ users: expect.any(Array) });
  });
});
