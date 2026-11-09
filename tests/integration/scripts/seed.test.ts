import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/scripts/seed";
import { inspectToken } from "@/lib/auth/token-service";

const env = { SEED_ADMIN_EMAIL: "Admin@Example.com", SEED_ADMIN_USERNAME: "bookkeeper" };

async function counts() {
  return {
    users: await prisma.user.count(),
    tokens: await prisma.authToken.count(),
    outbox: await prisma.emailOutbox.count(),
    properties: await prisma.property.count(),
    roles: await prisma.userRole.count(),
  };
}

describe("seed (BOOT-01/02)", () => {
  it("creates the property and exactly one invited Super Admin with a working invite link", async () => {
    const result = await runSeed(env);
    expect(result.created).toBe(true);
    expect(await counts()).toEqual({ users: 1, tokens: 1, outbox: 1, properties: 1, roles: 1 });

    const admin = await prisma.user.findFirstOrThrow({ include: { roles: true } });
    expect(admin).toMatchObject({ username: "bookkeeper", email: "admin@example.com", status: "INVITED" });
    expect(admin.roles.map((r) => r.role)).toEqual(["SUPER_ADMIN"]);

    expect(result.inviteUrl).toMatch(/\/bn\/invite\/[A-Za-z0-9_-]{43}$/);
    const token = result.inviteUrl!.split("/").pop()!;
    expect((await inspectToken(token, "INVITE")).status).toBe("VALID");
  });

  it("is idempotent: a second run changes nothing", async () => {
    await runSeed(env);
    const before = await counts();
    const again = await runSeed(env);
    expect(again.created).toBe(false);
    expect(await counts()).toEqual(before);
  });

  it("fails clearly when env vars are missing", async () => {
    await expect(runSeed({ SEED_ADMIN_EMAIL: "", SEED_ADMIN_USERNAME: "x" })).rejects.toThrow(/SEED_ADMIN_EMAIL/);
    await expect(runSeed({ SEED_ADMIN_EMAIL: "a@b.co" })).rejects.toThrow(/SEED_ADMIN_USERNAME/);
    await expect(runSeed({ SEED_ADMIN_EMAIL: "a@b.co", SEED_ADMIN_USERNAME: "Bad Name" })).rejects.toThrow(/SEED_ADMIN_USERNAME/);
    expect((await counts()).users).toBe(0);
  });
});
